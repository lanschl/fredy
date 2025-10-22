import { buildHash, isOneOf, extractNumber } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import logger from '../services/logger.js';

let appliedBlackList = [];

function normalize(o) {
  //logger.debug({ message: 'Raw scraped data from Immowelt', data: o });

  let numeric_price = null;
  let price_per_sqm = null;
  let numeric_size = null;
  let numeric_rooms = null;

  // --- PARSE PRICE STRING ---
  // Example: '225.000 € 3.629 €/m²'
  if (o.price) {
    // Extract the main price (the first number)
    const priceMatch = o.price.match(/^([0-9.,]+)/);
    if (priceMatch) {
      // To handle German thousands separators (e.g., "350.000"), we remove them before parsing.
      const priceString = priceMatch[1].replace(/\./g, '');
      numeric_price = extractNumber(priceString);
    }

    // We will calculate price_per_sqm manually later for better accuracy.
    // The extracted value from the string is often rounded.
    // const pricePerSqmMatch = o.price.match(/([0-9.,]+)\s*€\/m²/);
    // if (pricePerSqmMatch) {
    //   const pricePerSqmString = pricePerSqmMatch[1].replace(/\./g, '');
    //   price_per_sqm = extractNumber(pricePerSqmString);
    // }
  }

  // --- PARSE SIZE STRING ---
  // Example: '2,5 Zimmer·62 m²·EG'
  if (o.size) {
    // Extract rooms
    const roomsMatch = o.size.match(/([0-9,]+)\s*Zimmer/);
    if (roomsMatch) {
      numeric_rooms = extractNumber(roomsMatch[1]);
    }

    // Extract size in m²
    const sizeMatch = o.size.match(/([0-9,]+)\s*m²/);
    if (sizeMatch) {
      numeric_size = extractNumber(sizeMatch[1]);
    }
  }

  // --- CALCULATE PRICE PER SQM ---
  // Calculate it ourselves for accuracy instead of relying on the (often rounded) scraped value.
  if (numeric_price && numeric_price > 0 && numeric_size && numeric_size > 0) {
    price_per_sqm = parseFloat((numeric_price / numeric_size).toFixed(2));
  }

  const id = buildHash(o.id, o.price);
  return Object.assign(o, { id, numeric_price, price_per_sqm, numeric_size, numeric_rooms });
}

function applyBlacklist(o) {
  const titleNotBlacklisted = !isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !isOneOf(o.description, appliedBlackList);
  return titleNotBlacklisted && descNotBlacklisted;
}

const config = {
  url: null,
  crawlContainer:
    'div[data-testid="serp-core-scrollablelistview-testid"]:not(div[data-testid="serp-enlargementlist-testid"] div[data-testid="serp-card-testid"]) div[data-testid="serp-core-classified-card-testid"]',
  sortByDateParam: 'order=DateDesc',
  waitForSelector: 'div[data-testid="serp-gridcontainer-testid"]',
  crawlFields: {
    id: 'a@href',
    price: 'div[data-testid="cardmfe-price-testid"] | removeNewline | trim',
    size: 'div[data-testid="cardmfe-keyfacts-testid"] | removeNewline | trim',
    title: 'div[data-testid="cardmfe-description-box-text-test-id"] > div:nth-of-type(2)',
    link: 'a@href',
    description: 'div[data-testid="cardmfe-description-text-test-id"] > div:nth-of-type(2) | removeNewline | trim',
    address: 'div[data-testid="cardmfe-description-box-address"] | removeNewline | trim',
    image: 'div[data-testid="cardmfe-picture-box-opacity-layer-test-id"] img@src',
  },
  normalize: normalize,
  filter: applyBlacklist,
  activeTester: checkIfListingIsActive,
};
export const init = (sourceConfig, blacklist) => {
  config.enabled = sourceConfig.enabled;
  config.url = sourceConfig.url;
  appliedBlackList = blacklist || [];
};
export const metaInformation = {
  name: 'Immowelt',
  baseUrl: 'https://www.immowelt.de/',
  id: 'immowelt',
};
export { config };