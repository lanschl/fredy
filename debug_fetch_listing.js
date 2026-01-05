
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

(async () => {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // 1. Go to a search page to find a link
    console.log('Navigating to search page...');
    await page.goto('https://www.immowelt.de/suche/berlin/wohnungen/kaufen', { waitUntil: 'domcontentloaded' });

    // Wait for listings
    try {
        await page.waitForSelector('a[data-testid="card-mfe-covering-link-testid"]', { timeout: 10000 });
    } catch (e) {
        console.log('Could not find listings on search page. Dumping html...');
        fs.writeFileSync('debug_search_fail.html', await page.content());
        await browser.close();
        return;
    }

    // 2. Get first link
    const link = await page.$eval('a[data-testid="card-mfe-covering-link-testid"]', el => el.href);
    console.log(`Found listing: ${link}`);

    // 3. Navigate to detail page
    await page.goto(link, { waitUntil: 'networkidle2' });

    // 4. Save HTML
    const content = await page.content();
    fs.writeFileSync('detail_page.html', content);
    console.log('Saved detail_page.html');

    await browser.close();
})();
