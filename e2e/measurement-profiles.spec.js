import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function ready(page) {
  await page.goto('/index.html');
  await expect.poll(() => page.evaluate(() => window.Canvas?.getPieces?.().length ?? 0), { timeout:20000 }).toBeGreaterThan(0);
  const skip=page.getByRole('button',{name:'Skip'});
  await skip.waitFor({state:'visible',timeout:3000}).catch(()=>null);
  if(await skip.isVisible().catch(()=>false)) await skip.click();
}

async function downloadProject(page) {
  const pending=page.waitForEvent('download');
  await page.locator('#projectBtn').click();
  await page.getByText('Save Project (.json)',{exact:true}).click();
  const file=await pending;
  return JSON.parse(await readFile(await file.path(),'utf8'));
}

test('measurement profiles create, edit, select, preview, import/export, and localize', async ({ page }) => {
  await ready(page);
  await page.locator('#railTabs button[data-pane="measure"]').click();

  await page.getByRole('button',{name:'New Profile'}).click();
  await page.getByLabel('Profile name').fill('Sample Client');
  await page.getByLabel('Notes').fill('First fitting');
  await page.getByLabel('Ease (cm)').fill('3');
  await page.getByLabel('Stretch (%)').fill('8');
  await page.getByLabel('Body-shape context').fill('Pear');
  await page.getByRole('button',{name:'Save Profile'}).click();
  await expect(page.locator('.rail-pane[data-pane="measure"] select').first()).toHaveValue(/mp-/);

  await page.getByRole('button',{name:'Edit Profile'}).click();
  await page.getByLabel('Notes').fill('Approved fitting');
  await page.getByRole('button',{name:'Save Profile'}).click();
  await page.getByRole('button',{name:'Apply to Project'}).click();

  await page.getByRole('button',{name:'Preview Profile'}).click();
  await expect(page.locator('#genericModal')).toContainText('Sample Client');
  await expect(page.locator('#genericModal')).toContainText('Approved fitting');
  await page.locator('#genericModal [data-close]').click();

  const profileDownload=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export Profiles'}).click();
  const profileFile=await profileDownload;
  expect(profileFile.suggestedFilename()).toBe('berrystudio-measurement-profiles.json');

  const imported={ version:1, profiles:[{
    version:1,id:'mp-imported',name:'<style id="profile-injection">body{display:none}</style>Imported Client',units:'cm',category:'women',
    createdAt:'2026-09-27T00:00:00.000Z',updatedAt:'2026-09-27T00:00:00.000Z',source:'imported',
    notes:'Imported evidence',easeCm:2,stretchPercent:0,fitPreference:'regular',bodyShape:'',
    measurements:{chest:90,waist:70,hips:96,shoulder:38,backLen:40,sleeve:58,neck:36,bicep:29,inseam:76,thigh:54,height:168},
  }]};
  await page.locator('.rail-pane[data-pane="measure"] input[type="file"]').setInputFiles({name:'profiles.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(imported))});
  await expect(page.locator('.rail-pane[data-pane="measure"] select').first()).toContainText('Imported Client');
  await page.locator('.rail-pane[data-pane="measure"] select').first().selectOption('mp-imported');
  await page.getByRole('button',{name:'Preview Profile'}).click();
  await expect(page.locator('#genericModal')).toContainText('Imported Client');
  await expect(page.locator('#profile-injection')).toHaveCount(0);
  await page.locator('#genericModal [data-close]').click();

  const project=await downloadProject(page);
  expect(project.measurementProfileSnapshot.name).toBe('Sample Client');
  expect(Object.keys(project.measurementProfileSnapshot.measurements)).toHaveLength(11);

  await page.locator('#langBtn').click();
  await expect(page.locator('.rail-pane[data-pane="measure"]')).toContainText('ملفات القياسات');
});

test('working measurements stay current across grading, tabs, exports, and rejected imports', async ({ page }) => {
  await ready(page);
  await page.getByRole('button',{name:'L',exact:true}).click();
  await page.locator('#railTabs button[data-pane="measure"]').click();
  const pane=page.locator('.rail-pane[data-pane="measure"]');
  const chest=Number(await pane.locator('.meas-row').filter({hasText:'Chest'}).locator('input').inputValue());
  let project=await downloadProject(page);
  expect(project.measurementProfileSnapshot.measurements.chest).toBe(chest);

  const waist=pane.locator('.meas-row').filter({hasText:'Waist'}).locator('input');
  await waist.fill('77'); await waist.blur();
  await page.locator('.project-tab-add').click();
  await page.locator('.project-tab').first().click();
  await expect(pane.locator('.meas-row').filter({hasText:'Waist'}).locator('input')).toHaveValue('77');
  project=await downloadProject(page);
  expect(project.measurementProfileSnapshot.measurements.waist).toBe(77);

  const before=await page.evaluate(()=>JSON.stringify(window.Canvas.getPieces()));
  delete project.measurementProfileSnapshot.measurements.waist;
  const chooser=page.waitForEvent('filechooser');
  await page.locator('#projectBtn').click();
  await page.getByText(/^Import Project/).click();
  const fileChooser=await chooser;
  await fileChooser.setFiles({name:'invalid-project.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
  await expect(page.locator('#toasts')).toContainText("Couldn't read that file");
  expect(await page.evaluate(()=>JSON.stringify(window.Canvas.getPieces()))).toBe(before);
});
