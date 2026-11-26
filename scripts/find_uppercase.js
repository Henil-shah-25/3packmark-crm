const fs = require('fs');
const path = require('path');

function walk(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const stat = fs.statSync(path.join(dir, file));
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.next') {
        walk(path.join(dir, file), fileList);
      }
    } else if (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.css')) {
      fileList.push(path.join(dir, file));
    }
  }
  return fileList;
}

const allFiles = walk('src');
const results = [];

for (const f of allFiles) {
  const content = fs.readFileSync(f, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (/\buppercase\b/.test(line) || /text-transform:\s*uppercase/i.test(line)) {
      results.push({ file: f, lineNum: idx + 1, text: line.trim() });
    }
  });
}

console.log('Total uppercase occurrences found:', results.length);
results.slice(0, 30).forEach(r => console.log(`${r.file}:${r.lineNum}: ${r.text}`));

