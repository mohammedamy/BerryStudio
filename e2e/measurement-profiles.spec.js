import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function ready(page) {
  await page.goto('/index.html');
  await expect.poll(() => page.evaluate(() => window.Canvas?.getPieces?.().length ?? 0), { timeout:20000 }).toBeGreaterThan(0);
  const skip=page.getByRole('button',{name:'Skip'});
  await skip.waitFor({state:'visible',timeout:3000}).catch(()=>null);
  if(await skip.isVisible().catch(()=>false)) await skip.click();
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
    version:1,id:'mp-imported',name:'Imported Client',units:'cm',category:'women',
    createdAt:'2026-09-27T00:00:00.000Z',updatedAt:'2026-09-27T00:00:00.000Z',source:'imported',
    notes:'Imported evidence',easeCm:2,stretchPercent:0,fitPreference:'regular',bodyShape:'',
    measurements:{chest:90,waist:70,hips:96,shoulder:38,backLen:40,sleeve:58,neck:36,bicep:29,inseam:76,thigh:54,height:168},
  }]};
  await page.locator('.rail-pane[data-pane="measure"] input[type="file"]').setInputFiles({name:'profiles.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(imported))});
  await expect(page.locator('.rail-pane[data-pane="measure"] select').first()).toContainText('Imported Client');

  const projectDownload=page.waitForEvent('download');
  await page.locator('#projectBtn').click();
  await page.getByText('Save Project (.json)',{exact:true}).click();
  const projectFile=await projectDownload;
  const project=JSON.parse(await readFile(await projectFile.path(),'utf8'));
  expect(project.measurementProfileSnapshot.name).toBe('Sample Client');
  expect(Object.keys(project.measurementProfileSnapshot.measurements)).toHaveLength(11);

  await page.locator('#langBtn').click();
  await expect(page.locator('.rail-pane[data-pane="measure"]')).toContainText('ملفات القياسات');
});
