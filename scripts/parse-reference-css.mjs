import fs from 'fs';

async function main() {
  const cssRes = await fetch('https://demo.codeandchill.store/rapport/assets/index-Dxe3jV5a.css');
  const css = await cssRes.text();
  fs.writeFileSync('scripts/reference-index.css', css);
  console.log('Saved reference CSS. Total lines:', css.split('\n').length);

  // Look for key style patterns
  const vars = css.match(/--[\w-]+:[^;]+/g) || [];
  console.log('Sample CSS vars:', [...new Set(vars)].slice(0, 30));

  // Search for page header, grid, card, button styles
  const queries = ['1917', '131px', '46px', '50px', '54px', '58px', 'radius', 'tabular-nums', 'gap'];
  queries.forEach(q => {
    const lines = css.split(';').filter(l => l.includes(q));
    console.log(`\nMatches for "${q}":`, lines.slice(0, 5));
  });
}

main();

