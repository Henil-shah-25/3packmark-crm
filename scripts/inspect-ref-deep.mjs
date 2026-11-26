import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1917, height: 946 });
  try {
    await page.goto('https://demo.codeandchill.store/rapport/#/pipeline', { waitUntil: 'networkidle2', timeout: 30000 });
  } catch (e) {
    console.log('Navigation error, trying load:', e.message);
  }
  await new Promise(r => setTimeout(r, 2000));

  const refSizes = await page.evaluate(() => {
    const cs = (el) => el ? getComputedStyle(el) : null;
    const px = (v) => parseFloat(v || '0');

    const html = document.documentElement;
    const body = document.body;
    const h1 = document.querySelector('h1');
    const header = document.querySelector('header, .top');
    const nav = document.querySelector('nav');
    const navBtn = document.querySelector('nav button, nav a');
    const dock = document.querySelector('[class*="dock"]');
    const statIco = document.querySelector('[class*="stat__ico"], [class*="stat-ico"]');
    const statVal = document.querySelector('[class*="stat__value"], [class*="stat-val"]');
    const statLbl = document.querySelector('[class*="stat__label"], [class*="stat-lbl"]');

    const search = document.querySelector('input[type="search"], input[placeholder*="Search"]');
    const col = document.querySelector('[class*="col"]');
    const card = document.querySelector('[class*="card"]');

    return {
      url: window.location.href,
      htmlFontSize: cs(html)?.fontSize,
      htmlZoom: cs(html)?.zoom,
      bodyFontSize: cs(body)?.fontSize,
      bodyZoom: cs(body)?.zoom,
      h1FontSize: cs(h1)?.fontSize,
      h1FontWeight: cs(h1)?.fontWeight,
      navBtnFontSize: cs(navBtn)?.fontSize,
      navBtnHeight: navBtn?.getBoundingClientRect().height,
      navBtnPadding: cs(navBtn)?.padding,
      headerGridCols: cs(header)?.gridTemplateColumns,
      dockWidth: dock?.getBoundingClientRect().width,
      statIcoWidth: statIco?.getBoundingClientRect().width,
      statIcoHeight: statIco?.getBoundingClientRect().height,
      statValFontSize: cs(statVal)?.fontSize,
      statLblFontSize: cs(statLbl)?.fontSize,
      searchWidth: search?.getBoundingClientRect().width,
      colWidth: col?.getBoundingClientRect().width,
      cardMinHeight: cs(card)?.minHeight,
    };
  });

  console.log('=== REFERENCE COMPUTED STYLES at 1917x946 ===');
  console.log(JSON.stringify(refSizes, null, 2));

  await browser.close();
}

run().catch(e => { console.error('Error running inspect:', e); });

