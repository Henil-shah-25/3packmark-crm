import puppeteer from 'puppeteer-core';

const BASE_URL = 'http://localhost:3000';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1917, height: 946 });
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });

  // Login
  const email = await page.$('input[type="email"]');
  if (email) {
    await email.type('developsterhub@gmail.com');
    const pass = await page.$('input[type="password"]');
    await pass.type('Developsterhubadmin@123');
    const submit = await page.$('button[type="submit"]');
    await submit.click();
    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
  }
  await new Promise(r => setTimeout(r, 2000));

  // Measure key elements
  const measurements = await page.evaluate(() => {
    const cs = (el) => el ? getComputedStyle(el) : null;
    const px = (v) => parseFloat(v || '0');

    // html/body base size
    const htmlEl = document.documentElement;
    const bodyEl = document.body;
    const htmlFs = px(cs(htmlEl)?.fontSize);
    const bodyFs = px(cs(bodyEl)?.fontSize);

    // Nav tabs
    const navButtons = Array.from(document.querySelectorAll('nav button, .gooey-nav button, [class*="gooey"] button'));
    const firstTab = navButtons[0];
    const tabFs = firstTab ? px(cs(firstTab)?.fontSize) : null;
    const tabH = firstTab ? firstTab.getBoundingClientRect().height : null;

    // Page title (h1)
    const h1 = document.querySelector('h1');
    const titleFs = h1 ? px(cs(h1)?.fontSize) : null;

    // Dock
    const dock = document.querySelector('.dock');
    const dockW = dock ? dock.getBoundingClientRect().width : null;

    // Stat circles
    const statIco = document.querySelector('.stat__ico-58, [class*="stat__ico"]');
    const statIcoH = statIco ? statIco.getBoundingClientRect().height : null;
    const statIcoW = statIco ? statIco.getBoundingClientRect().width : null;

    // Top bar buttons
    const topBtn = document.querySelector('.top__btn-50');
    const topBtnH = topBtn ? topBtn.getBoundingClientRect().height : null;

    // Avatar
    const avatar = document.querySelector('[class*="rounded-full"][class*="54"]');
    const avatarH = avatar ? avatar.getBoundingClientRect().height : null;

    // GooeyNav container
    const gooeyContainer = document.querySelector('.gooey-nav, [class*="gooey"]');
    const gooeyRect = gooeyContainer ? gooeyContainer.getBoundingClientRect() : null;

    // Check console for duplicate key issues by checking workspace chips
    const wsChips = document.querySelectorAll('[data-ws-id]');

    return {
      htmlFontSize: htmlFs,
      bodyFontSize: bodyFs,
      tabFontSize: tabFs,
      tabHeight: tabH,
      pageTitleFontSize: titleFs,
      dockWidth: dockW,
      statCircleHeight: statIcoH,
      statCircleWidth: statIcoW,
      topBarBtnHeight: topBtnH,
      avatarHeight: avatarH,
      gooeyNavLeft: gooeyRect?.left,
      gooeyNavRight: gooeyRect?.right,
      gooeyNavWidth: gooeyRect?.width,
      wsChipCount: wsChips.length,
      windowDevicePixelRatio: window.devicePixelRatio,
    };
  });

  console.log('=== COMPUTED MEASUREMENTS at 1917x946 ===');
  console.log(JSON.stringify(measurements, null, 2));

  // Also check pipeline after navigation
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, a'));
    const pipe = buttons.find(b => b.textContent?.trim() === 'Pipeline');
    if (pipe) pipe.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  const pipelineMeasurements = await page.evaluate(() => {
    const cs = (el) => el ? getComputedStyle(el) : null;
    const px = (v) => parseFloat(v || '0');

    // Pipeline columns
    const cols = document.querySelectorAll('.pl-col, [class*="pl-col"]');
    const firstCol = cols[0];
    const colW = firstCol ? firstCol.getBoundingClientRect().width : null;

    // Pipeline cards
    const cards = document.querySelectorAll('.pl-card, [class*="deal-card"], [class*="pl-card"]');
    const firstCard = cards[0];
    const cardH = firstCard ? firstCard.getBoundingClientRect().height : null;
    const cardStyle = firstCard ? cs(firstCard) : null;
    const cardTitle = firstCard?.querySelector('[class*="title"], h3, h4');
    const cardTitleFs = cardTitle ? px(cs(cardTitle)?.fontSize) : null;

    // Search pill
    const searchInput = document.querySelector('input[type="search"], input[placeholder*="Search"]');
    const searchW = searchInput ? searchInput.getBoundingClientRect().width : null;

    // Won/Lost zone
    const wonLost = document.querySelector('.pl-wonlost, [class*="wonlost"]');
    const wonLostW = wonLost ? wonLost.getBoundingClientRect().width : null;

    return {
      numColumns: cols.length,
      firstColumnWidth: colW,
      firstCardHeight: cardH,
      cardTitleFontSize: cardTitleFs,
      searchInputWidth: searchW,
      wonLostZoneWidth: wonLostW,
    };
  });

  console.log('\n=== PIPELINE MEASUREMENTS ===');
  console.log(JSON.stringify(pipelineMeasurements, null, 2));

  // Screenshot
  const ARTIFACT_DIR = 'C:/Users/Henil Shah/.gemini/antigravity/brain/3ac6cbcd-b8a7-475b-9735-8ed7a4804763';
  await page.screenshot({ path: `${ARTIFACT_DIR}/measure-pipeline-1917x946.png` });

  await browser.close();
}

run().catch(e => { console.error(e); process.exit(1); });

