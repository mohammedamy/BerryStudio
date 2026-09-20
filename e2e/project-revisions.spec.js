import { test, expect } from '@playwright/test';
test.use({bypassCSP:false,serviceWorkers:'block'});

async function start(page) {
  await page.route('https://esm.sh/@supabase/supabase-js@2.112.3', route=>route.fulfill({contentType:'application/javascript',body:`
    export function createClient(){
      return {
        auth:{onAuthStateChange(cb){
          setTimeout(()=>cb('SIGNED_IN',{user:{id:'review-fixture',email:'fixture@example.test'}}),0);
          return {data:{subscription:{unsubscribe(){}}}};
        }},
        from(){return {select(){return this},eq(){return this},async maybeSingle(){
          return {data:{subscription_status:'active'},error:null};
        }}}};
    }` }));
  await page.addInitScript(()=>localStorage.setItem('pps',localStorage.getItem('pps')||JSON.stringify({onboarded:true})));
  await page.goto('/index.html');
  await expect(page.locator('.project-tab')).toHaveCount(1);
}
async function review(page) {
  await page.locator('#projectBtn').click();
  await page.getByRole('button',{name:'Review change…',exact:true}).click();
}
// Automatic canvas fitting can change camera values when a panel opens;
// content preservation assertions concern persisted design fields.
const design = page => page.evaluate(()=>{
  const {view:_view,...content}=window.Canvas.snapshotState();return content;
});

for (const lang of ['en','ar']) {
  test(`${lang}: unreadable reference requests clarification and preserves the draft until explicit text-only retry`,async({page})=>{
    await start(page);
    if(lang==='ar') await page.locator('#langBtn').click();
    const before=await design(page);
    await page.locator('#railTabs button[data-pane="ai"]').click();
    const pane=page.locator('.rail-pane[data-pane="ai"]');
    await page.locator('#aiPrompt').fill('regular-length woven skirt');
    const picker=page.waitForEvent('filechooser');
    await pane.getByRole('button',{name:lang==='en'?'Upload inspiration image':'رفع صورة مرجعية',exact:true}).click();
    await (await picker).setFiles('evaluation/v6-06/references/skirt-front.svg');
    const preview=pane.locator(':scope > .ai-preview');
    await expect(preview).toHaveClass(/show/);
    const generate=pane.getByRole('button',{name:lang==='en'?'Generate Pattern':'توليد الباترون',exact:true});
    await generate.click();
    await expect(page.getByRole('heading',{name:lang==='en'?'A clearer reference is needed':'نحتاج إلى صورة مرجعية أوضح'})).toBeVisible();
    await expect(page.locator('#genericModal .modal-body')).toContainText(lang==='en'?'No draft was created.':'لم يتم إنشاء مسودة.');
    expect(await design(page)).toEqual(before);
    await expect(page.locator('.project-tab')).toHaveCount(1);
    await expect(generate).toBeEnabled();
    await page.locator('[data-close="#genericModal"]').click();
    await expect(page.locator('#aiPrompt')).toHaveValue('regular-length woven skirt');
    await preview.locator('.ai-x').click();
    await generate.click();
    await expect(page.locator('#genericModal')).toHaveClass(/show/);
    await expect(page.locator('#genericModal svg')).toBeVisible();
    expect(await design(page)).toEqual(before);
  });
}

test('preview/reject, accept/undo/redo and stale/locked rejection with CSP enforced',async({page})=>{
  await start(page);
  const original=await design(page);
  await review(page);
  await page.getByLabel('Horizontal move (cm)').fill('7');
  await page.getByRole('button',{name:'Preview change',exact:true}).click();
  expect((await design(page)).pieces).toEqual(original.pieces);
  await page.getByRole('button',{name:'Reject',exact:true}).click();
  expect((await design(page)).pieces).toEqual(original.pieces);
  await review(page);
  await page.getByLabel('Horizontal move (cm)').fill('7');
  await page.getByRole('button',{name:'Preview change',exact:true}).click();
  await page.getByRole('button',{name:'Accept change',exact:true}).click();
  const accepted=await design(page);
  expect(accepted.pieces[0].outline[0][0]).toBe(original.pieces[0].outline[0][0]+7);
  expect(accepted.projectMeta.revision).toBe(original.projectMeta.revision + 1);
  await page.evaluate(()=>window.Canvas.doUndo());
  expect((await design(page)).pieces).toEqual(original.pieces);
  await page.evaluate(()=>window.Canvas.doRedo());
  expect((await design(page)).pieces).toEqual(accepted.pieces);
  await review(page);
  await page.getByRole('button',{name:'Preview change',exact:true}).click();
  await page.evaluate(()=>window.Canvas.nudgePiece(0,1,0));
  await page.getByRole('button',{name:'Accept change',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('project changed');
  await page.getByRole('button',{name:'Reject',exact:true}).click();
  await page.evaluate(()=>window.Canvas.toggleLock(0));
  await review(page);
  await page.getByRole('button',{name:'Preview change',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Unlock this piece');
});

test('Arabic review preserves revision and stable IDs after reload and tab changes',async({page})=>{
  await start(page);
  await page.locator('#langBtn').click();
  await page.locator('#projectBtn').click();
  await page.getByText('مراجعة تعديل…',{exact:true}).click();
  await page.getByLabel('التعديل',{exact:true}).selectOption('rename');
  await page.getByLabel('الاسم الجديد').fill('قطعة أمامية');
  await page.getByRole('button',{name:'معاينة التعديل',exact:true}).click();
  await page.getByRole('button',{name:'قبول التعديل',exact:true}).click();
  const accepted=await design(page);
  await page.locator('.project-tab-add').click();
  await page.evaluate(()=>window.Canvas.doUndo());
  expect((await design(page)).pieces).toHaveLength(0);
  await page.locator('.project-tab').first().click();
  await page.reload();
  await expect(page.locator('.project-tab')).toHaveCount(2);
  expect((await design(page)).pieces).toEqual(accepted.pieces);
  expect((await design(page)).projectMeta).toEqual(accepted.projectMeta);
});

test('AI draft requires review and preserves the existing project, including locked pieces',async({page})=>{
  await start(page);
  await page.evaluate(()=>window.Canvas.toggleLock(0));
  const before=await design(page);
  await page.locator('#railTabs button[data-pane="ai"]').click();
  await page.locator('#aiPrompt').fill('simple woven skirt');
  await page.locator('.rail-pane[data-pane="ai"]').getByRole('button',{name:'Generate Pattern',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Review generated draft'})).toBeVisible({timeout:20000});
  expect((await design(page)).pieces).toEqual(before.pieces);
  await page.getByRole('button',{name:'Reject',exact:true}).click();
  expect((await design(page)).pieces).toEqual(before.pieces);
  await expect(page.locator('.project-tab')).toHaveCount(1);
  await page.locator('.rail-pane[data-pane="ai"]').getByRole('button',{name:'Generate Pattern',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Review generated draft'})).toBeVisible({timeout:20000});
  await page.getByRole('button',{name:'Accept as new project'}).click();
  await expect(page.locator('.project-tab')).toHaveCount(2);
  const draft=await design(page);
  await page.evaluate(()=>window.Canvas.doUndo());
  expect((await design(page)).pieces).toHaveLength(0);
  await page.evaluate(()=>window.Canvas.doRedo());
  expect((await design(page)).pieces).toEqual(draft.pieces);
  await page.locator('.project-tab').first().click();
  expect((await design(page)).pieces).toEqual(before.pieces);
});
