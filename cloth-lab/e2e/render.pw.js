import { test, expect } from '@playwright/test'

async function renderedFrame(page) {
  const previous = await page.evaluate(() => window.renderFrames)
  await page.waitForFunction(n => window.renderFrames > n + 2, previous)
  return page.evaluate(() => {
    const { gl, scene } = window.renderProbe
    const ctx = gl.getContext()
    const pixels = new Uint8Array(ctx.drawingBufferWidth * ctx.drawingBufferHeight * 4)
    ctx.readPixels(0, 0, ctx.drawingBufferWidth, ctx.drawingBufferHeight, ctx.RGBA, ctx.UNSIGNED_BYTE, pixels)
    let bright = 0, cloth = 0, bound = false
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 100) bright++
    }
    scene.traverse(mesh => {
      if (!mesh.userData.prepareExport) return
      cloth++
      bound = !!mesh.material.userData.shader?.uniforms.uSimPositionTex.value
    })
    return { bright, cloth, bound, error: ctx.getError() }
  })
}

test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/render.html')
  await page.waitForFunction(() => window.renderFrames > 3)
})

test('GPU normal calculation stays finite for collapsed rings and degenerate rest triangles', async ({ page }) => {
  for (const [candidate, rest, expected] of [
    [[0, 3, 4], [1, 0, 0], [0, 0.6, 0.8]],
    [[0, 0, 0], [0, -2, 0], [0, -1, 0]],
    [[0, 0, 0], [0, 0, 0], [0, 0, 1]],
    [[1e-20, 0, 0], [2, 0, 0], [1, 0, 0]],
  ]) {
    const result = await page.evaluate(([a, b]) => window.checkNormal(a, b), [candidate, rest])
    result.forEach(value => expect(Number.isFinite(value)).toBe(true))
    expected.forEach((value, i) => expect(result[i]).toBeCloseTo(value, 5))
    expect(result[3]).toBe(1)
  }
})

test('collapsed cloth normals cannot black out bloom, including fabric recompiles and resume', async ({ page }) => {
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  const before = await renderedFrame(page)
  expect(before.bright).toBeGreaterThan(1000)
  await page.evaluate(() => {
    window.renderProbe.scene.traverse(mesh => {
      if (!mesh.userData.prepareExport) return
      const { aSimUV, aNbrUV0, aNbrUV1, normal } = mesh.geometry.attributes
      // All four neighbors collapse onto self; also test a zero rest normal.
      for (let i = 0; i < aSimUV.count; i++) {
        const x = aSimUV.getX(i), y = aSimUV.getY(i)
        aNbrUV0.setXYZW(i, x, y, x, y)
        aNbrUV1.setXYZW(i, x, y, x, y)
        normal.setXYZ(i, 0, 0, 0)
      }
      aNbrUV0.needsUpdate = aNbrUV1.needsUpdate = normal.needsUpdate = true
    })
  })
  for (const action of [null, 'Change fabric', 'Toggle pause', 'Change fabric']) {
    if (action) await page.getByRole('button', { name: action }).click()
    const frame = await renderedFrame(page)
    expect(frame.bright).toBeGreaterThan(1000)
    expect(frame.cloth).toBe(1)
    expect(frame.bound).toBe(true)
    expect(frame.error).toBe(0)
  }
  expect(errors).toEqual([])
})
