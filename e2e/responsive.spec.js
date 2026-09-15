import { test, expect } from '@playwright/test';

test.use({ bypassCSP: false });

async function start(page) {
  await page.goto('/index.html');
  await expect(page.locator('#toolrail button[data-tool]')).toHaveCount(25);
  const skip = page.getByRole('button', { name: 'Skip', exact: true });
  await skip.waitFor({ state: 'visible', timeout: 3000 }).catch(() => null);
  if (await skip.isVisible()) await skip.click();
}
async function noOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
}

for (const language of ['en', 'ar']) {
  test(`390px ${language}: canvas, controls, panels and focus remain usable`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await start(page);
    if (language === 'ar') await page.locator('#langBtn').click();
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    if (language === 'ar') {
      for (const action of await page.locator('.stage-toolbar button').all()) {
        await expect(action).toHaveAttribute('aria-label', /[\u0600-\u06ff]/);
      }
    }
    await noOverflow(page);
    await expect(page.locator('#rightRail')).toBeHidden();
    await expect(page.locator('#headerActions')).toBeHidden();
    const canvas = await page.locator('#patternCanvas').boundingBox();
    expect(canvas.width).toBeGreaterThanOrEqual(320);
    expect(canvas.height).toBeGreaterThanOrEqual(400);
    for (const selector of ['#projectBtn', '#langBtn', '#mobileRailBtn', '#mobileMenuBtn', '#catSeg', '#viewToggle']) {
      const box = await page.locator(selector).boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
    }
    await page.locator('#mobileRailBtn').click();
    await expect(page.locator('#mobileRailBtn')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#closeRailBtn')).toBeFocused();
    await page.locator('#railTabs button[data-pane="size"]').click();
    const headingIcon = await page.locator('.rail-pane[data-pane="size"] .section-title svg').first().boundingBox();
    expect(headingIcon.height).toBeLessThanOrEqual(20);
    await page.getByRole('button', { name: 'XL', exact: true }).click();
    await expect(page.locator('#chipSize')).toContainText('XL');
    await noOverflow(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('#rightRail')).toBeHidden();
    await expect(page.locator('#mobileRailBtn')).toBeFocused();
    await page.locator('#mobileMenuBtn').click();
    await expect(page.locator('#settingsBtn')).toBeVisible();
    await expect(page.locator('#accountBtn')).toBeVisible();
    await noOverflow(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('#headerActions')).toBeHidden();
    await expect(page.locator('#mobileMenuBtn')).toBeFocused();
    await page.locator('#mobileRailBtn').click();
    await page.locator('#closeRailBtn').click();
    await expect(page.locator('#mobileRailBtn')).toBeFocused();
    // A viewport transition restores desktop controls without keeping focus
    // on a mobile-only button or hiding the desktop inspector.
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator('#rightRail')).toBeVisible();
    await expect(page.locator('#settingsBtn')).toBeVisible();
    await expect(page.locator('#mobileMenuBtn')).toBeHidden();
    await expect(page.locator('#projectBtn')).toBeFocused();
    await noOverflow(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('#rightRail')).toBeHidden();
  });
}

for (const width of [320, 768, 1024]) {
  test(`${width}px: compact controls fit and panel can close with an outside click`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await start(page);
    await noOverflow(page);
    await page.locator('#mobileRailBtn').click();
    await expect(page.locator('#rightRail')).toBeVisible();
    await page.locator('#projectTabs').click({ position: { x: 4, y: 4 } });
    await expect(page.locator('#rightRail')).toBeHidden();
    await page.locator('#mobileMenuBtn').click();
    await expect(page.locator('#headerActions')).toBeVisible();
    await noOverflow(page);
  });
}

test('canvas pixel size follows layout changes without a window resize', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await start(page);
  const height = await page.locator('#patternCanvas').evaluate(canvas => canvas.height);
  // A taller project strip reproduces the layout-only resize that previously
  // left drawing and pointer coordinates out of sync.
  await page.locator('#projectTabs').evaluate(tabs => { tabs.style.paddingBlock = '28px'; });
  await expect.poll(() => page.locator('#patternCanvas').evaluate(canvas => {
    return Math.abs(canvas.height - canvas.getBoundingClientRect().height * devicePixelRatio);
  })).toBeLessThan(2);
  const resized = await page.locator('#patternCanvas').evaluate(canvas => canvas.height);
  expect(resized).toBeLessThan(height);
});
