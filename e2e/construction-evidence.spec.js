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
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download construction evidence', exact: true }).click();
  const evidence = await download;
  expect(evidence.suggestedFilename()).toBe('berrystudio-construction-evidence.json');
  const stream = await evidence.createReadStream();
  let json = '';
  for await (const chunk of stream) json += chunk;
  const record = JSON.parse(json);
  expect(record.schema).toBe('berrystudio.construction-evidence.v1');
  expect(record.assessment.decision).toBe('not-applicable');
  expect(record.assessment.blockers).toEqual(['constructionFamilyUnsupported']);
  expect(record.approvals.productionEligible).toBe(false);
});
