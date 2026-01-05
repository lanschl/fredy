/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { buildHash, isOneOf, extractNumber } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import logger from '../services/logger.js';
import Extractor from '../services/extractor/extractor.js';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { DEFAULT_HEADER, getRandomUserAgent } from '../services/extractor/utils.js';
import { loadParser } from '../services/extractor/parser/parser.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

puppeteer.use(StealthPlugin());

let appliedBlackList = [];

function normalize(o) {
  const rawSizeString = o.size; // e.g. "3,5 Zimmer·73 m²·3. Geschoss"
  const rawPriceString = o.price; // e.g. "279.000 € 3.822 €/m²"

  // -- Parse Price --
  let numeric_price = null;
  let price = o.price;
  if (rawPriceString) {
    // Strategy: Split by '€' to get the main price part first.
    // "279.000 € 3.822 €/m²" -> ["279.000 ", " 3.822 ", "/m²"]
    const priceParts = rawPriceString.split('€');
    if (priceParts.length > 0) {
      // Remove dots (thousands separator) before parsing
      const priceVal = priceParts[0].replace(/\./g, '');
      numeric_price = extractNumber(priceVal);
    }
    // Clean up the display string if desired, or keep raw.
    // User asked to "clean up data", but usually we keep 'price' as the string representation.
    // Let's remove the "Kaufpreis " prefix if it exists in raw for the display string.
    price = rawPriceString.replace('Kaufpreis ', '');
  }

  // -- Parse Size & Rooms --
  let numeric_size = null;
  let numeric_rooms = null;
  let size = o.size != null ? o.size.replace('Wohnfläche ', '') : 'N/A m²';

  if (rawSizeString) {
    // "3,5 Zimmer·73 m²·3. Geschoss"
    const parts = rawSizeString.split('·').map(s => s.trim());

    // Attempt to identify parts by content
    for (const part of parts) {
      if (part.includes('Zimmer')) {
        // "3,5 Zimmer" -> 3.5
        numeric_rooms = extractNumber(part.replace('Zimmer', ''));
      } else if (part.includes('m²')) {
        // "73 m²" -> 73 (strip dots just in case of >1000m² listings)
        numeric_size = extractNumber(part.replace('m²', '').replace(/\./g, ''));
      }
    }
  }

  // Fallback if size string format was different (just in case)
  if (numeric_size === null && size !== 'N/A m²') {
    numeric_size = extractNumber(size.replace(/\./g, ''));
  }

  // -- Calculate Price per Sqm --
  let price_per_sqm = null;
  if (numeric_price && numeric_size && numeric_size > 0) {
    price_per_sqm = parseFloat((numeric_price / numeric_size).toFixed(2));
  }

  const address = o.address;
  const title = o.title || 'No title available';
  const link = o.link != null ? o.link : config.url;
  const id = buildHash(title, price); // ID based on title+price? Might be unstable if price changes. 

  return Object.assign(o, {
    id,
    address,
    price,
    size,
    title,
    link,
    // Standardized Raw Fields
    numeric_price,
    numeric_size,
    numeric_rooms,
    price_per_sqm
  });
}

function applyBlacklist(o) {
  const titleNotBlacklisted = !isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !isOneOf(o.description, appliedBlackList);
  return titleNotBlacklisted && descNotBlacklisted;
}

async function getListings(url) {
  const allListings = [];
  let pageNumber = 1;
  const MAX_PAGES = 10; // Safety limit

  let browser;
  let page;
  let userDataDir;
  let removeUserDataDir = false;

  try {
    // Prepare a dedicated temporary userDataDir
    const prefix = path.join(os.tmpdir(), 'puppeteer-fredy-immowelt-');
    userDataDir = fs.mkdtempSync(prefix);
    removeUserDataDir = true;

    browser = await puppeteer.launch({
      headless: 'new', // or true, depending on preference/version
      args: [
        '--no-sandbox',
        '--disable-gpu',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-crash-reporter',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1920,1080',
      ],
      // time out a bit longer for initial load
      timeout: 60_000,
      userDataDir,
    });

    page = await browser.newPage();

    // Randomize viewport
    const width = 1920 + Math.floor(Math.random() * 100);
    const height = 1080 + Math.floor(Math.random() * 100);
    await page.setViewport({ width, height });

    // Set random User-Agent
    const userAgent = getRandomUserAgent();
    await page.setUserAgent(userAgent);
    await page.setExtraHTTPHeaders({ ...DEFAULT_HEADER, 'User-Agent': userAgent });

    logger.debug(`Fetching Immowelt initial url: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Handle initial cookie consent or captcha if necessary?
    // For now assuming we just land on the list.
    // Random delay
    await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 2000) + 1000));

    // 1. Process initial page (Page 1)
    logger.debug(`Processing Immowelt page 1...`);

    // Initial scrape of page 1
    // We wait for the list container to ensure content is loaded
    try {
      await page.waitForSelector(config.crawlContainer, { timeout: 10000 });
    } catch (error) {
      logger.warn(`Timeout waiting for crawl container on page 1. Content might be empty: ${error.message}`);
    }

    let content = await page.content();
    loadParser(content);

    let extractor = new Extractor();
    extractor.responseText = content;
    let currentPageListings = extractor.parseResponseText(config.crawlContainer, config.crawlFields, url);

    if (currentPageListings && currentPageListings.length > 0) {
      allListings.push(...currentPageListings);
      logger.debug(`Found ${currentPageListings.length} listings on page 1.`);
    } else {
      logger.debug(`No listings found on page 1.`);
    }

    // 2. Iterate for subsequent pages
    for (pageNumber = 2; pageNumber <= MAX_PAGES; pageNumber++) {
      logger.debug(`Attempting to navigate to Immowelt page ${pageNumber}...`);

      // Selector for the specific next page button, e.g. "zu seite 2"
      const nextPageButtonSelector = `button[aria-label="zu seite ${pageNumber}"]`;

      try {
        const nextPageButton = await page.$(nextPageButtonSelector);
        if (!nextPageButton) {
          logger.debug(`Page ${pageNumber} button not found. Stopping pagination.`);
          break;
        }

        logger.debug(`Found button for page ${pageNumber}. Clicking...`);
        await nextPageButton.click();

        // Wait for the button to become active (aria-current="page")
        // The aria-label might change to "aktuelle seite, seite X" but aria-current="page" is reliable.
        // We look for a button that contains the text of the page number AND has aria-current="page"
        // Or simpler: wait for the specific expected active state.
        // Because DOM might rerender, we wait for the *new* element state.

        await page.waitForFunction(
          (pageNum) => {
            const activeBtn = document.querySelector('button[aria-current="page"]');
            return activeBtn && activeBtn.textContent.trim() === String(pageNum);
          },
          { timeout: 10000 },
          pageNumber
        );

        logger.debug(`Successfully navigated to page ${pageNumber}.`);

        // Small random delay for safety/human-like behavior
        await new Promise((r) => setTimeout(r, 1000 + Math.random() * 2000));

        // Scrape the new page
        try {
          await page.waitForSelector(config.crawlContainer, { timeout: 5000 });
        } catch (error) {
          logger.debug(`Timeout waiting for crawl container on page ${pageNumber}: ${error.message}`);
        }

        content = await page.content();
        loadParser(content); // Update global parser with new content

        extractor = new Extractor();
        extractor.responseText = content;
        currentPageListings = extractor.parseResponseText(config.crawlContainer, config.crawlFields, url);

        if (currentPageListings && currentPageListings.length > 0) {
          allListings.push(...currentPageListings);
          logger.debug(`Found ${currentPageListings.length} listings on page ${pageNumber}.`);
        } else {
          logger.debug(`No listings found on page ${pageNumber}.`);
        }
      } catch (err) {
        logger.error(`Error navigating/processing page ${pageNumber}: ${err.message}`);
        break; // Stop if navigation fails
      }
    }
  } catch (error) {
    logger.error('Error during Immowelt pagination:', error);
  } finally {
    if (browser) await browser.close();
    if (removeUserDataDir && userDataDir) {
      try {
        fs.rmSync(userDataDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }

  return allListings;
}

const config = {
  url: null,
  crawlContainer: 'div[data-testid^="classified-card-mfe-"]',
  sortByDateParam: 'order=DateDesc',
  waitForSelector: 'div[data-testid^="classified-card-mfe-"]',
  crawlFields: {
    id: 'a[data-testid="card-mfe-covering-link-testid"]@href',
    price: 'div[data-testid="cardmfe-price-testid"] | removeNewline | trim',
    size: 'div[data-testid="cardmfe-keyfacts-testid"] | removeNewline | trim',
    title: 'a[data-testid="card-mfe-covering-link-testid"]@title',
    link: 'a[data-testid="card-mfe-covering-link-testid"]@href',
    description: 'div[data-testid="cardmfe-description-text-test-id"] > div:nth-of-type(2) | removeNewline | trim',
    address: 'div[data-testid="cardmfe-description-box-address"] | removeNewline | trim',
    image: 'div[data-testid="cardmfe-picture-box-opacity-layer-test-id"] img@src',
  },
  normalize: normalize,
  filter: applyBlacklist,
  activeTester: checkIfListingIsActive,
  getListings: getListings,
};

export const init = (sourceConfig, blacklist) => {
  config.enabled = sourceConfig.enabled;
  config.url = sourceConfig.url;
  appliedBlackList = blacklist || [];
  logger.info('Immowelt provider initialized with URL:', config.url);
};

export const metaInformation = {
  name: 'Immowelt',
  baseUrl: 'https://www.immowelt.de/',
  id: 'immowelt',
};

export { config };
