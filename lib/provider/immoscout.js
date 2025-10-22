/**
 * ImmoScout provider using the mobile API to retrieve listings.
 *
 * The mobile API provides the following endpoints:
 * - GET /search/total?{search parameters}: Returns the total number of listings for the given query
 * Example: `curl -H "User-Agent: ImmoScout_27.3_26.0_._" https://api.mobile.immobilienscout24.de/search/total?searchType=region&realestatetype=apartmentrent&pricetype=calculatedtotalrent&geocodes=%2Fde%2Fberlin%2Fberlin `
 *
 * - POST /search/list?{search parameters}: Actually retrieves the listings. Body is json encoded and contains
 * data specifying additional results (advertisements) to return. The format is as follows:
 * ```
 * {
 * "supportedResultListTypes": [],
 * "userData": {}
 * }
 * ```
 * It is not necessary to provide data for the specified keys.
 *
 * Example: `curl -X POST 'https://api.mobile.immobilienscout24.de/search/list?pricetype=calculatedtotalrent&realestatetype=apartmentrent&searchType=region&geocodes=%2Fde%2Fberlin%2Fberlin&pagenumber=1' -H "Connection: keep-alive" -H "User-Agent: ImmoScout_27.3_26.0_._" -H "Accept: application/json" -H "Content-Type: application/json" -d '{"supportedResultListType": [], "userData": {}}'`

 * - GET /expose/{id} - Returns the details of a listing. The response contains additional details not included in the
 * listing response.
 *
 * Example: `curl -H "User-Agent: ImmoScout_27.3_26.0_._" "https://api.mobile.immobilienscout24.de/expose/158382494"`
 *
 *
 * It is necessary to set the correct User Agent (see `getListings`) in the request header.
 *
 * Note that the mobile API is not publicly documented. I've reverse-engineered
 * it by intercepting traffic from an android emulator running the immoscout app.
 * Moreover, the search parameters differ slightly from the web API. I've mapped them
 * to the web API parameters by comparing a search request with all parameters set between
 * the web and mobile API. The mobile API actually seems to be a superset of the web API,
 * but I have decided not to include new parameters as I wanted to keep the existing UX (i.e.,
 * users only have to provide a link to an existing search).
 *
 */

import { buildHash, isOneOf, extractNumber } from '../utils.js';
import {
  convertImmoscoutListingToMobileListing,
  convertWebToMobile,
} from '../services/immoscout/immoscout-web-translator.js';
import logger from '../services/logger.js';
import { promises as fs } from 'fs';
import path from 'path';
let appliedBlackList = [];

async function getListings(url) {
  const fetchPage = async (pageNumber) => {
    const pageUrl = `${url}&pagenumber=${pageNumber}`;
    logger.debug(`Fetching ImmoScout page ${pageNumber}...`);
    const response = await fetch(pageUrl, {
      method: 'POST',
      headers: {
        'User-Agent': 'ImmoScout_27.3_26.0_._',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        supportedResultListTypes: [],
        userData: {},
      }),
    });
    if (!response.ok) {
      logger.error(`Error fetching page ${pageNumber} from ImmoScout Mobile API:`, response.statusText);
      return null;
    }
    return response.json();
  };

  // 1. Fetch the first page to get total pages
  const firstPageResponse = await fetchPage(1);
  if (!firstPageResponse) {
    return [];
  }

  // --- DEBUGGING: Log the entire first page response to inspect its structure ---
  //logger.debug({ message: 'ImmoScout: Full response from page 1', data: firstPageResponse });

  const allListings = [...firstPageResponse.resultListItems];
  const totalPages = firstPageResponse.numberOfPages ?? 1;

  //logger.debug(`ImmoScout: Total pages to fetch: ${totalPages}. Already fetched page 1.`);

  // 2. If there are more pages, fetch them in parallel
  if (totalPages > 1) {
    // logger.debug(`ImmoScout: Preparing to fetch pages 2 through ${totalPages}...`);
    const pagePromises = [];
    for (let i = 2; i <= totalPages; i++) {
      pagePromises.push(fetchPage(i));
    }

    const subsequentPages = await Promise.all(pagePromises);
    subsequentPages.forEach((pageData) => {
      if (pageData && pageData.resultListItems) {
        logger.debug(`ImmoScout: Adding ${pageData.resultListItems.length} listings from a subsequent page.`);
        allListings.push(...pageData.resultListItems);
      }
    });
  } else {
    logger.debug('ImmoScout: No more pages to fetch.');
  }

  logger.debug(`ImmoScout: Total raw listings collected from all pages: ${allListings.length}`);

  // 1. Erstelle eine Liste von Promises. Jedes Promise holt die Detail-Daten.
  const listingPromises = allListings
    .filter((item) => item.type === 'EXPOSE_RESULT')
    .map(async (expose) => {
      const item = expose.item; // Das sind die "dünnen" Rohdaten
      const [price, size] = item.attributes;
      const image = item?.titlePicture?.preview ?? null;

      // 2. HOLEN DER DETAIL-DATEN (EXPOSÉ) FÜR JEDES INSERAT
      let exposeJson = {}; // Standard-Fallback-Objekt
      try {
        const exposeUrl = `https://api.mobile.immobilienscout24.de/expose/${item.id}`;
        const exposeResponse = await fetch(exposeUrl, {
          headers: { 'User-Agent': 'ImmoScout_27.3_26.0_._' },
        });
        if (exposeResponse.ok) {
          exposeJson = await exposeResponse.json(); // Hier sind die "fetten" Daten drin

          // --- NEUE DEBUG LOGIK: JSON SPEICHERN ---
          try {
            const debugDir = path.join(process.cwd(), 'debug_json');
            await fs.mkdir(debugDir, { recursive: true });
            const filePath = path.join(debugDir, `immoscout-${item.id}.json`);
            await fs.writeFile(filePath, JSON.stringify(exposeJson, null, 2));
            // logger.debug(`Exposé-Daten für ID ${item.id} in Datei gespeichert.`);
          } catch (writeError) {
            logger.error(`Fehler beim Speichern der JSON-Datei für ID ${item.id}:`, writeError.message);
          }
          // --- ENDE NEUE DEBUG LOGIK ---
        }
      } catch (e) {
        logger.error(`Konnte Exposé-Daten für ID ${item.id} nicht laden:`, e.message);
      }

      // 3. DATEN KOMBINIEREN (aus Liste und Exposé)
      let numericPrice = null;
      if (price?.value) {
        // To handle German thousands separators (e.g., "350.000"), we remove them before parsing.
        const priceString = String(price.value).replace(/\./g, '');
        numericPrice = extractNumber(priceString);
      }
      const numericSize = extractNumber(size?.value);

      // --- Hilfsfunktionen, um Attribute sicher aus den Sections zu holen ---
      const findAttributeInSection = (sectionTitle, attributeLabel) => {
        const section = exposeJson?.sections?.find(s => s.type === 'ATTRIBUTE_LIST' && s.title === sectionTitle);
        const attribute = section?.attributes?.find(a => a.label === attributeLabel);
        return attribute?.text ?? null; // Gibt den Text zurück oder null
      };

      const findPriceInfo = () => {
        return exposeJson?.sections?.find(s => s.type === 'PRICE_INFO') ?? null;
      };


      // --- Daten extrahieren mit den KORREKTEN Pfaden ---
      const adParams = exposeJson?.adTargetingParameters ?? {};

      // Bevorzuge deutsche Labels, nutze adParams als Fallback
      const yearBuilt = parseInt(adParams.obj_yearConstructed, 10) || null;
      const lastRefurbishmentYear = parseInt(adParams.obj_lastRefurbish, 10) || null;
      const numericRooms = parseFloat(String(adParams.obj_noRooms).replace(',', '.')) || null;

      const condition = findAttributeInSection("Bausubstanz & Energieausweis", "Objektzustand:") ?? adParams.obj_condition ?? null;
      const interiorQuality = findAttributeInSection("Bausubstanz & Energieausweis", "Qualität der Ausstattung:") ?? adParams.obj_interiorQual ?? null;
      const flatType = findAttributeInSection("Hauptkriterien", "Wohnungstyp:") ?? adParams.obj_typeOfFlat ?? null;
      const heatingType = findAttributeInSection("Bausubstanz & Energieausweis", "Heizungsart:") ?? adParams.obj_heatingType ?? null;
      const energySource = findAttributeInSection("Bausubstanz & Energieausweis", "Wesentliche Energieträger:") ?? adParams.obj_firingTypes ?? null;

      const energyClass = adParams.obj_energyEfficiencyClass ?? exposeJson?.header?.energyEfficiencyClass ?? null;
      
      // Adress-Daten
      const street = (adParams.obj_streetPlain || item.address?.street || '').replace(/_/g, ' ');
      const zipCode = adParams.obj_zipCode || item.address?.postcode || null;
      const city = adParams.obj_regio2 || item.address?.city || null;

      // Kaufnebenkosten
      const financeSection = exposeJson?.sections?.find(s => s.type === 'FINANCE_COSTS');
      const additionalPurchaseCosts = financeSection?.additionalCosts?.value ?? null;
      
      // Preis-Indikator
      const priceInfoSection = findPriceInfo();
      const priceIndicator = priceInfoSection?.priceBar?.priceIndicatorPositionInPercent ?? null;

      // Flags aus adTargetingParameters
      const hasBalcony = adParams.obj_balcony === 'y';
      const hasGarden = adParams.obj_garden === 'y';
      const hasKitchen = adParams.obj_hasKitchen === 'y';
      const hasCellar = adParams.obj_cellar === 'y';
      const hasLift = adParams.obj_lift === 'y';
      const isBarrierFree = adParams.obj_barrierFree === 'y';

      const serviceChargeText = findAttributeInSection("Kosten", "Hausgeld:") ?? adParams.obj_serviceCharge ?? null;
      const serviceCharge = extractNumber(serviceChargeText);

      let pricePerSqm = null;
      if (numericPrice && numericSize && numericSize > 0) {
        pricePerSqm = numericPrice / numericSize;
      }

      return {
        id: item.id,
        price: price?.value ? price.value.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }) : 'Auf Anfrage',
        size: size?.value ? size.value.toLocaleString('de-DE', { style: 'decimal', minimumFractionDigits: 0 }) + ' m²' : 'k.A.',
        title: item.title,
        link: `${metaInformation.baseUrl}expose/${item.id}`,
        address_full: item.address?.line,
        image,

        // --- UNSERE NEUEN, UMFASSENDEN FELDER ---
        
        // Preis & Größe
        numeric_price: numericPrice,
        numeric_size: numericSize,
        price_per_sqm: pricePerSqm ? parseFloat(pricePerSqm.toFixed(2)) : null,
        
        // Objekt-Details
        numeric_rooms: numericRooms,
        year_built: yearBuilt,
        last_refurbishment_year: lastRefurbishmentYear,
        condition: condition,
        interior_quality: interiorQuality,
        flat_type: flatType,
        
        // Adresse aufgesplittet
        street: street,
        zip_code: zipCode,
        city: city,

        // Energie
        energy_class: energyClass,
        heating_type: heatingType,
        energy_source: energySource,

        // Kosten
        service_charge: serviceCharge, // Hausgeld
        additional_purchase_costs: additionalPurchaseCosts, // Kaufnebenkosten

        // Flags
        has_balcony: hasBalcony,
        has_garden: hasGarden,
        has_kitchen: hasKitchen,
        has_cellar: hasCellar,
        has_lift: hasLift,
        is_barrier_free: isBarrierFree,

        // Kennzahlen & Metadaten
        price_indicator_percent: priceIndicator,
        published_text: exposeJson?.header?.published ?? item.published ?? null,
        is_private: item.isPrivate ?? null,
      };
    });

  // 4. Warten, bis ALLE Detail-Anfragen fertig sind, und dann das Ergebnis zurückgeben.
  return Promise.all(listingPromises);
}

async function isListingActive(link) {
  const result = await fetch(convertImmoscoutListingToMobileListing(link), {
    headers: {
      'User-Agent': 'ImmoScout_27.3_26.0_._',
    },
  });

  if (result.status === 200) {
    return 1;
  }

  if (result.status === 404) {
    return 0;
  }

  logger.warn('Unknown status for immoscout listing', link);
  return -1;
}

function nullOrEmpty(val) {
  return val == null || String(val).length === 0;
}
function normalize(o) {
  const title = nullOrEmpty(o.title) ? 'NO TITLE FOUND' : o.title.replace('NEU', '');
  // The original provider ID is preserved. The pipeline handles hashing.
  return { ...o, title };
}
function applyBlacklist(o) {
  return !isOneOf(o.title, appliedBlackList);
}
const config = {
  url: null,
  // Not required - used by filter to remove and listings that failed to parse
  sortByDateParam: 'sorting=-firstactivation',
  normalize: normalize,
  filter: applyBlacklist,
  getListings: getListings,
  activeTester: isListingActive,
};
export const init = (sourceConfig, blacklist) => {
  config.enabled = sourceConfig.enabled;
  config.url = convertWebToMobile(sourceConfig.url);
  appliedBlackList = blacklist || [];
};
export const metaInformation = {
  name: 'Immoscout',
  baseUrl: 'https://www.immobilienscout24.de/',
  id: 'immoscout',
};

export { config };
