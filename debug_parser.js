
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

const filePath = path.resolve(process.cwd(), 'immowelt_puppeteer_success_debug.html');
const html = fs.readFileSync(filePath, 'utf8');
const $ = cheerio.load(html);

console.log('Searching for pagination elements...');

// Search for buttons or links with "Weiter" or "Next"
$('button, a').each((i, el) => {
    const text = $(el).text().trim();
    const ariaLabel = $(el).attr('aria-label');
    const href = $(el).attr('href');

    if (text.includes('Weiter') || text.includes('Next') || (ariaLabel && (ariaLabel.includes('Next') || ariaLabel.includes('Weiter')))) {
        console.log(`Found potential next button: Tag=${el.tagName}, Text="${text}", Aria="${ariaLabel}", Href="${href}"`);
        console.log('Parent HTML:', $.html($(el).parent()).substring(0, 200));
    }
});

// Search for elements containing "84"
console.log('Searching for "84"...');
$('*').each((i, el) => {
    // Only check leaf nodes or nodes with direct text
    const text = $(el).text().trim();
    if (text === '84' || text.includes(' 84 ') || text.startsWith('84 ')) {
        // Avoid printing huge body/divs
        if ($(el).children().length === 0) {
            console.log(`Found "84" in <${el.tagName} class="${$(el).attr('class')}">${text}</${el.tagName}>`);
            console.log('Parent HTML:', $.html($(el).parent()).substring(0, 200));
        }
    }
});
