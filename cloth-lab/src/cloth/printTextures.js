import * as THREE from 'three'

// Procedural transparent-alpha couture embroidery & brocade overlay textures for
// Cloth Lab. Only draws embroidery stitches / metallic threads with alpha > 0 so
// ClothMesh's shader mixes `diffuseColor.rgb` with the base per-piece linear
// vertex color intact (preventing double-darkening on dark fabrics).
const SUPPORTED_PRESETS = new Set([
  'zari_border',
  'arabesque',
  'tatreez',
  'floral_embroidery',
  'embroidery',
  'brocade',
  'floral',
  'lace',
])

export function createEmptyPrintTexture() {
  const data = new Uint8Array([0, 0, 0, 0])
  const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

export function createPrintOverlayTexture(print) {
  if (!print || !print.preset || print.preset === 'none') return null
  if (!SUPPORTED_PRESETS.has(print.preset)) return null
  if (typeof document === 'undefined') return null

  const c = document.createElement('canvas')
  c.width = c.height = 512
  const ctx = c.getContext?.('2d')
  if (!ctx) return null
  ctx.clearRect(0, 0, 512, 512)

  const pal = Array.isArray(print.palette) ? print.palette : []
  const c1 = pal[1] || '#d4af37'
  const c2 = pal[2] || c1
  const c3 = pal[3] || '#f8fafc'

  if (print.preset === 'zari_border') {
    const drawRail = (cx) => {
      ctx.strokeStyle = c1
      ctx.lineWidth = 4
      ctx.beginPath(); ctx.moveTo(cx - 22, 0); ctx.lineTo(cx - 22, 512); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(cx + 22, 0); ctx.lineTo(cx + 22, 512); ctx.stroke()
      ctx.strokeStyle = c2
      ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.moveTo(cx - 28, 0); ctx.lineTo(cx - 28, 512); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(cx + 28, 0); ctx.lineTo(cx + 28, 512); ctx.stroke()
      for (let y = 0; y < 512; y += 32) {
        ctx.strokeStyle = c1
        ctx.lineWidth = 2.6
        ctx.beginPath()
        ctx.moveTo(cx - 13, y); ctx.lineTo(cx, y + 16); ctx.lineTo(cx + 13, y); ctx.lineTo(cx, y - 16)
        ctx.closePath(); ctx.stroke()
        ctx.fillStyle = c3
        ctx.beginPath(); ctx.arc(cx, y, 3.6, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = c2
        ctx.beginPath()
        ctx.arc(cx + (cx < 256 ? 30 : -30), y + 16, 12, cx < 256 ? -Math.PI / 2 : Math.PI / 2, cx < 256 ? Math.PI / 2 : -Math.PI / 2)
        ctx.stroke()
      }
    }
    drawRail(36)
    drawRail(476)
    for (let y = 64; y < 512; y += 128) {
      for (const cx of [176, 336]) {
        ctx.save(); ctx.translate(cx, y)
        ctx.strokeStyle = c1
        ctx.lineWidth = 2.6
        ctx.beginPath()
        ctx.moveTo(0, -34); ctx.bezierCurveTo(22, -16, 20, 18, 0, 34); ctx.bezierCurveTo(-20, 18, -22, -16, 0, -34)
        ctx.stroke()
        ctx.fillStyle = c3
        ctx.beginPath(); ctx.arc(0, -8, 4.2, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(0, 10, 3.2, 0, Math.PI * 2); ctx.fill()
        ctx.restore()
      }
    }
  } else if (print.preset === 'arabesque' || print.preset === 'brocade') {
    const col = print.preset === 'brocade' ? c2 : c1
    const hi = print.preset === 'brocade' ? c1 : c3
    ctx.strokeStyle = c2
    ctx.lineWidth = 2.2
    for (let x = 0; x <= 512; x += 256) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.bezierCurveTo(x + 84, 128, x - 84, 384, x, 512); ctx.stroke()
    }
    for (const [cx, cy] of [[128, 128], [384, 128], [256, 256], [128, 384], [384, 384]]) {
      ctx.save(); ctx.translate(cx, cy)
      ctx.strokeStyle = col
      ctx.lineWidth = 2.6
      for (const rot of [0, Math.PI / 4]) {
        ctx.save(); ctx.rotate(rot); ctx.strokeRect(-36, -36, 72, 72); ctx.restore()
      }
      for (let i = 0; i < 8; i++) {
        ctx.save(); ctx.rotate((i * Math.PI) / 4)
        ctx.beginPath(); ctx.ellipse(0, -24, 6.5, 17, 0, 0, Math.PI * 2); ctx.stroke()
        ctx.restore()
      }
      ctx.fillStyle = hi
      ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, Math.PI * 2); ctx.fill()
      ctx.restore()
    }
  } else if (print.preset === 'tatreez') {
    const drawX = (px, py, col, sz = 11) => {
      ctx.strokeStyle = col
      ctx.lineWidth = 2.8
      ctx.beginPath()
      ctx.moveTo(px - sz * 0.42, py - sz * 0.42); ctx.lineTo(px + sz * 0.42, py + sz * 0.42)
      ctx.moveTo(px + sz * 0.42, py - sz * 0.42); ctx.lineTo(px - sz * 0.42, py + sz * 0.42)
      ctx.stroke()
    }
    const motif = ['....2....', '...212...', '..21312..', '.2131312.', '213121312', '.2131312.', '..21312..', '...212...', '....2....']
    const cmap = { 1: c1, 2: c2, 3: c3 }
    const cell = 12
    for (const [ox, oy] of [[74, 82], [202, 210], [330, 82], [74, 338], [330, 338]]) {
      motif.forEach((row, ry) => {
        for (let rx = 0; rx < row.length; rx++) {
          if (row[rx] !== '.') drawX(ox + rx * cell, oy + ry * cell, cmap[row[rx]], cell)
        }
      })
    }
    for (let y = 16; y < 512; y += 20) {
      drawX(26, y, c1, 10); drawX(38, y + 10, c2, 10)
      drawX(474, y, c1, 10); drawX(486, y + 10, c2, 10)
    }
  } else if (print.preset === 'floral_embroidery' || print.preset === 'floral') {
    ctx.strokeStyle = c3
    ctx.lineWidth = 3
    for (const bx of [96, 256, 416]) {
      ctx.beginPath(); ctx.moveTo(bx, 0); ctx.bezierCurveTo(bx + 36, 128, bx - 36, 384, bx, 512); ctx.stroke()
    }
    for (const [fx, fy] of [[102, 96], [262, 176], [422, 96], [90, 272], [250, 352], [410, 272], [104, 432], [424, 432]]) {
      ctx.save(); ctx.translate(fx, fy)
      for (let i = 0; i < 5; i++) {
        ctx.save(); ctx.rotate((i * Math.PI * 2) / 5)
        ctx.fillStyle = c1
        ctx.beginPath(); ctx.ellipse(0, -14, 6.5, 13.5, 0, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = c2
        ctx.lineWidth = 1.4
        ctx.stroke()
        ctx.restore()
      }
      ctx.fillStyle = c2
      ctx.beginPath(); ctx.arc(0, 0, 4.8, 0, Math.PI * 2); ctx.fill()
      ctx.restore()
    }
  } else {
    // 'embroidery' or 'lace'
    [40, 472].forEach((bx) => {
      ctx.strokeStyle = c2
      ctx.lineWidth = 2.6
      ctx.beginPath(); ctx.moveTo(bx - 16, 0); ctx.lineTo(bx - 16, 512); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(bx + 16, 0); ctx.lineTo(bx + 16, 512); ctx.stroke()
      for (let y = 16; y < 512; y += 32) {
        ctx.strokeStyle = c1
        ctx.lineWidth = 2.6
        ctx.beginPath(); ctx.arc(bx, y, 10, 0, Math.PI * 2); ctx.stroke()
        ctx.fillStyle = c3
        ctx.beginPath(); ctx.arc(bx, y, 3.2, 0, Math.PI * 2); ctx.fill()
      }
    })
    for (const [cx, cy] of [[168, 128], [344, 128], [256, 256], [168, 384], [344, 384]]) {
      ctx.strokeStyle = c1
      ctx.lineWidth = 2.4
      for (let k = 0; k < 6; k++) {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate((k * Math.PI) / 3)
        ctx.beginPath(); ctx.ellipse(0, -18, 5, 14, 0, 0, Math.PI * 2); ctx.stroke()
        ctx.restore()
      }
      ctx.fillStyle = c2
      ctx.beginPath(); ctx.arc(cx, cy, 4.5, 0, Math.PI * 2); ctx.fill()
    }
  }

  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 4
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}
