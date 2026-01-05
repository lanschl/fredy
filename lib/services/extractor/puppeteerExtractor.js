import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { debug, DEFAULT_HEADER, botDetected, getRandomUserAgent } from './utils.js';
import logger from '../logger.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

puppeteer.use(StealthPlugin());

export default async function execute(url, waitForSelector, options) {
  let browser;
  let page;
  let result = null;
  let userDataDir;
  let removeUserDataDir = false;
  try {
    debug(`Sending request to ${url} using Puppeteer.`);

    // Prepare a dedicated temporary userDataDir to avoid leaking /tmp/.org.chromium.* dirs
    if (options && options.userDataDir) {
      userDataDir = options.userDataDir;
      removeUserDataDir = !!options.cleanupUserDataDir;
    } else {
      const prefix = path.join(os.tmpdir(), 'puppeteer-fredy-');
      userDataDir = fs.mkdtempSync(prefix);
      removeUserDataDir = true;
    }

    browser = await puppeteer.launch({
      headless: options.puppeteerHeadless ?? true,
      args: [
        '--no-sandbox',
        '--disable-gpu',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-crash-reporter',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1920,1080',
      ],
      timeout: options.puppeteerTimeout || 30_000,
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

    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
    });

    // Random delay to mimic human behavior
    const randomDelay = Math.floor(Math.random() * 3000) + 2000;
    await new Promise((r) => setTimeout(r, randomDelay));

    // Simulate mouse movement
    try {
      await page.mouse.move(Math.random() * width, Math.random() * height);
    } catch (e) {
      // ignore
    }
    let pageSource;
    // if we're extracting data from a SPA, we must wait for the selector
    if (waitForSelector != null) {
      const selectorTimeout = options?.puppeteerSelectorTimeout ?? options?.puppeteerTimeout ?? 30_000;
      await page.waitForSelector(waitForSelector, { timeout: selectorTimeout });
    }

    pageSource = await page.content();

    const statusCode = response.status();

    if (botDetected(pageSource, statusCode)) {
      logger.warn('We have been detected as a bot :-/ Tried url: => ', url);
      result = null;
    } else {
      result = pageSource || (await page.content());
      try {
        const debugFile = path.resolve(process.cwd(), 'immowelt_puppeteer_success_debug.html');
        fs.writeFileSync(debugFile, result);
        logger.info(`Saved success debug HTML to ${debugFile}`);
      } catch (debugError) {
        logger.error('Failed to save success debug HTML', debugError);
      }
    }
  } catch (error) {
    logger.warn('Error executing with puppeteer executor', error);
    if (page) {
      try {
        const debugContent = await page.content();
        const debugFile = path.resolve(process.cwd(), 'immowelt_puppeteer_debug_output.html');
        fs.writeFileSync(debugFile, debugContent);
        logger.error(`Saved debug HTML to ${debugFile}`);
      } catch (debugError) {
        logger.error('Failed to save debug HTML', debugError);
      }
    }
    result = null;
  } finally {
    try {
      if (page) {
        await page.close();
      }
    } catch {
      // ignore
    }
    try {
      if (browser != null) {
        await browser.close();
      }
    } catch {
      // ignore
    }
    try {
      if (removeUserDataDir && userDataDir) {
        await fs.promises.rm(userDataDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  }
  return result;
}
