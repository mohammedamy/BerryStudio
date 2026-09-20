import {test,expect} from '@playwright/test';
test.use({bypassCSP:false,serviceWorkers:'block'});
async function start(page){
  await page.route('https://esm.sh/@supabase/supabase-js@2.112.3',route=>route.fulfill({contentType:'application/javascript',body:`
    export function createClient(){return {
      auth:{onAuthStateChange(cb){setTimeout(()=>cb('SIGNED_IN',{user:{id:'brief-fixture',email:'brief@example.test'}}),0);return {data:{subscription:{unsubscribe(){}}}};}},
      from(){return {select(){return this},eq(){return this},async maybeSingle(){return {data:{subscription_status:'active'},error:null};}}}
    };}` }));
  await page.addInitScript(()=>localStorage.setItem('pps',localStorage.getItem('pps')||JSON.stringify({onboarded:true})));
  await page.goto('/index.html');await expect(page.locator('.project-tab')).toHaveCount(1);
}
for(const lang of ['en','ar']) {
  test(`${lang}: brief conversation survives reload and resolves conflict before a reversible draft proposal`,async({page})=>{
    await start(page);
    if(lang==='ar')await page.locator('#langBtn').click();
    await page.evaluate(()=>window.Canvas.toggleLock(0));
    const original=await page.evaluate(()=>window.Canvas.snapshotState().pieces);
    await page.locator('#railTabs button[data-pane="ai"]').click();
    const panel=page.locator('.design-brief');
    const update=panel.getByRole('button',{name:lang==='en'?'Update brief':'تحديث الموجز',exact:true});
    const draft=panel.getByRole('button',{name:lang==='en'?'Review draft from saved choices':'مراجعة مسودة من الخيارات المحفوظة',exact:true});
    await panel.locator('textarea').fill(lang==='en'?'regular-length woven trousers, waist 70 cm and 90 cm, hips 98 cm':'سروال منسوج بطول عادي، خصر ٧٠ سم و٩٠ سم، أرداف ٩٨ سم');
    await update.click();await expect(draft).toBeDisabled();
    expect(await page.evaluate(()=>window.Canvas.snapshotState().pieces)).toEqual(original);
    await panel.locator('textarea').fill(lang==='en'?'waist 74 cm':'خصر ٧٤ سم');await update.click();
    await expect(draft).toBeEnabled();
    await page.reload();
    await page.locator('#railTabs button[data-pane="ai"]').click();
    await expect(panel.locator('.brief-history')).toContainText(lang==='en'?'waist 74 cm':'خصر ٧٤ سم');
    const brief=await page.evaluate(()=>window.Canvas.snapshotState().brief);
    expect(brief.fields.waist.value).toBe(74);expect(brief.turns).toHaveLength(4);
    await draft.click();await expect(page.locator('#genericModal svg')).toBeVisible();
    expect(await page.evaluate(()=>window.Canvas.snapshotState().pieces)).toEqual(original);
    await page.getByRole('button',{name:lang==='en'?'Accept as new project':'قبول كمشروع جديد',exact:true}).click();
    await expect(page.locator('.project-tab')).toHaveCount(2);
    const accepted=await page.evaluate(()=>window.Canvas.snapshotState());
    expect(accepted.brief.draftInputs.measurements.waist).toBe(74);
    await page.locator('#undoBtn').click();
    expect(await page.evaluate(()=>window.Canvas.snapshotState().pieces)).toHaveLength(0);
    await page.locator('#redoBtn').click();
    expect(await page.evaluate(()=>window.Canvas.snapshotState().brief)).toEqual(accepted.brief);
    await page.locator('.project-tab').first().click();
    expect(await page.evaluate(()=>window.Canvas.snapshotState().pieces)).toEqual(original);
    expect(await page.evaluate(()=>window.Canvas.snapshotState().brief)).toEqual(brief);
  });
}

for(const family of ['skirt','dress']) test(`${family}: brief-generated geometry that fails validation cannot be accepted`,async({page})=>{
  await start(page);
  const before=await page.evaluate(()=>window.Canvas.snapshotState().pieces);
  await page.locator('#railTabs button[data-pane="ai"]').click();
  const panel=page.locator('.design-brief');
  await panel.locator('textarea').fill(`regular-length woven ${family}, waist 74 cm, hips 98 cm`);
  await panel.getByRole('button',{name:'Update brief',exact:true}).click();
  await panel.getByRole('button',{name:'Review draft from saved choices',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Draft needs construction review',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Accept as new project',exact:true})).toHaveCount(0);
  await expect(page.locator('.project-tab')).toHaveCount(1);
  expect(await page.evaluate(()=>window.Canvas.snapshotState().pieces)).toEqual(before);
});

test('a generation result with mismatched declared intent cannot reach acceptance',async({page})=>{
  await start(page);
  await page.evaluate(()=>{
    const generate=window.AIGen.generate;
    window.AIGen.generate=async args=>{const result=await generate(args);return {...result,style:{...result.style,type:'dress'}};};
  });
  await page.locator('#railTabs button[data-pane="ai"]').click();
  const panel=page.locator('.design-brief');
  await panel.locator('textarea').fill('regular-length woven trousers');
  await panel.getByRole('button',{name:'Update brief',exact:true}).click();
  await panel.getByRole('button',{name:'Review draft from saved choices',exact:true}).click();
  await expect(page.locator('#genericModal .modal-body')).toContainText('does not confirm the garment and length');
  await expect(page.getByRole('button',{name:'Accept as new project',exact:true})).toHaveCount(0);
  await expect(page.locator('.project-tab')).toHaveCount(1);
});
