import { test, expect } from '@playwright/test';

test.use({ bypassCSP: false, serviceWorkers: 'block' });

async function startSignedIn(page) {
  await page.route('https://esm.sh/@supabase/supabase-js@2.112.3', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `export function createClient(){return {auth:{onAuthStateChange(cb){setTimeout(()=>cb('SIGNED_IN',{user:{id:'clothlab-e2e',email:'clothlab@example.test'}}),0);return {data:{subscription:{unsubscribe(){}}}};}},from(){return {select(){return this},eq(){return this},async maybeSingle(){return {data:{subscription_status:'active'},error:null};}}}};}`
    })
  );
  await page.addInitScript(() => {
    localStorage.setItem('pps', localStorage.getItem('pps') || JSON.stringify({ onboarded: true }));
  });
  await page.goto('/index.html');
  await expect(page.locator('.project-tab')).toHaveCount(1);
}

test('embedded Cloth Lab guided workflow opens cleanly without host overlay collision and simulates garments', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    if (/Failed to load resource.*404/.test(msg.text())) return;
    errors.push(msg.text());
  });

  await startSignedIn(page);

  await page.locator('#viewToggle button[data-v="clothlab"]').click();
  const root = page.locator('#clothLabEmbed .cloth-lab-root');
  await expect(root).toBeVisible({ timeout: 15_000 });

  // Host 2D overlays must be hidden so they never cover Cloth Lab's action bar.
  await expect(page.locator('.zoombar')).not.toBeVisible();
  await expect(page.locator('#emptyState')).not.toBeVisible();

  const tryOnBtn = root.getByRole('button', { name: /Try it on/ });
  await expect(tryOnBtn).toBeVisible();
  await tryOnBtn.click();

  const simCanvas = root.locator('canvas').first();
  await expect(simCanvas).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => (await simCanvas.boundingBox())?.width ?? 0, { timeout: 15_000 }).toBeGreaterThan(250);
  await expect.poll(async () => (await simCanvas.boundingBox())?.height ?? 0, { timeout: 15_000 }).toBeGreaterThan(250);

  // Switching category while inside Cloth Lab automatically syncs the new garment (boys_trousers).
  await page.locator('#catSeg button[data-cat="boys"]').click();
  await expect(root.locator('.cl-piece-card')).toHaveCount(3);
  await root.getByRole('button', { name: /Try it on/ }).click();
  await expect(simCanvas).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => (await simCanvas.boundingBox())?.height ?? 0, { timeout: 15_000 }).toBeGreaterThan(250);

  expect(errors, `Console errors:\n${errors.join('\n')}`).toEqual([]);
});
