import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.use({ bypassCSP: false, serviceWorkers: 'block' });

// Only the remote SDK boundary is replaced. The real app, auth wrapper,
// entitlement decisions and production CSP run unchanged. No test account
// or authorization bypass is shipped in production code.
async function start(page, profile = null, user = null) {
  await page.route('https://esm.sh/@supabase/supabase-js@2.112.3', route => route.fulfill({
    contentType: 'application/javascript',
    body: `export function createClient(){
      window.authFixture = {profile:${JSON.stringify(profile)}, user:${JSON.stringify(user)}, fail:false, delay:false, pending:[], calls:0,
        emit(user){ this.user=user; this.callback('SIGNED_IN', user ? {user:{id:user,email:user+'@example.test'}} : null); }};
      const f=window.authFixture;
      return {auth:{onAuthStateChange(cb){ f.callback=cb; setTimeout(()=>f.emit(f.user),0); return {data:{subscription:{unsubscribe(){}}}}; }},
        from(){return {select(){return this},eq(){return this},async maybeSingle(){
          f.calls++; const result={data:f.profile,error:f.fail ? {message:'offline fixture'} : null};
          if(f.delay) await new Promise(resolve=>f.pending.push(resolve));
          return result;
        }}}};
    }`,
  }));
  await page.addInitScript(() => {
    if(!localStorage.getItem('pps')) localStorage.setItem('pps', JSON.stringify({onboarded:true}));
  });
  await page.goto('/index.html');
  await expect(page.locator('.project-tab')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => !!window.authFixture?.callback)).toBe(true);
}
async function library(page, allowed) {
  await page.locator('#railTabs button[data-pane="library"]').click();
  const gate = page.locator('.rail-pane[data-pane="library"]').getByRole('button', {name:/^(Sign in|Upgrade)$/});
  if(allowed) await expect(gate).toHaveCount(0);
  else await expect(gate).toBeVisible();
}
const active = {subscription_status:'active',trial_started_at:null};
for(const [name, profile, user, allowed] of [
  ['signed out',null,null,false],
  ['fresh trial',{subscription_status:'trial',trial_started_at:new Date().toISOString()},'trial-user',true],
  ['expired trial',{subscription_status:'trial',trial_started_at:'2020-01-01'},'expired-user',false],
  ['active account',active,'active-user',true],
  ['missing profile',null,'missing-user',false],
]) {
  test(`${name}: access follows account state with CSP enforced`, async ({page}) => {
    await start(page, profile, user);
    if(user) await expect.poll(()=>page.evaluate(()=>window.authFixture.calls)).toBe(1);
    await library(page, allowed);
    for(const pane of ['ai','builder']) {
      await page.locator(`#railTabs button[data-pane="${pane}"]`).click();
      const gate=page.locator(`.rail-pane[data-pane="${pane}"]`).getByRole('button',{name:/^(Sign in|Upgrade)$/});
      if(allowed) await expect(gate).toHaveCount(0); else await expect(gate).toBeVisible();
    }
    await expect(page.locator('#patternCanvas')).toBeVisible();
  });
}

test('failed refresh retains access only for the same account; delayed results cannot undo sign-out', async ({page}) => {
  await start(page, active, 'owner');
  await library(page,true);
  await page.evaluate(()=>{const f=window.authFixture;f.fail=true;f.emit('owner');});
  await expect.poll(()=>page.evaluate(()=>window.authFixture.calls)).toBe(2);
  await library(page,true);
  await page.evaluate(()=>window.authFixture.emit('different-user'));
  await library(page,false);
  await page.evaluate(()=>{const f=window.authFixture;f.fail=false;f.delay=true;f.emit('owner');});
  await expect.poll(()=>page.evaluate(()=>window.authFixture.pending.length)).toBe(1);
  await page.evaluate(()=>{const f=window.authFixture;f.emit(null);f.pending[0]();});
  await library(page,false);
  await expect(page.locator('.rail-pane[data-pane="library"]')).toContainText('Sign in');
});

async function menu(page, text) {
  await page.locator('#projectBtn').click();
  await page.getByText(text,{exact:true}).click();
}
async function exportProject(page) {
  const download = page.waitForEvent('download');
  await menu(page,'Save Project (.json)');
  const payload=JSON.parse(await readFile(await (await download).path(),'utf8'));
  // Import normalizes omitted defaults; annotation screen hitboxes are
  // recalculated for the current zoom and are not design coordinates.
  payload.pieces=payload.pieces.map(p=>({locked:false,material:null,bodyZone:null,...p}));
  payload.texts=payload.texts.map(t=>Object.fromEntries(Object.entries(t).filter(([key])=>!['_h','_w','_sx','_sy'].includes(key))));
  return payload;
}
async function importProject(page, data) {
  const chooser = page.waitForEvent('filechooser');
  await menu(page,'Import Project…');
  await (await chooser).setFiles({name:'roundtrip.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
}

test('JSON download/import and reload preserve edited projects and independent tabs', async ({page}) => {
  await start(page);
  await page.evaluate(()=>{
    const c=window.Canvas;
    c.nudgePiece(0,7,3);
    c.addText({x:5,y:5,text:'Design notes'});
    c.setVariable('waist','72');
  });
  const original=await exportProject(page);
  await page.locator('.project-tab-add').click();
  await importProject(page,original);
  await expect.poll(()=>page.evaluate(()=>window.Canvas.getTexts().length)).toBe(1);
  expect(await exportProject(page)).toEqual(original);
  await page.reload();
  await expect(page.locator('.project-tab')).toHaveCount(2);
  expect(await exportProject(page)).toEqual(original);
  await page.locator('.project-tab').first().click();
  expect(await exportProject(page)).toEqual(original);
  await page.locator('.project-tab-add').click();
  await expect(page.locator('.project-tab')).toHaveCount(3);
  const ids=await page.evaluate(()=>JSON.parse(localStorage.getItem('pps')).projects.map(p=>p.id));
  expect(new Set(ids).size).toBe(3);
});

test('corrupt saved JSON does not prevent drafting from starting', async ({page}) => {
  await page.addInitScript(()=>localStorage.setItem('pps','{broken'));
  await start(page);
  await expect(page.locator('#patternCanvas')).toBeVisible();
});

test('a cached trial expires even when its refresh fails', async ({page}) => {
  const now=Date.now();
  await start(page,{subscription_status:'trial',trial_started_at:new Date(now-29*86400000).toISOString()},'trial');
  await library(page,true);
  await page.clock.setFixedTime(new Date(now+2*86400000));
  await page.evaluate(()=>{const f=window.authFixture;f.fail=true;f.emit('trial');});
  await library(page,false);
});
