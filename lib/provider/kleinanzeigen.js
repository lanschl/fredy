import { buildHash, isOneOf, extractNumber, nullOrEmpty } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import logger from '../services/logger.js';
import * as cheerio from 'cheerio';

let appliedBlackList = [];
let appliedBlacklistedDistricts = [];

/**
 * Fetches the detail page for a single Kleinanzeigen ad and scrapes its content.
 * @param {string} url - The absolute URL to the ad's detail page.
 * @returns {Promise<object|null>} A structured object with the listing's data, or null on error.
 */
async function getListingDetails(url) {
  try {
    //logger.debug(`Fetching details from: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      logger.error(`Failed to fetch Kleinanzeigen detail page ${url}: ${response.statusText}`);
      return null;
    }
    const html = await response.text();
    const $ = cheerio.load(html);

    const adId = $('#viewad-ad-id-box').text().trim().replace('Anzeigennr. ', '');
    const title = $('#viewad-title').text().trim();
    const priceText = $('h2#viewad-price').text().trim();

    // --- Extract details from the key-value list ---
    const details = {};
    $('li.addetailslist--detail').each((i, el) => {
      const key = $(el).contents().first().text().trim().replace(':', '');
      const value = $(el).find('.addetailslist--detail--value').text().trim();
      if (key && value) {
        details[key] = value;
      }
    });

    // --- Extract features from the checklist ---
    const features = {};
    $('ul.checktaglist li.checktag').each((i, el) => {
      const featureText = $(el).text().trim().toLowerCase();
      features[featureText] = true;
    });

    // --- DEBUGGING STEP 1: Log the scraped details ---
    //logger.debug({ message: `Scraped raw details for ${adId}`, details, features });

    // --- Extract address and published date ---
    const address_full = $('#viewad-locality').text().trim();
    const published_text = $('#viewad-extra-info > div:first-child > span').text().trim();

    // --- Parse and structure the data ---
    let numeric_price = null;
    if (priceText && !priceText.toLowerCase().includes('vb')) {
      const priceString = priceText.replace(/\./g, '');
      numeric_price = extractNumber(priceString);
    }

    const numeric_size = extractNumber(details['Wohnfläche']);
    const numeric_rooms = extractNumber(details['Zimmer']);
    const year_built = extractNumber(details['Baujahr']);
    const service_charge = extractNumber(details['Hausgeld']);

    let price_per_sqm = null;
    if (numeric_price && numeric_price > 0 && numeric_size && numeric_size > 0) {
      price_per_sqm = parseFloat((numeric_price / numeric_size).toFixed(2));
    }

    return {
      id: adId,
      title: title,
      link: url,
      address_full: address_full,
      price: priceText,
      size: details['Wohnfläche'],

      // --- New structured fields ---
      numeric_price,
      numeric_size,
      price_per_sqm,
      numeric_rooms,
      year_built,
      flat_type: details['Wohnungstyp'],
      condition: details['Objektzustand'],
      service_charge,

      // Flags from features
      has_balcony: features['balkon'] || false,
      has_kitchen: features['einbauküche'] || false,
      has_cellar: features['keller'] || false,
      has_lift: features['aufzug'] || false,
      is_barrier_free: features['stufenloser zugang'] || false,

      // Other metadata
      published_text,
    };
  } catch (error) {
    logger.error(`Error processing Kleinanzeigen detail page ${url}:`, error);
    return null;
  }
}

/**
 * Fetches the list of ads from the search results page and enriches them with details.
 * @param {string} url - The URL of the Kleinanzeigen search.
 * @returns {Promise<object[]>} A list of listings.
 */
async function getListings(url) {
  logger.debug(`Fetching Kleinanzeigen overview page: ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    logger.error(`Failed to fetch Kleinanzeigen overview page: ${response.statusText}`);
    return [];
  }
  logger.debug('Successfully fetched Kleinanzeigen overview page.');
  const html = await response.text();
  const $ = cheerio.load(html);

  const listingPromises = [];
  const adItems = $('#srchrslt-adtable .ad-listitem');

  //logger.debug(`Found ${adItems.length} potential ad items on the page.`);

  adItems.each((i, el) => {
    const linkElement = $(el).find('.aditem-main .text-module-begin a');
    const relativeUrl = linkElement.attr('href');
    if (relativeUrl) {
      const absoluteUrl = new URL(relativeUrl, metaInformation.baseUrl).href;
      //logger.debug(`[Item ${i + 1}] Found link: ${absoluteUrl}`);
      listingPromises.push(getListingDetails(absoluteUrl));
    }
  });

  const listings = await Promise.all(listingPromises);
  logger.debug(`Finished processing all detail pages. Returning ${listings.length} valid listings.`);
  return listings.filter((listing) => listing && !nullOrEmpty(listing.id));
}

function normalize(o) {
  // The main data processing now happens in getListingDetails.
  // The `id` from getListingDetails is the provider's original ID.
  // The pipeline and storage will handle the rest.
  return o;
}

function applyBlacklist(o) {
  const titleNotBlacklisted = !isOneOf(o.title, appliedBlackList);
  const isBlacklistedDistrict =
    appliedBlacklistedDistricts.length === 0 ? false : isOneOf(o.address_full, appliedBlacklistedDistricts);

  const passes = !nullOrEmpty(o.title) && !isBlacklistedDistrict && titleNotBlacklisted && !nullOrEmpty(o.id);
  return passes;
}

const config = {
  url: null,
  sortByDateParam: null,
  getListings: getListings,
  normalize: normalize,
  filter: applyBlacklist,
  activeTester: checkIfListingIsActive,
};
export const metaInformation = {
  name: 'Kleinanzeigen',
  baseUrl: 'https://www.kleinanzeigen.de/',
  id: 'kleinanzeigen',
};
export const init = (sourceConfig, blacklist, blacklistedDistricts) => {
  config.enabled = sourceConfig.enabled;
  config.url = sourceConfig.url;
  appliedBlacklistedDistricts = blacklistedDistricts || [];
  appliedBlackList = blacklist || [];
};
export { config };
