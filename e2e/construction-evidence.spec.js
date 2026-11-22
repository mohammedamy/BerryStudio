import { test, expect } from '@playwright/test';

test.use({ bypassCSP: false, serviceWorkers: 'block' });

async function start(page) {
  await page.route('https://esm.sh/@supabase/supabase-js@2.112.3', route => route.fulfill({ contentType: 'application/javascript', body: `
    export function createClient(){return {auth:{onAuthStateChange(cb){setTimeout(()=>cb('SIGNED_IN',{user:{id:'evidence-fixture',email:'evidence@example.test'}}),0);return {data:{subscription:{unsubscribe(){}}}};}},from(){return {select(){return this},eq(){return this},async maybeSingle(){return {data:{subscription_status:'active'},error:null};}}}};}` }));
  await page.addInitScript(() => localStorage.setItem('pps', localStorage.getItem('pps') || JSON.stringify({ onboarded: true })));
  await page.goto('/index.html');
  await expect(page.locator('.project-tab')).toHaveCount(1);
}

test('construction evidence download records an unsupported draft without claiming approval', async ({ page }) => {
  await start(page);
  await page.locator('#railTabs button[data-pane="export"]').click();
  await page.getByRole('button', { name: 'Review construction evidence', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Construction evidence', exact: true })).toBeVisible();
  await expect(page.locator('#genericModal .modal-body')).toContainText('No supported construction-evidence assessment');
  await expect(page.locator('#genericModal .modal-body')).toContainText('Readiness stage: Unsupported');
  await expect(page.locator('#genericModal .modal-body')).toContainText('Maker approval: not recorded');
  await expect(page.locator('#genericModal .modal-body')).toContainText('Production eligibility: not eligible');
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download construction evidence', exact: true }).click();
  const evidence = await download;
  expect(evidence.suggestedFilename()).toBe('berrystudio-construction-evidence.json');
  const stream = await evidence.createReadStream();
  let json = '';
  for await (const chunk of stream) json += chunk;
  const record = JSON.parse(json);
  expect(record.schema).toBe('berrystudio.construction-evidence.v1');
  expect(record.readinessStage).toBe('unsupported');
  expect(record.packet.supported).toBe(false);
  expect(record.assessment.decision).toBe('not-applicable');
  expect(record.assessment.blockers).toEqual(['constructionFamilyUnsupported']);
  expect(record.approvals.productionEligible).toBe(false);
});

test('in-app construction review shows a measured declared seam without claiming approval', async ({ page }) => {
  await start(page);
  await page.evaluate(() => window.Canvas.loadPieces([
    { role: 'skirt-front', name: { en: 'Front', ar: 'أمام' }, outline: [[0,0],[10,0],[10,20],[0,20]], edges: [{ seamId: 'side', fromIdx: 1, toIdx: 2 }] },
    { role: 'skirt-back', name: { en: 'Back', ar: 'خلف' }, outline: [[0,0],[10,0],[10,20],[0,20]], edges: [{ seamId: 'side', fromIdx: 1, toIdx: 2 }] },
  ]));
  await page.locator('#railTabs button[data-pane="export"]').click();
  await page.getByRole('button', { name: 'Review construction evidence', exact: true }).click();
  const body = page.locator('#genericModal .modal-body');
  await expect(body).toContainText('Declared geometry check: side-seam lengths match');
  await expect(body).toContainText('Seam side: 20.0 cm / 20.0 cm · 0.0 mm');
  await expect(body).toContainText('Construction handoff steps');
  await expect(body).toContainText('Readiness stage: Geometry checked');
  await expect(body).toContainText('Sewn-sample approval: not recorded');
  await expect(body).toContainText('Production eligibility: not eligible');
});

test('in-app construction review displays 4-piece dress checks and handoff steps without claiming approval', async ({ page }) => {
  await start(page);
  await page.evaluate(() => window.Canvas.loadPieces([
    { key: 'bodiceFront', role: 'bodice-front', name: { en: 'Bodice Front', ar: 'أمام الصدّار' }, outline: [[0,0],[24,0],[24,30],[0,30]], edges: [{ seamId: 'dress-bodice-side', fromIdx: 1, toIdx: 2 }] },
    { key: 'bodiceBack', role: 'bodice-back', name: { en: 'Bodice Back', ar: 'خلف الصدّار' }, outline: [[0,35],[24,35],[24,65],[0,65]], edges: [{ seamId: 'dress-bodice-side', fromIdx: 1, toIdx: 2 }] },
    { key: 'skirtFront', role: 'skirt-front', name: { en: 'Skirt Front', ar: 'أمام التنورة' }, outline: [[0,70],[24,70],[28,130],[0,130]], edges: [{ seamId: 'dress-skirt-side', fromIdx: 1, toIdx: 2 }] },
    { key: 'skirtBack', role: 'skirt-back', name: { en: 'Skirt Back', ar: 'خلف التنورة' }, outline: [[0,140],[24,140],[28,200],[0,200]], edges: [{ seamId: 'dress-skirt-side', fromIdx: 1, toIdx: 2 }] },
  ]));
  await page.locator('#railTabs button[data-pane="export"]').click();
  await page.getByRole('button', { name: 'Review construction evidence', exact: true }).click();
  const body = page.locator('#genericModal .modal-body');
  await expect(body).toContainText('Declared geometry check: bodice and skirt side-seam lengths match');
  await expect(body).toContainText('Seam dress-bodice-side: 30.0 cm / 30.0 cm · 0.0 mm');
  await expect(body).toContainText('dress-skirt-side');
  await expect(body).toContainText('Construction handoff steps');
  await expect(body).toContainText('Readiness stage: Geometry checked');
  await expect(body).toContainText('Production eligibility: not eligible');
});
