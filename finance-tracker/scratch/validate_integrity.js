import fs from 'fs';

const html = fs.readFileSync('C:/Users/ADM/.gemini/antigravity/scratch/finance-tracker/public/index.html', 'utf8');
const originalIds = fs.readFileSync('C:/Users/ADM/.gemini/antigravity/scratch/finance-tracker/all_ids.txt', 'utf16le')
  .split(/\r?\n/).map(s => s.trim()).filter(Boolean);

let missingCount = 0;
originalIds.forEach(id => {
  if (id.includes('${')) return; // skip dynamic template strings
  if (!html.includes(`id="${id}"`)) {
    console.log('Missing ID:', id);
    missingCount++;
  }
});
console.log(`Checked ${originalIds.length} IDs | Missing: ${missingCount}`);
