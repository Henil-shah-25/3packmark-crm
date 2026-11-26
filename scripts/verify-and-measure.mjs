import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3000';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ARTIFACT_DIR = 'C:/Users/Henil Shah/.gemini/antigravity/brain/3ac6cbcd-b8a7-475b-9735-8ed7a4804763';

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  const consoleErrors = [];
  const consoleWarnings = [];

  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error') {
      consoleErrors.push(text);
    } else if (msg.type() === 'warning') {
      consoleWarnings.push(text);
    }
  });

  page.on('pageerror', (err) => {
    consoleErrors.push(err.toString());
  });

  // 1. Login
  console.log('Logging in...');
  await page.setViewport({ width: 1917, height: 946 });
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });

  const email = await page.$('input[type="email"]');
  if (email) {
    await email.type('developsterhub@gmail.com');
    const pass = await page.$('input[type="password"]');
    await pass.type('Developsterhubadmin@123');
    const submit = await page.$('button[type="submit"]');
    await submit.click();
    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
  }
  await new Promise((r) => setTimeout(r, 1500));

  // Hard reload to test for duplicate keys / hydration errors
  console.log('Performing hard reload to verify console errors & keys...');
  consoleErrors.length = 0;
  consoleWarnings.length = 0;
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 2000));

  console.log(`Console errors captured after reload: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    console.error('Errors:', consoleErrors);
  }

  // Helper to click section
  async function selectTab(tabName) {
    await page.evaluate((name) => {
      const items = Array.from(document.querySelectorAll('nav button, nav a, .sliding-tab, .tab-btn, button'));
      const target = items.find((el) => el.textContent?.trim().toLowerCase() === name.toLowerCase());
      if (target) target.click();
    }, tabName);
    await new Promise((r) => setTimeout(r, 800));
  }

  // 2. Measure at 1917x946 Overview
  await selectTab('Overview');
  await new Promise((r) => setTimeout(r, 1000));
  const overviewMeasurements = await page.evaluate(() => {
    const cs = (el) => (el ? getComputedStyle(el) : null);
    const px = (v) => parseFloat(v || '0');

    const html = document.documentElement;
    const body = document.body;
    const h1 = document.querySelector('h1, .head__title');
    const dock = document.querySelector('.dock');
    const dockBtn = document.querySelector('.dock__btn');
    const topBtn = document.querySelector('.top__btn-50');
    const avatar = document.querySelector('.top button[title*="Account"]');
    const statIco = document.querySelector('.stat__ico-58');
    const statVal = document.querySelector('.stat__value-26');
    const statLbl = document.querySelector('.stat__label-15');

    const navBtn = document.querySelector('nav button');

    return {
      htmlFs: cs(html)?.fontSize,
      bodyFs: cs(body)?.fontSize,
      pageTitleFs: cs(h1)?.fontSize,
      pageTitleWeight: cs(h1)?.fontWeight,
      dockWidth: dock?.getBoundingClientRect().width,
      dockBtnWidth: dockBtn?.getBoundingClientRect().width,
      dockBtnHeight: dockBtn?.getBoundingClientRect().height,
      topBtnHeight: topBtn?.getBoundingClientRect().height,
      topBtnWidth: topBtn?.getBoundingClientRect().width,
      avatarWidth: avatar?.getBoundingClientRect().width,
      avatarHeight: avatar?.getBoundingClientRect().height,
      statIcoWidth: statIco?.getBoundingClientRect().width,
      statIcoHeight: statIco?.getBoundingClientRect().height,
      statValFs: cs(statVal)?.fontSize,
      statValWeight: cs(statVal)?.fontWeight,
      statLblFs: cs(statLbl)?.fontSize,
      navBtnFs: cs(navBtn)?.fontSize,
      navBtnHeight: navBtn?.getBoundingClientRect().height,
    };
  });

  console.log('=== OVERVIEW MEASUREMENTS at 1917x946 ===');
  console.log(JSON.stringify(overviewMeasurements, null, 2));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'fix-overview-1917x946.png') });

  // 3. Measure at 1917x946 Pipeline
  await selectTab('Pipeline');
  await new Promise((r) => setTimeout(r, 1200));

  const pipelineMeasurements = await page.evaluate(() => {
    const cs = (el) => (el ? getComputedStyle(el) : null);
    const px = (v) => parseFloat(v || '0');

    const search = document.querySelector('.pl-search-52');
    const cols = Array.from(document.querySelectorAll('.pl-col-panel'));
    const cards = Array.from(document.querySelectorAll('.pl-deal-card'));
    const wonLost = document.querySelector('.pl-wonlost-sticky');

    const firstCard = cards[0];
    const cardTitle = firstCard?.querySelector('.pl-card-title-22');
    const cardAmt = firstCard?.querySelector('.pl-card-amt-22');
    const cardMenu = firstCard?.querySelector('.pl-card-menu-40');
    const cardPhone = firstCard?.querySelector('.truncate:not(.pl-card-co-15)');

    // Check visible columns in viewport
    const boardWrap = document.querySelector('.pl-cols-scroll');
    const wrapRect = boardWrap?.getBoundingClientRect();
    const visibleCols = cols.filter((c) => {
      const r = c.getBoundingClientRect();
      return r.left >= wrapRect.left - 5 && r.right <= wrapRect.right + 5;
    });

    return {
      searchWidth: search?.getBoundingClientRect().width,
      firstColWidth: cols[0]?.getBoundingClientRect().width,
      allColWidths: cols.map((c) => c.getBoundingClientRect().width),
      visibleColCount: visibleCols.length,
      wonLostWidth: wonLost?.getBoundingClientRect().width,
      firstCardHeight: firstCard?.getBoundingClientRect().height,
      cardTitleFs: cs(cardTitle)?.fontSize,
      cardTitleWeight: cs(cardTitle)?.fontWeight,
      cardAmtFs: cs(cardAmt)?.fontSize,
      cardAmtWeight: cs(cardAmt)?.fontWeight,
      cardMenuWidth: cardMenu?.getBoundingClientRect().width,
      cardMenuHeight: cardMenu?.getBoundingClientRect().height,
      cardPhoneText: cardPhone?.textContent?.trim() || null,
    };
  });

  console.log('\n=== PIPELINE MEASUREMENTS at 1917x946 ===');
  console.log(JSON.stringify(pipelineMeasurements, null, 2));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'fix-pipeline-1917x946.png') });

  // 4. Screenshots at 1440x900
  console.log('\nCapturing 1440x900...');
  await page.setViewport({ width: 1440, height: 900 });
  await selectTab('Overview');
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'fix-overview-1440x900.png') });

  await selectTab('Pipeline');
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'fix-pipeline-1440x900.png') });

  // 5. Screenshots at 1280x800
  console.log('Capturing 1280x800...');
  await page.setViewport({ width: 1280, height: 800 });
  await selectTab('Overview');
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'fix-overview-1280x800.png') });

  await selectTab('Pipeline');
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'fix-pipeline-1280x800.png') });

  // 6. Screenshots at 390x844 (Mobile)
  console.log('Capturing 390x844...');
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await selectTab('Overview');
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'fix-overview-390x844.png') });

  await selectTab('Pipeline');
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'fix-pipeline-390x844.png') });

  // 7. Verify Workspace Dropdown Click & Rendering
  console.log('Verifying Workspace Dropdown on brand...');
  await page.setViewport({ width: 1917, height: 946 });
  await page.evaluate(() => {
    const brandBtn = document.querySelector('.brand');
    if (brandBtn) brandBtn.click();
  });
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'fix-workspace-dropdown.png') });

  console.log('\nAll measurements and screenshots completed successfully!');
  await browser.close();
}

run().catch((e) => {
  console.error('Verification failed:', e);
  process.exit(1);
});

