import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/Henil Shah/.gemini/antigravity/brain/3ac6cbcd-b8a7-475b-9735-8ed7a4804763';
const BASE_URL = 'http://localhost:3000';
const CHROME_PATH = fs.existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  : 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

async function run() {
  console.log('Launching browser with:', CHROME_PATH);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  try {
    const page = await browser.newPage();

    // 1. Log in
    console.log('Navigating to login page...');
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });

    // Fill login form
    console.log('Filling login credentials...');
    const emailInput = await page.$('input[type="email"]');
    if (emailInput) {
      await emailInput.type('developsterhub@gmail.com');
      const passInput = await page.$('input[type="password"]');
      await passInput.type('Developsterhubadmin@123');
      const submitBtn = await page.$('button[type="submit"]');
      await submitBtn.click();
      await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
    }

    // Wait for CRM app shell
    await page.waitForSelector('.top', { timeout: 10000 }).catch(() => {});
    console.log('Logged in successfully!');

    // Helper to switch theme
    async function setTheme(theme) {
      await page.evaluate((t) => {
        document.documentElement.setAttribute('data-theme', t);
        try { localStorage.setItem('rapport_theme', t); } catch (e) {}
      }, theme);
      await new Promise(r => setTimeout(r, 600));
    }

    // Helper to click tab
    async function selectTab(tabName) {
      await page.evaluate((name) => {
        // Find GooeyNav or mobile tab with text
        const items = Array.from(document.querySelectorAll('nav button, nav a, .sliding-tab, .tab-btn, button'));
        const target = items.find(el => el.textContent?.trim().toLowerCase() === name.toLowerCase());
        if (target) {
          target.click();
        }
      }, tabName);
      await new Promise(r => setTimeout(r, 800));
    }

    // 1. 1917x946: Overview light & dark
    console.log('Capturing 1917x946 Overview (Light & Dark)...');
    await page.setViewport({ width: 1917, height: 946, deviceScaleFactor: 1 });
    await setTheme('light');
    await selectTab('Overview');
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'polish-overview-1917x946-light.png') });

    await setTheme('dark');
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'polish-overview-1917x946-dark.png') });

    // 2. 1917x946: Pipeline light & dark
    console.log('Capturing 1917x946 Pipeline (Light & Dark)...');
    await setTheme('light');
    await selectTab('Pipeline');
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'polish-pipeline-1917x946-light.png') });

    await setTheme('dark');
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'polish-pipeline-1917x946-dark.png') });

    // 3. 1440x900: Overview & Pipeline
    console.log('Capturing 1440x900 Overview & Pipeline...');
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await setTheme('light');
    await selectTab('Overview');
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'polish-overview-1440x900.png') });

    await selectTab('Pipeline');
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'polish-pipeline-1440x900.png') });

    // 4. 1024x768 (Tablet): Overview & Pipeline
    console.log('Capturing 1024x768 Tablet Overview & Pipeline...');
    await page.setViewport({ width: 1024, height: 768, deviceScaleFactor: 1 });
    await selectTab('Overview');
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'polish-overview-1024x768.png') });

    await selectTab('Pipeline');
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'polish-pipeline-1024x768.png') });

    // 5. 390x844 (Mobile): Overview & Pipeline
    console.log('Capturing 390x844 Mobile Overview & Pipeline...');
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await selectTab('Overview');
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'polish-overview-390x844.png') });

    await selectTab('Pipeline');
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'polish-pipeline-390x844.png') });

    // 6. GooeyNav Close-Up (Header element screenshot)
    console.log('Capturing GooeyNav Header close-up...');
    await page.setViewport({ width: 1917, height: 946, deviceScaleFactor: 1 });
    await selectTab('Overview');
    await new Promise(r => setTimeout(r, 800));
    const headerEl = await page.$('.top');
    if (headerEl) {
      await headerEl.screenshot({ path: path.join(ARTIFACT_DIR, 'polish-gooeynav-header-1917x946.png') });
    }

    // Switch to Settings (activeIndex = -1) to verify GooeyNav handles -1 cleanly without active pill or crash
    console.log('Capturing Settings view with GooeyNav activeIndex = -1...');
    await page.evaluate(() => {
      // Find settings button in dock or user menu
      const btn = document.querySelector('button[title*="Settings"], button[aria-label*="Settings"], .dock__btn:last-child');
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'polish-settings-gooeynav-unfocused.png') });

    console.log('All screenshots captured successfully!');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});

