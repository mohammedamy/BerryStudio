import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';

const ARTIFACTS_DIR = '/Users/mohammedamy/.gemini/antigravity-ide/brain/dea5c086-d921-4dff-87a3-632c883446dc';
const TARGET_URL = process.env.BERRY_URL || 'https://berrystudio.org/index.html';

async function main() {
  console.log(`Starting Live Lookbook & UI Audit on: ${TARGET_URL}`);
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2
  });

  const page = await context.newPage();

  const consoleErrors = [];
  page.on('pageerror', err => consoleErrors.push(`[PageError] ${err}`));
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!/Failed to load resource.*404/.test(text)) {
        consoleErrors.push(`[ConsoleError] ${text}`);
      }
    }
  });

  // Mock Supabase auth SDK to unlock the full library as active subscriber
  await page.route('https://esm.sh/@supabase/supabase-js@2.112.3', route => route.fulfill({
    contentType: 'application/javascript',
    body: `export function createClient(){
      window.authFixture = {
        profile: { subscription_status: 'active', trial_started_at: null },
        user: 'qa-lookbook-reviewer',
        emit(u){
          if(this.callback) this.callback('SIGNED_IN', { user: { id: u, email: 'qa@berrystudio.org' } });
        }
      };
      const f = window.authFixture;
      return {
        auth: {
          onAuthStateChange(cb){
            f.callback = cb;
            setTimeout(() => f.emit(f.user), 10);
            return { data: { subscription: { unsubscribe(){} } } };
          }
        },
        from(){
          return {
            select(){ return this; },
            eq(){ return this; },
            async maybeSingle(){
              return { data: f.profile, error: null };
            }
          };
        }
      };
    }`
  }));

  // Ensure onboarding dialog is marked complete
  await page.addInitScript(() => {
    try {
      const current = JSON.parse(localStorage.getItem('pps') || '{}');
      current.onboarded = true;
      localStorage.setItem('pps', JSON.stringify(current));
    } catch (e) {}
  });

  console.log('Navigating to live application...');
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Handle any onboarding overlay if still visible
  const skip = page.getByRole('button', { name: 'Skip' });
  await skip.waitFor({ state: 'visible', timeout: 3000 }).catch(() => null);
  if (await skip.isVisible().catch(() => false)) {
    console.log('Dismissing onboarding modal...');
    await skip.click();
  }

  await page.waitForSelector('.project-tab', { timeout: 20000 });
  console.log('App shell initialized.');

  // Wait for mock auth fixture to resolve entitlement
  await page.waitForFunction(() => (window.authFixture?.calls ?? 0) >= 1, { timeout: 10000 }).catch(() => null);
  await page.waitForTimeout(500);

  // Open the Library pane in the right rail
  console.log('Opening Library pane...');
  const libTabBtn = page.locator('#railTabs button[data-pane="library"]');
  await libTabBtn.click();

  const libPane = page.locator('.rail-pane[data-pane="library"]');
  await libPane.waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForSelector('.rail-pane[data-pane="library"] .lib-card', { timeout: 15000 });

  // Select "All" category
  const allCatBtn = libPane.locator(`.seg button:has-text("All")`).first();
  if (await allCatBtn.isVisible()) {
    await allCatBtn.click();
    await page.waitForTimeout(300);
  }

  console.log('Hydrating all 308 images in the library grid...');
  // Force eager hydration and decode of all catalog cards
  const catalogStats = await page.evaluate(async () => {
    const cards = Array.from(document.querySelectorAll('.rail-pane[data-pane="library"] .lib-card'));
    const catalogCards = cards.filter(c => {
      const sub = c.querySelector('.lib-meta .s')?.textContent || '';
      return !sub.includes('★');
    });

    const imgs = catalogCards.map(c => c.querySelector('.lib-thumb img')).filter(Boolean);
    imgs.forEach(i => {
      i.removeAttribute('loading');
      i.loading = 'eager';
    });

    // Wait for all images to decode
    await Promise.all(imgs.map(img => img.decode().catch(() => null)));

    const broken = [];
    const loaded = [];

    catalogCards.forEach(c => {
      const title = c.querySelector('.lib-meta .t')?.textContent?.trim() || 'Unknown';
      const sub = c.querySelector('.lib-meta .s')?.textContent?.trim() || '';
      const img = c.querySelector('.lib-thumb img');
      const hasImg = !!img;
      const src = img?.getAttribute('src') || '';
      const nw = img?.naturalWidth || 0;
      const nh = img?.naturalHeight || 0;

      const record = { title, sub, src, nw, nh };
      if (hasImg && nw > 0) {
        loaded.push(record);
      } else {
        broken.push(record);
      }
    });

    return {
      totalCatalogCards: catalogCards.length,
      loadedCount: loaded.length,
      brokenCount: broken.length,
      broken,
      sampleLoaded: loaded.slice(0, 10)
    };
  });

  console.log(`\n================ CATALOG AUDIT RESULTS ================`);
  console.log(`Total Catalog Cards (excluding saved drafts): ${catalogStats.totalCatalogCards}`);
  console.log(`Successfully Loaded Lookbook Photos: ${catalogStats.loadedCount} / 320`);
  console.log(`Broken or Unloaded Images: ${catalogStats.brokenCount}`);
  if (catalogStats.brokenCount > 0) {
    console.log('Broken items:', catalogStats.broken);
  }
  console.log(`=======================================================\n`);

  // Specific inspection of Reference Patterns (tail 3 of each category)
  const refCategories = ['women', 'men', 'girls', 'boys'];
  for (const cat of refCategories) {
    const label = cat.charAt(0).toUpperCase() + cat.slice(1);
    const catBtn = libPane.locator(`.seg button:has-text("${label}")`).first();
    if (await catBtn.isVisible()) {
      await catBtn.click();
      await page.waitForTimeout(400);

      // Scroll the library pane right to the bottom to bring the last 3 reference patterns into view
      await page.evaluate(() => {
        const pane = document.querySelector('.rail-pane[data-pane="library"]');
        if (pane) pane.scrollTop = pane.scrollHeight;
        const grid = document.querySelector('.rail-pane[data-pane="library"] .lib-grid');
        if (grid) grid.scrollTop = grid.scrollHeight;
      });
      await page.waitForTimeout(300);

      // Eagerly decode all visible images
      await page.evaluate(async () => {
        const imgs = Array.from(document.querySelectorAll('.rail-pane[data-pane="library"] .lib-thumb img'));
        imgs.forEach(i => { i.removeAttribute('loading'); i.loading = 'eager'; });
        await Promise.all(imgs.slice(-6).map(img => img.decode().catch(() => null)));
      });
      await page.waitForTimeout(300);

      const shotRefPath = resolve(ARTIFACTS_DIR, `catalog_tail_${cat}.png`);
      await page.screenshot({ path: shotRefPath, fullPage: false });
      console.log(`Saved screenshot: catalog_tail_${cat}.png`);
    }
  }

  // Capture Category Shots with images rendered
  const categories = ['all', 'women', 'men', 'boys', 'girls'];
  for (const cat of categories) {
    const label = cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1);
    const catBtn = libPane.locator(`.seg button:has-text("${label}")`).first();
    if (await catBtn.isVisible()) {
      await catBtn.click();
      await page.waitForTimeout(400);
      // Ensure current category images are decoded
      await page.evaluate(async () => {
        const imgs = Array.from(document.querySelectorAll('.rail-pane[data-pane="library"] .lib-thumb img'));
        imgs.forEach(i => { i.removeAttribute('loading'); i.loading = 'eager'; });
        await Promise.all(imgs.slice(0, 30).map(img => img.decode().catch(() => null)));
      });
      await page.waitForTimeout(300);
    }
    const shotPath = resolve(ARTIFACTS_DIR, `catalog_${cat}.png`);
    await page.screenshot({ path: shotPath, fullPage: false });
    console.log(`Saved screenshot: catalog_${cat}.png`);
  }

  // Reference Pattern Selection: Women's Tiered Shirtdress (ref_w_shirtdress - the last card in Women)
  console.log('Testing pattern selection: Women Tailored Shirt Dress (ref_w_shirtdress)...');
  const womenBtn = libPane.locator(`.seg button:has-text("Women")`).first();
  await womenBtn.click();
  await page.waitForTimeout(500);

  // The last card in Women is ref_w_shirtdress
  const shirtdressCard = libPane.locator('.lib-card').last();
  await shirtdressCard.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const selectedName = await shirtdressCard.locator('.lib-meta .t').textContent();
  console.log(`Selecting reference pattern: "${selectedName}"...`);
  await shirtdressCard.click();
  await page.waitForTimeout(1500);

  const piecesCount = await page.evaluate(() => window.Canvas?.getPieces?.().length ?? 0);
  console.log(`Pattern loaded into 2D canvas with ${piecesCount} pieces.`);

  const shot2D = resolve(ARTIFACTS_DIR, 'pattern_workspace_2d.png');
  await page.screenshot({ path: shot2D, fullPage: false });
  console.log(`Saved screenshot: pattern_workspace_2d.png`);

  console.log('Switching to 3D Preview...');
  const btn3D = page.locator('#viewToggle button[data-v="3d"]');
  await btn3D.click();
  await page.waitForFunction(() => window.View3D?.isReady?.() === true, { timeout: 15000 }).catch(e => {
    console.log('3D readiness note:', e.message);
  });
  await page.waitForTimeout(2000);

  const shot3D = resolve(ARTIFACTS_DIR, 'pattern_workspace_3d.png');
  await page.screenshot({ path: shot3D, fullPage: false });
  console.log(`Saved screenshot: pattern_workspace_3d.png`);

  const report = {
    url: TARGET_URL,
    timestamp: new Date().toISOString(),
    catalogStats,
    patternSelection: {
      name: selectedName,
      piecesCount
    },
    consoleErrors
  };

  const reportPath = resolve(ARTIFACTS_DIR, 'lookbook_audit_report.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`Audit report written to: ${reportPath}`);

  await browser.close();
  console.log('Audit completed successfully!');
}

main().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
