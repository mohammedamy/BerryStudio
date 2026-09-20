import { test, expect } from '@playwright/test';
test.use({ bypassCSP:false, serviceWorkers:'block' });
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9JLy8AAAAASUVORK5CYII=','base64');

async function start(page, config={}) {
  await page.route('https://esm.sh/@supabase/supabase-js@2.112.3', route=>route.fulfill({contentType:'application/javascript',body:`
    export function createClient(){return {auth:{onAuthStateChange(cb){setTimeout(()=>cb('SIGNED_IN',{user:{id:'image-fixture',email:'image@example.test'}}),0);return {data:{subscription:{unsubscribe(){}}}};}},from(){return {select(){return this},eq(){return this},async maybeSingle(){return {data:{subscription_status:'active'},error:null};}}}};}` }));
  await page.addInitScript(value=>{ if(!localStorage.getItem('pps')) localStorage.setItem('pps',JSON.stringify({onboarded:true,...value})); },config);
  await page.goto('/index.html'); await expect(page.locator('.project-tab')).toHaveCount(1);
  await page.locator('#railTabs button[data-pane="ai"]').click();
}

test('text concept and permitted reference variation persist, select and undo without changing geometry',async({page})=>{
  const endpoint='https://image.example.test/generate';
  await page.route(endpoint,route=>route.fulfill({contentType:'application/json',body:JSON.stringify({image:`data:image/png;base64,${png.toString('base64')}`})}));
  await start(page,{aiImageProvider:'proxy',aiImageProviderCfg:{proxy:{baseUrl:endpoint}}});
  const studio=page.locator('.image-studio'); const original=await page.evaluate(()=>window.Canvas.snapshotState().pieces);
  await studio.locator('#imageStudioPrompt').fill('tailored cobalt trousers with a linen texture');
  await studio.getByRole('button',{name:'Generate concept',exact:true}).click();
  await expect(studio.getByText('Concept ready.',{exact:false})).toBeVisible();
  let saved=await page.evaluate(()=>window.Canvas.snapshotState().imageStudio);
  expect(saved.concepts).toHaveLength(1); expect(saved.concepts[0].mode).toBe('text-to-image');
  expect(await page.evaluate(()=>window.Canvas.snapshotState().pieces)).toEqual(original);
  const picker=page.waitForEvent('filechooser'); await studio.getByRole('button',{name:'Add reference image',exact:true}).click();
  await (await picker).setFiles({name:'reference.png',mimeType:'image/png',buffer:png});
  await studio.getByLabel('I have permission to use this reference in this project').check();
  await expect(studio.getByText('Reference saved to this project.',{exact:true})).toBeVisible();
  await studio.locator('#imageStudioPrompt').fill('preserve the silhouette and blue linen texture');
  await studio.getByRole('button',{name:'Generate concept',exact:true}).click();
  await expect(studio.getByText('Concept ready.',{exact:false})).toBeVisible();
  saved=await page.evaluate(()=>window.Canvas.snapshotState().imageStudio);
  expect(saved.concepts).toHaveLength(2); expect(saved.concepts[1].mode).toBe('image-to-image');
  expect(saved.concepts[1].referenceIds).toEqual([saved.source.id]);
  await page.reload();
  await expect.poll(()=>page.evaluate(()=>window.Canvas.snapshotState().imageStudio?.selectedId)).toBe(saved.selectedId);
  await page.locator('#railTabs button[data-pane="ai"]').click();
  await page.locator('#undoBtn').click(); expect((await page.evaluate(()=>window.Canvas.snapshotState().imageStudio)).concepts).toHaveLength(1);
  await page.locator('#redoBtn').click(); expect((await page.evaluate(()=>window.Canvas.snapshotState().imageStudio)).concepts).toHaveLength(2);
});

test('reference editing is disabled with an honest ComfyUI capability explanation',async({page})=>{
  await start(page,{aiImageProvider:'comfyui',aiImageProviderCfg:{comfyui:{baseUrl:'http://127.0.0.1:8188'}}});
  const studio=page.locator('.image-studio');
  const picker=page.waitForEvent('filechooser'); await studio.getByRole('button',{name:'Add reference image',exact:true}).click();
  await (await picker).setFiles({name:'reference.png',mimeType:'image/png',buffer:png});
  await studio.getByLabel('I have permission to use this reference in this project').check();
  await studio.locator('#imageStudioPrompt').fill('preserve this silhouette');
  await expect(studio.getByText('supports text-to-image only',{exact:false})).toBeVisible();
  await expect(studio.getByRole('button',{name:'Generate concept',exact:true})).toBeDisabled();
});

test('cancelled results cannot overwrite a retry and results cannot cross project tabs',async({page})=>{
  const endpoint='https://image.example.test/race';
  const pending=[];
  await page.route(endpoint,route=>{pending.push(route);});
  await start(page,{aiImageProvider:'proxy',aiImageProviderCfg:{proxy:{baseUrl:endpoint}}});
  const studio=page.locator('.image-studio'), prompt=studio.locator('#imageStudioPrompt');
  await prompt.fill('first cancelled request');
  await studio.getByRole('button',{name:'Generate concept',exact:true}).click();
  await expect.poll(()=>pending.length).toBe(1);
  await expect(prompt).toBeDisabled();
  await studio.getByRole('button',{name:'Stop waiting',exact:true}).click();
  await prompt.fill('second request');
  await studio.getByRole('button',{name:'Generate concept',exact:true}).click();
  await expect.poll(()=>pending.length).toBe(2);
  const response={contentType:'application/json',body:JSON.stringify({image:`data:image/png;base64,${png.toString('base64')}`})};
  await pending[0].fulfill(response);
  await expect(prompt).toBeDisabled();
  await pending[1].fulfill(response);
  await expect(studio.getByText('Concept ready.',{exact:false})).toBeVisible();
  const concepts=await page.evaluate(()=>window.Canvas.snapshotState().imageStudio.concepts);
  expect(concepts.map(c=>c.prompt)).toEqual(['second request']);
  expect(await page.evaluate(()=>window.Canvas.snapshotState().imageStudio.selectedId)).toBeNull();
  await studio.locator('.image-studio-gallery button').click();
  expect(await page.evaluate(()=>window.Canvas.snapshotState().imageStudio.selectedId)).toBe(concepts[0].id);
  await prompt.fill('old project request');
  await studio.getByRole('button',{name:'Generate concept',exact:true}).click();
  await expect.poll(()=>pending.length).toBe(3);
  await page.locator('.project-tab-add').click();
  await pending[2].fulfill(response);
  await expect(page.locator('.project-tab')).toHaveCount(2);
  expect(await page.evaluate(()=>window.Canvas.snapshotState().imageStudio)).toBeUndefined();
  await page.locator('.project-tab').first().click();
  expect((await page.evaluate(()=>window.Canvas.snapshotState().imageStudio.concepts)).map(c=>c.prompt)).toEqual(['second request']);
});

test('storage quota failure rolls back an image update instead of claiming it was saved',async({page})=>{
  const endpoint='https://image.example.test/quota';
  await page.route(endpoint,route=>route.fulfill({contentType:'application/json',body:JSON.stringify({image:`data:image/png;base64,${png.toString('base64')}`})}));
  await start(page,{aiImageProvider:'proxy',aiImageProviderCfg:{proxy:{baseUrl:endpoint}}});
  await page.evaluate(()=>{const set=Storage.prototype.setItem; Storage.prototype.setItem=function(key,value){if(key==='pps') throw new DOMException('Full','QuotaExceededError'); return set.call(this,key,value);};});
  const studio=page.locator('.image-studio');
  await studio.locator('#imageStudioPrompt').fill('quota test');
  await studio.getByRole('button',{name:'Generate concept',exact:true}).click();
  await expect(studio.locator('[aria-live]')).not.toBeEmpty();
  await expect(studio.locator('#imageStudioPrompt')).toBeEnabled();
  expect(await page.evaluate(()=>window.Canvas.snapshotState().imageStudio)).toBeUndefined();
  await expect(studio.getByText('Concept ready.',{exact:false})).toHaveCount(0);
});
