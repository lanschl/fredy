import logger from '../logger.js';

let debuggingOn = false;

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
];

export const getRandomUserAgent = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

export const DEFAULT_HEADER = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
  Connection: 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'User-Agent': getRandomUserAgent(),
};

export const setDebug = (options) => {
  debuggingOn = !!options?.debug;
};

export const debug = (message) => {
  if (debuggingOn) {
    logger.debug(message);
  }
};

export const botDetected = (pageSource, statusCode) => {
  const suspiciousStatusCodes = [403, 429];
  const botDetectionPatterns = [/verify you are human/i, /access denied/i, /x-amz-cf-id/i];

  const detectedInSource = botDetectionPatterns.some((pattern) => pattern.test(pageSource));
  const detectedByStatus = suspiciousStatusCodes.includes(statusCode);

  return detectedInSource || detectedByStatus;
};
