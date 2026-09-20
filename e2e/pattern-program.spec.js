import { test, expect } from '@playwright/test';
test.use({ bypassCSP:false, serviceWorkers:'block' });

async function start(page) {
  await page.route('https://esm.sh/@supabase/supabase-js@2.112.3', route=>route.fulfill({contentType:'application/javascript',body:`
    export function createClient(){return {auth:{onAuthStateChange(cb){setTimeout(()=>cb('SIGNED_IN',{user:{id:'program-fixture',email:'program@example.test'}}),0);return {data:{subscription:{unsubscribe(){}}}};}},from(){return {select(){return this},eq(){return this},async maybeSingle(){return {data:{subscription_status:'active'},error:null};}}}};}` }));
  await page.addInitScript(()=>{if(!localStorage.getItem('pps')) localStorage.setItem('pps',JSON.stringify({onboarded:true}));});
  await page.goto('/index.html'); await expect(page.locator('.project-tab')).toHaveCount(1);
  await page.locator('#railTabs button[data-pane="ai"]').click();
}

test('a resolved woven skirt brief previews and accepts a typed program as a new project',async({page})=>{
  await start(page);
  const brief=page.locator('.design-brief');
  await brief.locator('#briefMessage').fill('knee length woven skirt, waist 72 cm, hips 98 cm');
  await brief.getByRole('button',{name:'Update brief',exact:true}).click();
  const program=page.locator('.pattern-program');
  await expect(program.getByText('Ready to create a typed A-line skirt program.',{exact:true})).toBeVisible();
  await brief.locator('#briefMessage').fill('make it longer');
  await expect(program.getByRole('button',{name:'Preview skirt program',exact:true})).toBeDisabled();
  await brief.locator('#briefMessage').fill('');
  await program.getByRole('button',{name:'Preview skirt program',exact:true}).click();
  await expect(page.getByRole('button',{name:'Accept as new project',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Accept as new project',exact:true}).click();
  await expect(page.locator('.project-tab')).toHaveCount(2);
  const state=await page.evaluate(()=>window.Canvas.snapshotState());
  expect(state.patternProgram.family).toBe('woven-a-line-skirt');
  expect(state.pieces.map(piece=>piece.role)).toEqual(['skirt-front','skirt-back','waistband']);
  expect(state.brief).toBeTruthy();
  await page.reload();
  await expect.poll(()=>page.evaluate(()=>window.Canvas.snapshotState().patternProgram?.family)).toBe('woven-a-line-skirt');
  expect(await page.evaluate(()=>window.Canvas.snapshotState().brief)).toEqual(state.brief);
});
