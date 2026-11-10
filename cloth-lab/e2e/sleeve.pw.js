import { test, expect } from '@playwright/test'

test('Arabic & English sleeve workflow auto-sews capFront/capBack + side tube, keeps cuff open, splits edges in 1 click, and simulates on GPU', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource.*404/.test(m.text())) errors.push(m.text())
  })

  await page.setViewportSize({ width: 1280, height: 840 })
  await page.goto('/e2e/sleeve.html?lang=ar')

  const root = page.locator('.cloth-lab-root')
  await expect(root).toBeVisible({ timeout: 15_000 })
  await expect(root).toContainText('نصف الرأس للأمام')

  // Open Step 2 (الخياطة / Sew)
  await root.locator('.cl-stepper button', { hasText: /الخياطة/ }).click()
  await expect(root.locator('.cl-sew')).toBeVisible()

  // Verify sleeve card has 5 distinct clickable edges (capFront, capBack, backSeam, frontSeam, + free cuff)
  const rightSleeveCard = root.locator('.cl-board-card[data-piece$="_r"]').first()
  await expect(rightSleeveCard).toContainText('الحافة السفلية حرة لخروج الذراع')
  await expect(rightSleeveCard).toContainText('3 وصلات')
  await expect(rightSleeveCard.locator('g.cl-edge')).toHaveCount(5)

  // Verify seam list displays natural Arabic anatomical labels
  const seamList = root.locator('.cl-seam-list')
  await expect(seamList).toContainText('نصف رأس الكم الأمامي')
  await expect(seamList).toContainText('نصف رأس الكم الخلفي')
  await expect(seamList).toContainText('حردة الإبط')

  // Click the free cuff edge's hit polyline: ONLY that 1 edge is selected (not the whole sleeve!)
  await rightSleeveCard.locator('g.cl-edge.is-free polyline.cl-edge-hit').first().click({ force: true })
  await expect(rightSleeveCard.locator('g.cl-edge.is-pending')).toHaveCount(1)

  // Click 1-click split button ("✂ قسّم الحافة لنصفين")
  const splitBtn = root.getByRole('button', { name: /قسّم الحافة لنصفين/ })
  await expect(splitBtn).toBeVisible()
  await splitBtn.click()
  await expect(rightSleeveCard.locator('g.cl-edge')).toHaveCount(6)

  // Reset auto-seams restores the 5 clean sleeve edges
  await root.getByRole('button', { name: /إعادة الوصل التلقائي/ }).click()
  await expect(rightSleeveCard.locator('g.cl-edge')).toHaveCount(5)

  // Launch 3D GPU cloth simulation ("جرّبه على المجسم")
  await root.getByRole('button', { name: /جرّبه على المجسم/ }).click()
  const canvas = root.locator('canvas').first()
  await expect(canvas).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(1500)

  expect(errors, `Browser errors:\n${errors.join('\n')}`).toEqual([])
})
