import { test, expect } from '@playwright/test';

test.use({ bypassCSP:false, serviceWorkers:'allow' });
test('a warmed installation reopens its saved drafting project offline', async ({page, context}) => {
  await page.addInitScript(()=>{
    if(!localStorage.getItem('pps')) localStorage.setItem('pps',JSON.stringify({onboarded:true}));
  });
  await page.goto('/index.html');
  await expect(page.locator('.project-tab')).toHaveCount(1);
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
  // Warm dependencies fetched before the worker took control on first visit.
  await page.reload();
  await expect(page.locator('.project-tab')).toHaveCount(1);
  await page.locator('#patternCanvas').click();
  await page.keyboard.press(']');
  await page.keyboard.press('ArrowRight');
  // Saving a setting also snapshots the current edited canvas.
  await page.locator('#unitsPill').click();
  const before=await page.evaluate(()=>window.Canvas.getPieces());
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.project-tab')).toHaveCount(1);
  expect(await page.evaluate(()=>window.Canvas.getPieces())).toEqual(before);
  await page.locator('#railTabs button[data-pane="library"]').click();
  await expect(page.locator('.rail-pane[data-pane="library"]').getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
  await context.setOffline(false);
});
