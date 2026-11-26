async function main() {
  try {
    const res = await fetch('https://demo.codeandchill.store/rapport/');
    const html = await res.text();
    console.log('HTML length:', html.length);

    // Look for font stylesheets or font imports in HTML
    const linkTags = html.match(/<link[^>]+>/gi) || [];
    console.log('Link tags:', linkTags);

    const scriptTags = html.match(/<script[^>]+src=[^>]+>/gi) || [];
    console.log('Script tags:', scriptTags);

    // Fetch linked CSS files
    for (const link of linkTags) {
      if (link.includes('stylesheet') || link.includes('.css')) {
        const hrefMatch = link.match(/href=["']([^"']+)["']/i);
        if (hrefMatch) {
          const href = hrefMatch[1];
          const fullUrl = href.startsWith('http') ? href : new URL(href, 'https://demo.codeandchill.store/rapport/').toString();
          console.log('\n--- Fetching CSS:', fullUrl);
          const cssRes = await fetch(fullUrl);
          const cssText = await cssRes.text();
          console.log('CSS length:', cssText.length);
          const fontFaces = cssText.match(/@font-face\s*\{[^}]+\}/gi) || [];
          console.log('Font faces count:', fontFaces.length);
          if (fontFaces.length > 0) {
            console.log('Font faces sample:', fontFaces.slice(0, 5));
          }
          const fontFamilies = cssText.match(/font-family\s*:\s*[^;}]+/gi) || [];
          console.log('Distinct font families:', [...new Set(fontFamilies.map(f => f.trim()))].slice(0, 15));
        }
      }
    }

    // Also search JS bundles if CSS is inlined or injected
    for (const script of scriptTags) {
      const srcMatch = script.match(/src=["']([^"']+)["']/i);
      if (srcMatch) {
        const src = srcMatch[1];
        const fullUrl = src.startsWith('http') ? src : new URL(src, 'https://demo.codeandchill.store/rapport/').toString();
        console.log('\n--- Checking JS bundle:', fullUrl);
        const jsRes = await fetch(fullUrl);
        const jsText = await jsRes.text();
        const fontMatches = jsText.match(/font-family[^;,"'{}]+/gi) || [];
        if (fontMatches.length > 0) {
          console.log('Font matches in JS:', [...new Set(fontMatches)].slice(0, 10));
        }
        const woffMatches = jsText.match(/https?:\/\/[^\s"',]+\.(?:woff2?|ttf)/gi) || [];
        if (woffMatches.length > 0) {
          console.log('Woff links in JS:', woffMatches);
        }
        const googleFonts = jsText.match(/fonts\.googleapis\.com[^\s"',]+/gi) || [];
        if (googleFonts.length > 0) {
          console.log('Google fonts in JS:', googleFonts);
        }
      }
    }
  } catch (err) {
    console.error('Inspect error:', err);
  }
}

main();

