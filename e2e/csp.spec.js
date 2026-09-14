import { test, expect } from '@playwright/test';

// Real visitor policy: the broad smoke suite bypasses CSP and cannot catch
// a blocked import map preventing React from loading in BodyForm.
test.use({ bypassCSP: false });

test('BodyForm mounts its embedded canvas with production CSP enforced', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/body.html');
  try {
    await expect(page.locator('#clothLabEmbed canvas')).toBeVisible({ timeout: 25000 });
  } catch (error) {
    throw new Error(`${error.message}\nBrowser errors: ${errors.join('\n') || '(none)'}`);
  }
  expect(errors.filter(error => /import map|importmap|module specifier|Content Security Policy|embed failed/i.test(error))).toEqual([]);
});


test('drafting controls retain accessible names when switching to Arabic with CSP active', async ({ page }) => {
  await page.goto('/index.html');
  const skip = page.getByRole('button', { name: 'Skip', exact: true });
  await skip.waitFor({ state: 'visible', timeout: 3000 }).catch(() => null);
  if (await skip.isVisible()) await skip.click();
  const tools = page.locator('.toolrail button[data-tool]');
  await expect(tools).toHaveCount(25);
  for (const tool of await tools.all()) await expect(tool).toHaveAttribute('aria-label', /\S/);
  const fit = page.locator('#zfit');
  await expect(fit).toHaveAttribute('aria-label', /\S/);
  const englishFitLabel = await fit.getAttribute('aria-label');
  await page.locator('#langBtn').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  for (const tool of await tools.all()) await expect(tool).toHaveAttribute('aria-label', /[\u0600-\u06ff]/);
  await expect(fit).toHaveAttribute('aria-label', /[\u0600-\u06ff]/);
  expect(await fit.getAttribute('aria-label')).not.toBe(englishFitLabel);
});
