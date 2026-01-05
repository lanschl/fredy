import fs from 'fs';
import path from 'path';

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            if (!file.includes('node_modules') && !file.includes('.git')) {
                results = results.concat(walk(file));
            }
        } else if (file.endsWith('.js') || file.endsWith('.jsx') || file.endsWith('.json') || file.endsWith('.md')) {
            results.push(file);
        }
    });
    return results;
}

const files = walk('.');
let count = 0;
files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('\r\n')) {
        const fixedContent = content.replace(/\r\n/g, '\n');
        fs.writeFileSync(file, fixedContent, 'utf8');
        count++;
    }
});

console.log(`Fixed ${count} files with CRLF.`);
