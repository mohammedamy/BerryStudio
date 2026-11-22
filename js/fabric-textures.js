/* ============================================================================
   Procedural Seamless PBR Fabric Texture Synthesizer (Shared: 3D Preview + Cloth Lab)
   Zero runtime asset dependencies; Node-safe; deterministic seamless 256×256 tiling.
   Generates matched `map` (micro-albedo yarn/weave shading), Sobel `normalMap`,
   and `roughnessMap` for all 13 garment fabrics.
   ============================================================================ */

const TAU = Math.PI * 2;
const TEX_SIZE = 256;

export const FABRIC_TEX_SPECS = {
  cotton: {
    repeatCm: 3.4, normalScale: 0.92, roughness: 0.80, roughnessSpread: 0.20,
    sheen: 0.28, sheenRoughness: 0.74, clearcoat: 0.0, clearcoatRoughness: 0.5,
    envMapIntensity: 0.72, albedoBase: 224, albedoAmp: 34,
  },
  denim: {
    repeatCm: 4.2, normalScale: 1.45, roughness: 0.88, roughnessSpread: 0.24,
    sheen: 0.18, sheenRoughness: 0.82, clearcoat: 0.0, clearcoatRoughness: 0.5,
    envMapIntensity: 0.70, albedoBase: 220, albedoAmp: 52,
  },
  linen: {
    repeatCm: 4.4, normalScale: 1.35, roughness: 0.86, roughnessSpread: 0.24,
    sheen: 0.22, sheenRoughness: 0.80, clearcoat: 0.0, clearcoatRoughness: 0.5,
    envMapIntensity: 0.72, albedoBase: 222, albedoAmp: 46,
  },
  silk: {
    repeatCm: 3.0, normalScale: 0.58, roughness: 0.28, roughnessSpread: 0.18,
    sheen: 0.72, sheenRoughness: 0.34, clearcoat: 0.12, clearcoatRoughness: 0.32,
    envMapIntensity: 0.88, albedoBase: 228, albedoAmp: 28,
  },
  satin: {
    repeatCm: 3.2, normalScale: 0.64, roughness: 0.24, roughnessSpread: 0.18,
    sheen: 0.78, sheenRoughness: 0.30, clearcoat: 0.15, clearcoatRoughness: 0.28,
    envMapIntensity: 0.90, albedoBase: 228, albedoAmp: 28,
  },
  chiffon: {
    repeatCm: 3.4, normalScale: 0.80, roughness: 0.62, roughnessSpread: 0.22,
    sheen: 0.55, sheenRoughness: 0.55, clearcoat: 0.0, clearcoatRoughness: 0.45,
    envMapIntensity: 0.76, albedoBase: 222, albedoAmp: 38,
  },
  wool: {
    repeatCm: 3.8, normalScale: 1.25, roughness: 0.86, roughnessSpread: 0.22,
    sheen: 0.62, sheenRoughness: 0.62, clearcoat: 0.0, clearcoatRoughness: 0.5,
    envMapIntensity: 0.72, albedoBase: 220, albedoAmp: 44,
  },
  leather: {
    repeatCm: 7.5, normalScale: 1.38, roughness: 0.42, roughnessSpread: 0.34,
    sheen: 0.20, sheenRoughness: 0.48, clearcoat: 0.18, clearcoatRoughness: 0.38,
    envMapIntensity: 0.88, albedoBase: 222, albedoAmp: 42,
  },
  jersey: {
    repeatCm: 3.4, normalScale: 1.10, roughness: 0.82, roughnessSpread: 0.22,
    sheen: 0.42, sheenRoughness: 0.68, clearcoat: 0.0, clearcoatRoughness: 0.5,
    envMapIntensity: 0.74, albedoBase: 224, albedoAmp: 38,
  },
  scuba: {
    repeatCm: 3.6, normalScale: 0.72, roughness: 0.56, roughnessSpread: 0.18,
    sheen: 0.45, sheenRoughness: 0.52, clearcoat: 0.05, clearcoatRoughness: 0.42,
    envMapIntensity: 0.80, albedoBase: 226, albedoAmp: 30,
  },
  velvet: {
    repeatCm: 5.5, normalScale: 1.12, roughness: 0.84, roughnessSpread: 0.26,
    sheen: 0.95, sheenRoughness: 0.32, clearcoat: 0.0, clearcoatRoughness: 0.5,
    envMapIntensity: 0.78, albedoBase: 218, albedoAmp: 50,
  },
  tulle: {
    repeatCm: 4.5, normalScale: 1.15, roughness: 0.56, roughnessSpread: 0.30,
    sheen: 0.48, sheenRoughness: 0.48, clearcoat: 0.0, clearcoatRoughness: 0.45,
    envMapIntensity: 0.82, albedoBase: 218, albedoAmp: 56,
  },
  lace: {
    repeatCm: 9.0, normalScale: 1.50, roughness: 0.74, roughnessSpread: 0.28,
    sheen: 0.45, sheenRoughness: 0.58, clearcoat: 0.0, clearcoatRoughness: 0.5,
    envMapIntensity: 0.78, albedoBase: 218, albedoAmp: 54,
  },
};

const ALIASES = {
  poplin: "cotton",
  crepe: "wool",
  cotton_poplin: "cotton",
  cotton_jersey: "jersey",
  silk_charmeuse: "silk",
  wool_crepe: "wool",
  scuba_knit: "scuba",
};

export function normalizeFabricTexId(fabricId) {
  const key = String(fabricId || "cotton").toLowerCase().trim();
  if (FABRIC_TEX_SPECS[key]) return key;
  return ALIASES[key] || "cotton";
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0 || 1));
  return t * t * (3 - 2 * t);
}

function hash2Periodic(ix, iy, px, py) {
  const x = ((ix % px) + px) % px;
  const y = ((iy % py) + py) % py;
  let n = (x * 374761393 + y * 668265263) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function periodicNoise(u, v, periodX, periodY) {
  const gx = u * periodX;
  const gy = v * periodY;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = gx - ix;
  const fy = gy - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2Periodic(ix, iy, periodX, periodY);
  const b = hash2Periodic(ix + 1, iy, periodX, periodY);
  const c = hash2Periodic(ix, iy + 1, periodX, periodY);
  const d = hash2Periodic(ix + 1, iy + 1, periodX, periodY);
  return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
}

function periodicVoronoi(u, v, cells) {
  const gx = u * cells;
  const gy = v * cells;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  let d1 = 999, d2 = 999;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = ix + dx;
      const cy = iy + dy;
      const jx = 0.18 + 0.64 * hash2Periodic(cx * 3 + 7, cy * 5 + 11, cells * 5, cells * 5);
      const jy = 0.18 + 0.64 * hash2Periodic(cx * 11 + 3, cy * 7 + 19, cells * 7, cells * 7);
      const px = cx + jx - gx;
      const py = cy + jy - gy;
      const dist = Math.hypot(px, py);
      if (dist < d1) {
        d2 = d1;
        d1 = dist;
      } else if (dist < d2) {
        d2 = dist;
      }
    }
  }
  return { d1, d2, edge: clamp01((d2 - d1) * 1.9) };
}

function hexLatticeDist(u, v, freq) {
  // Periodic orthogonal approximation of honeycomb lattice with exact tile periodicity:
  // two staggered brick-offset grids fused into clean hexagons.
  const sx = u * freq;
  const sy = v * freq;
  const cell = (px, py) => {
    const fx = px - Math.floor(px) - 0.5;
    const fy = py - Math.floor(py) - 0.5;
    const ax = Math.abs(fx), ay = Math.abs(fy);
    return Math.max(ax * 0.8660254 + ay * 0.5, ay);
  };
  const h1 = cell(sx, sy);
  const h2 = cell(sx + 0.5, sy + 0.5);
  return Math.min(h1, h2);
}

/**
 * Computes deterministic, seamlessly tiling `{ h, albedo, rough }` in `[0, 1]`
 * for a given fabric and normalized `[0, 1)` UV coordinates.
 */
export function sampleFabricPixel(fabricId, uRaw, vRaw) {
  const id = normalizeFabricTexId(fabricId);
  const u = ((uRaw % 1) + 1) % 1;
  const v = ((vRaw % 1) + 1) % 1;

  if (id === "cotton") {
    const N = 12;
    const wx = u * N, wy = v * N;
    const ix = Math.floor(wx), iy = Math.floor(wy);
    const lx = wx - ix - 0.5, ly = wy - iy - 0.5;
    const warpTop = ((ix + iy) & 1) === 0;
    const warpProfile = Math.cos(lx * Math.PI * 0.92);
    const weftProfile = Math.cos(ly * Math.PI * 0.92);
    const warpArch = warpProfile * (warpTop ? 1.0 : 0.40);
    const weftArch = weftProfile * (warpTop ? 0.40 : 1.0);
    const weave = Math.max(warpArch, weftArch);
    const micro = periodicNoise(u, v, 24, 24) * 0.10;
    const h = clamp01(0.14 + 0.76 * weave + micro);
    const albedo = clamp01(0.24 + 0.68 * weave + micro * 0.6);
    const rough = clamp01(0.84 - 0.36 * weave + micro * 0.4);
    return { h, albedo, rough };
  }

  if (id === "denim") {
    const N = 16;
    const wx = u * N, wy = v * N;
    const ix = Math.floor(wx), iy = Math.floor(wy);
    const lx = wx - ix - 0.5, ly = wy - iy - 0.5;
    const twillPhase = (ix + iy) & 3;
    const warpOver = twillPhase < 3; // 3x1 classic denim twill
    const ridgeCoord = ((u + v) * (N * 0.25)) % 1;
    const ridgeWave = 0.5 + 0.5 * Math.cos((ridgeCoord - 0.38) * TAU);
    const warpThread = Math.cos(lx * Math.PI * 0.88);
    const weftThread = Math.cos(ly * Math.PI * 0.88);
    const yarnH = warpOver ? (0.50 * ridgeWave + 0.50 * warpThread) : (0.20 + 0.52 * weftThread);
    const slub = periodicNoise(u, v, 6, 36) * 0.16;
    const h = clamp01(0.16 + 0.72 * yarnH + slub * 0.4);
    // Ecru weft peek gives real denim subtle speckled contrast between threads
    const weftPeek = warpOver ? 0.0 : 0.24 * weftThread;
    const albedo = clamp01(0.22 + 0.54 * yarnH + weftPeek + slub * 0.5);
    const rough = clamp01(0.88 - 0.36 * yarnH + (warpOver ? -0.04 : 0.10));
    return { h, albedo, rough };
  }

  if (id === "linen") {
    const N = 12;
    const wx = u * N, wy = v * N;
    const ix = Math.floor(wx), iy = Math.floor(wy);
    const lx = wx - ix - 0.5, ly = wy - iy - 0.5;
    const slubW = 0.72 + 0.52 * periodicNoise(u * 0.25, v, 4, N);
    const slubF = 0.72 + 0.52 * periodicNoise(u, v * 0.25, N, 4);
    const warpTop = ((ix + iy) & 1) === 0;
    const warpY = clamp01(Math.cos(lx * Math.PI * (0.98 / Math.max(0.7, slubW)))) * slubW;
    const weftY = clamp01(Math.cos(ly * Math.PI * (0.98 / Math.max(0.7, slubF)))) * slubF;
    const hBase = warpTop ? Math.max(warpY, weftY * 0.45) : Math.max(weftY, warpY * 0.45);
    const grain = periodicNoise(u, v, 36, 36) * 0.12;
    const h = clamp01(0.12 + 0.68 * hBase + grain * 0.5);
    const albedo = clamp01(0.24 + 0.64 * hBase + grain * 0.6);
    const rough = clamp01(0.90 - 0.36 * hBase + grain * 0.3);
    return { h, albedo, rough };
  }

  if (id === "silk" || id === "satin") {
    const floats = id === "satin" ? 20 : 24;
    const stretch = id === "satin" ? 8 : 5;
    const wx = u * floats, wy = v * (floats * 0.35);
    const ix = Math.floor(wx), iy = Math.floor(wy);
    const lx = wx - ix - 0.5, ly = wy - iy - 0.5;
    const warpRibbon = 0.5 + 0.5 * Math.cos(lx * TAU);
    const tie = ((ix * 3 + iy) % stretch) === 0 ? Math.cos(ly * Math.PI) * 0.16 : 0;
    const shimmer = 0.5 + 0.5 * Math.sin(u * TAU * floats * 0.5 + Math.cos(v * TAU * 4) * 0.6);
    const h = clamp01(0.40 + 0.38 * warpRibbon - tie + 0.10 * shimmer);
    const albedo = clamp01(0.66 + 0.26 * warpRibbon - tie * 0.5 + 0.08 * shimmer);
    const rough = clamp01(0.48 - 0.30 * warpRibbon + tie * 0.45);
    return { h, albedo, rough };
  }

  if (id === "chiffon") {
    const N = 18;
    const twist = Math.sin(u * TAU * 6 + v * TAU * 6) * 0.06;
    const wx = (u + twist * 0.04) * N, wy = (v - twist * 0.04) * N;
    const fx = Math.abs(wx - Math.floor(wx) - 0.5);
    const fy = Math.abs(wy - Math.floor(wy) - 0.5);
    const tx = smoothstep(0.32, 0.08, fx);
    const ty = smoothstep(0.32, 0.08, fy);
    const thread = Math.max(tx, ty);
    const crimp = periodicNoise(u, v, 32, 32) * 0.14;
    const h = clamp01(0.18 + 0.70 * thread + crimp);
    const albedo = clamp01(0.34 + 0.58 * thread + crimp * 0.4);
    const rough = clamp01(0.76 - 0.36 * thread + crimp * 0.3);
    return { h, albedo, rough };
  }

  if (id === "wool") {
    const p1 = periodicNoise(u, v, 14, 14);
    const p2 = periodicNoise(u, v, 28, 28);
    const fiberU = periodicNoise(u, v, 12, 44);
    const fiberV = periodicNoise(u, v, 44, 12);
    const crepe = p1 * 0.42 + p2 * 0.34 + (fiberU + fiberV) * 0.12;
    const h = clamp01(0.15 + crepe * 0.85);
    const albedo = clamp01(0.28 + crepe * 0.66);
    const rough = clamp01(0.88 - crepe * 0.26);
    return { h, albedo, rough };
  }

  if (id === "leather") {
    const vor = periodicVoronoi(u, v, 10);
    const pebbleDome = Math.pow(smoothstep(0.03, 0.52, vor.edge), 0.72);
    const secondary = periodicVoronoi((u * 2) % 1, (v * 2) % 1, 14).edge * 0.14;
    const fineSkin = periodicNoise(u, v, 36, 36) * 0.10;
    const h = clamp01(0.10 + 0.76 * pebbleDome + secondary * 0.5 + fineSkin);
    const albedo = clamp01(0.34 + 0.58 * pebbleDome + fineSkin * 0.4);
    // Smooth glossy pebble crowns (low rough), matte recessed pores (high rough)
    const rough = clamp01(0.86 - 0.62 * pebbleDome + fineSkin * 0.2);
    return { h, albedo, rough };
  }

  if (id === "jersey") {
    const wales = 14, courses = 18;
    const wx = u * wales, wy = v * courses;
    const ix = Math.floor(wx), iy = Math.floor(wy);
    const lx = wx - ix - 0.5;
    const ly = wy - iy - 0.5;
    // Authentic V-knit loop geometry: two angled legs converging toward bottom center
    const shiftY = (ly - Math.abs(lx) * 0.85 + 0.5) % 1;
    const armDist = Math.min(Math.abs(Math.abs(lx) - 0.22), Math.abs(shiftY - 0.48) * 0.8);
    const loopRidge = smoothstep(0.28, 0.04, armDist);
    const ribChannel = 0.5 + 0.5 * Math.cos(lx * TAU);
    const fuzz = periodicNoise(u, v, 32, 32) * 0.10;
    const h = clamp01(0.16 + 0.56 * loopRidge + 0.20 * ribChannel + fuzz);
    const albedo = clamp01(0.34 + 0.52 * loopRidge + 0.10 * ribChannel + fuzz * 0.5);
    const rough = clamp01(0.84 - 0.28 * loopRidge + fuzz * 0.3);
    return { h, albedo, rough };
  }

  if (id === "scuba") {
    const wales = 22, courses = 26;
    const wx = u * wales, wy = v * courses;
    const lx = wx - Math.floor(wx) - 0.5;
    const ly = wy - Math.floor(wy) - 0.5;
    const interlock = 0.5 + 0.5 * Math.cos(lx * TAU) * Math.cos((ly + Math.abs(lx) * 0.5) * TAU);
    const sponge = periodicNoise(u, v, 24, 24) * 0.08;
    const h = clamp01(0.36 + 0.44 * interlock + sponge);
    const albedo = clamp01(0.56 + 0.34 * interlock + sponge * 0.5);
    const rough = clamp01(0.66 - 0.24 * interlock);
    return { h, albedo, rough };
  }

  if (id === "velvet") {
    const pile = periodicNoise(u, v, 48, 48);
    const tuft = periodicNoise(u, v, 24, 24);
    const crush = Math.sin(u * TAU * 2 + Math.cos(v * TAU * 3) * 0.9) * 0.5 + 0.5;
    const nap = periodicNoise(u * 0.5, v, 6, 12);
    const h = clamp01(0.24 + 0.42 * pile + 0.22 * tuft + 0.12 * crush);
    const albedo = clamp01(0.26 + 0.38 * nap + 0.22 * crush + 0.14 * tuft);
    const rough = clamp01(0.88 - 0.26 * crush - 0.14 * pile);
    return { h, albedo, rough };
  }

  if (id === "tulle") {
    const dHex = hexLatticeDist(u, v, 8);
    // Thin crisp filament ring near hex border (dHex ~ 0.42..0.50), recessed open cell center
    const filament = smoothstep(0.34, 0.48, dHex);
    const h = clamp01(0.06 + 0.88 * filament);
    const albedo = clamp01(0.18 + 0.78 * filament);
    const rough = clamp01(0.86 - 0.48 * filament);
    return { h, albedo, rough };
  }

  if (id === "lace") {
    // 2x2 repeating scalloped botanical rosette + scrolling vine over tulle ground
    const ru = ((u * 2) % 1) - 0.5;
    const rv = ((v * 2) % 1) - 0.5;
    const r = Math.hypot(ru, rv);
    const ang = Math.atan2(rv, ru);
    const petalRadius = 0.22 + 0.095 * Math.cos(ang * 6.0);
    const flowerOutline = Math.exp(-Math.pow((r - petalRadius) / 0.032, 2));
    const innerRing = Math.exp(-Math.pow((r - 0.075) / 0.025, 2));
    const petalRibs = (r > 0.06 && r < petalRadius) ? Math.pow(Math.max(0, Math.cos(ang * 6.0)), 6.0) * 0.65 : 0;
    const scallopWave = Math.exp(-Math.pow((Math.abs(rv) - (0.38 + 0.07 * Math.cos(ru * TAU * 2))) / 0.030, 2));
    const netBg = smoothstep(0.36, 0.48, hexLatticeDist(u, v, 14)) * 0.45;
    const motif = clamp01(Math.max(flowerOutline, innerRing, petalRibs, scallopWave));
    const combined = Math.max(motif, netBg);
    const h = clamp01(0.05 + 0.90 * combined);
    const albedo = clamp01(0.16 + 0.80 * combined);
    const rough = clamp01(0.88 - 0.34 * motif - 0.14 * netBg);
    return { h, albedo, rough };
  }

  return { h: 0.5, albedo: 0.8, rough: 0.7 };
}

const TEXTURE_CACHE = new Map();

export function disposeFabricTextureCache() {
  for (const entry of TEXTURE_CACHE.values()) {
    entry.map?.dispose?.();
    entry.normalMap?.dispose?.();
    entry.roughnessMap?.dispose?.();
  }
  TEXTURE_CACHE.clear();
}

/**
 * Builds (or returns cached) `{ map, normalMap, roughnessMap, spec }` using
 * Three.js CanvasTextures. Node-safe: returns `null` when `document` is absent.
 */
export function getFabricTextureSet(THREE, fabricId, options = {}) {
  const resolvedId = normalizeFabricTexId(fabricId);
  const spec = FABRIC_TEX_SPECS[resolvedId];
  if (typeof document === "undefined" || !THREE?.CanvasTexture) return null;

  const uvSpanCm = Math.max(8, Number(options.uvSpanCm) || 32);
  const anisotropy = Math.max(1, Math.min(8, Number(options.anisotropy) || 4));
  const cacheKey = `${resolvedId}:${uvSpanCm}`;
  if (TEXTURE_CACHE.has(cacheKey)) {
    return TEXTURE_CACHE.get(cacheKey);
  }

  const size = TEX_SIZE;
  const heights = new Float32Array(size * size);
  const diffCanvas = document.createElement("canvas");
  const normCanvas = document.createElement("canvas");
  const roughCanvas = document.createElement("canvas");
  diffCanvas.width = diffCanvas.height = size;
  normCanvas.width = normCanvas.height = size;
  roughCanvas.width = roughCanvas.height = size;

  const dCtx = diffCanvas.getContext("2d");
  const nCtx = normCanvas.getContext("2d");
  const rCtx = roughCanvas.getContext("2d");
  if (!dCtx || !nCtx || !rCtx) return null;

  const dImg = dCtx.createImageData(size, size);
  const nImg = nCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);

  const roughMid = 204 + spec.roughness * 42;
  const roughRange = spec.roughnessSpread * 255;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const idx4 = (y * size + x) * 4;
      const s = sampleFabricPixel(resolvedId, u, v);
      heights[y * size + x] = s.h;

      // High-key neutral albedo variation so vertex/material base color keeps its
      // true hue & brightness while revealing authentic yarn/twill/knit structure.
      const lum = Math.max(150, Math.min(255, Math.round(spec.albedoBase + (s.albedo - 0.5) * spec.albedoAmp * 2)));
      // Denim gets subtle warm/cool warp-weft chroma micro-shift; linen gets organic fiber warmth.
      let rC = lum, gC = lum, bC = lum;
      if (resolvedId === "denim") {
        const weftTint = Math.max(0, s.albedo - 0.62) * 14;
        rC = Math.min(255, Math.round(lum + weftTint * 0.45));
        gC = Math.min(255, Math.round(lum + weftTint * 0.25));
        bC = Math.max(145, Math.round(lum - weftTint * 0.25));
      } else if (resolvedId === "wool") {
        rC = Math.min(255, lum + 2);
        bC = Math.max(150, lum - 2);
      }
      dImg.data[idx4] = rC;
      dImg.data[idx4 + 1] = gC;
      dImg.data[idx4 + 2] = bC;
      dImg.data[idx4 + 3] = 255;

      const rVal = Math.max(96, Math.min(255, Math.round(roughMid + (s.rough - 0.5) * roughRange)));
      rImg.data[idx4] = rVal;
      rImg.data[idx4 + 1] = rVal;
      rImg.data[idx4 + 2] = rVal;
      rImg.data[idx4 + 3] = 255;
    }
  }

  // Periodic Sobel tangent-space normal map (zero seams across tile boundaries!)
  const slopeStrength = 4.6;
  const at = (x, y) => heights[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = at(x - 1, y - 1), t = at(x, y - 1), tr = at(x + 1, y - 1);
      const l = at(x - 1, y), r = at(x + 1, y);
      const bl = at(x - 1, y + 1), b = at(x, y + 1), br = at(x + 1, y + 1);
      const dX = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dY = (bl + 2 * b + br) - (tl + 2 * t + tr);
      const nx = -dX * slopeStrength;
      const ny = -dY * slopeStrength;
      const nz = 1.0;
      const inv = 1.0 / Math.hypot(nx, ny, nz);
      const idx4 = (y * size + x) * 4;
      nImg.data[idx4] = Math.round((nx * inv * 0.5 + 0.5) * 255);
      nImg.data[idx4 + 1] = Math.round((ny * inv * 0.5 + 0.5) * 255);
      nImg.data[idx4 + 2] = Math.round((nz * inv * 0.5 + 0.5) * 255);
      nImg.data[idx4 + 3] = 255;
    }
  }

  dCtx.putImageData(dImg, 0, 0);
  nCtx.putImageData(nImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  const rep = uvSpanCm / spec.repeatCm;
  const wrapTex = (canvas, colorSpace) => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(rep, rep);
    tex.anisotropy = anisotropy;
    tex.colorSpace = colorSpace;
    tex.needsUpdate = true;
    return tex;
  };

  const entry = {
    id: resolvedId,
    spec,
    map: wrapTex(diffCanvas, THREE.SRGBColorSpace),
    normalMap: wrapTex(normCanvas, THREE.NoColorSpace),
    roughnessMap: wrapTex(roughCanvas, THREE.NoColorSpace),
  };
  TEXTURE_CACHE.set(cacheKey, entry);
  return entry;
}
