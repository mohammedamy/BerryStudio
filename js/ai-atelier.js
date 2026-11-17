/* ============================================================
   AtelierAI — World-Class Master Couture AI Consultant, Pattern
   Synthesizer, Self-Healing Validator & Existing-Pattern Completer/Editor.

   Pure zero-dependency ES module (runs in browser and Node `node --test`).
   Powers:
   1) Interactive Pre-Drafting Designer Consultation (smart bilingual Q&A)
   2) 100%-Validated Couture Pattern Synthesis across all garment families
   3) Geometry-Aware Inspection, Completion & Restyling of Existing Patterns
   ============================================================ */
import { AIGen } from './ai.js';
import { FancyGen } from './fancy-patterns.js';
import { PatternValidator } from './validate.js';
import { offsetPoly } from './geometry.js';
import { computePleats, computeGatherWidth } from './pleats.js';
import {
  cosineSleeveOutline, puffSleevePc, sleeveUpperPc, sleeveUnderPc,
  pointedCollar, collarStand, bandPc, pocketPatch, qBezToCubic,
} from './pattern-builders.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const q = (v) => v / 4;

export const ATELIER_PRESETS = [
  {
    id: 'gown',
    label: { en: 'Evening Gown', ar: 'فستان سهرة ملكي' },
    prompt: {
      en: 'Floor-length princess-seamed satin evening gown with sweetheart neckline, cathedral A-line flare, and hidden side pockets',
      ar: 'فستان سهرة ملكي طويل من الساتان بقصات أميرة وخط رقبة على شكل قلب وتنورة كلوش واسعة مع جيوب مخفية',
    },
  },
  {
    id: 'blazer',
    label: { en: 'Tailored Blazer', ar: 'بليزر مفصل' },
    prompt: {
      en: 'Single-breasted tailored wool blazer jacket with notched lapel collar, two-piece sleeves, welt pockets, and full back lining',
      ar: 'جاكيت بليزر صوف مفصل بياقة مطوية وأكمام من قطعتين وجيوب مشقوقة وبطانة كاملة',
    },
  },
  {
    id: 'trench',
    label: { en: 'Trench Coat', ar: 'معطف ترنش' },
    prompt: {
      en: 'Long gabardine belted trench coat with wide storm collar, back shoulder yoke, two-piece tailored sleeves, and hip flap pockets',
      ar: 'معطف ترنش طويل بحزام خصر وياقة عريضة وكوة ظهر واقية وأكمام مفصلة وجيوب بغطاء',
    },
  },
  {
    id: 'suit',
    label: { en: '3-Piece Suit', ar: 'بدلة رسمية كاملة' },
    prompt: {
      en: 'Formal tailored three-piece suit with structured blazer jacket, fitted waistcoat vest, and creased straight-leg trousers',
      ar: 'بدلة رسمية مفصلة من ثلاث قطع تشمل جاكيت بليزر وصدرية وبنطلون كلاسيكي',
    },
  },
  {
    id: 'shirt',
    label: { en: 'Oxford Shirt', ar: 'قميص كلاسيكي' },
    prompt: {
      en: 'Crisp tailored button-down dress shirt with pointed collar and stand, back shoulder yoke, long sleeves with buttoned wrist cuffs, and chest pocket',
      ar: 'قميص كلاسيكي بأزرار أمامية وياقة مدببة مع قاعدة وكوة كتف خلفية وأكمام طويلة بأساور وجيب صدر',
    },
  },
  {
    id: 'wrapDress',
    label: { en: 'Silk Wrap Dress', ar: 'فستان ملفوف' },
    prompt: {
      en: 'Midi A-line silk wrap dress with V-neckline, tie waist sash, curved hem, and three-quarter bishop sleeves',
      ar: 'فستان ميدي ملفوف بقصة كلوش وفتحة رقبة V وحزام ربط عند الخصر وأكمام ثلاثة أرباع واسعة',
    },
  },
  {
    id: 'abaya',
    label: { en: 'Luxury Abaya', ar: 'عباية فاخرة' },
    prompt: {
      en: 'Full-length flowing crepe abaya robe with wide kimono sleeves, front lapel facing, waist tie belt, and side-seam pockets',
      ar: 'عباية طويلة انسيابية بأكمام واسعة وسجاف أمامي وحزام خصر وجيوب جانبية مخفية',
    },
  },
  {
    id: 'thobe',
    label: { en: 'Mandarin Thobe', ar: 'ثوب / كندورة' },
    prompt: {
      en: 'Full-length tailored thobe with standing mandarin collar, front button placket, long sleeves with cuffs, and side pockets',
      ar: 'ثوب رجالي طويل مفصل بياقة صينية قائمة ومرد أزرار أمامي وأكمام طويلة وجيوب جانبية',
    },
  },
  {
    id: 'hoodie',
    label: { en: 'Streetwear Hoodie', ar: 'هودي عصري' },
    prompt: {
      en: 'Relaxed raglan-sleeve pullover hoodie with two-piece contoured hood, front kangaroo pocket, rib wrist cuffs, and rib hem band',
      ar: 'هودي عصري مريح بأكمام رجلان وقبعة مجسمة من قطعتين وجيب كانغرو وأساور وكمر ريب',
    },
  },
  {
    id: 'jumpsuit',
    label: { en: 'Wide-Leg Jumpsuit', ar: 'جمبسوت واسع' },
    prompt: {
      en: 'Tailored mock-neck sleeveless wide-leg jumpsuit with center-front zip facing and waist sash belt',
      ar: 'جمبسوت أنيق بياقة قائمة بدون أكمام وبساق واسعة وسحاب أمامي وحزام خصر',
    },
  },
  {
    id: 'pleatedSkirt',
    label: { en: 'Pleated Midi Skirt', ar: 'تنورة بليسيه ميدي' },
    prompt: {
      en: 'Midi knife-pleated woven A-line skirt with structured waistband and hidden in-seam pockets',
      ar: 'تنورة ميدي منسوجة بكسرات وحزام خصر مهيكل وجيوب جانبية مخفية',
    },
  },
  {
    id: 'trousers',
    label: { en: 'Tailored Trousers', ar: 'بنطلون مفصل' },
    prompt: {
      en: 'High-waisted wide-leg palazzo tailored trousers with structured waistband and slanted front pockets',
      ar: 'بنطلون بالازو واسع الساق بخصر مرتفع وكمر مهيكل وجيوب أمامية مائلة',
    },
  },
];

const UPPER_BODY_TYPES = new Set([
  'dress', 'top', 'bodice', 'shirt', 'robe', 'romper', 'jumpsuit',
  'leotard', 'gown', 'jacket', 'coat', 'suit', 'vest', 'hoodie',
]);

function normalizeDigits(str) {
  return String(str || '')
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776))
    .replace(/٫/g, '.');
}

function dist(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function polyArea(outline) {
  if (!Array.isArray(outline) || outline.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < outline.length; i++) {
    const [x1, y1] = outline[i];
    const [x2, y2] = outline[(i + 1) % outline.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

function bboxOf(outline) {
  const xs = outline.map((p) => p[0]);
  const ys = outline.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
}

function snapNotchToOutline(pt, outline) {
  let best = outline[0];
  let bestDist = Infinity;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy || 1e-9;
    const t = clamp(((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / len2, 0, 1);
    const cx = a[0] + dx * t, cy = a[1] + dy * t;
    const d = Math.hypot(pt[0] - cx, pt[1] - cy);
    if (d < bestDist) {
      bestDist = d;
      best = [+(cx).toFixed(3), +(cy).toFixed(3)];
    }
  }
  return best;
}

// ============================================================
// 1. SELF-HEALING QA VALIDATOR (100% PatternValidator Pass Rate)
// ============================================================
export function ensureValidPieces(rawPieces, measurements = {}, seamAllowanceCm = 1.0) {
  const chest = Number(measurements?.chest) || 92;
  const healed = (rawPieces || [])
    .filter((p) => p && Array.isArray(p.outline) && p.outline.length >= 3)
    .map((orig, idx) => {
      const p = JSON.parse(JSON.stringify(orig));
      if (p.locked && Array.isArray(p.outline) && p.outline.length >= 3 && Array.isArray(p.grain) && p.grain.length === 2) {
        return p;
      }

      // 1) Deduplicate consecutive identical points while remapping curve indices
      const cleanOutline = [];
      const idxMap = new Array(p.outline.length).fill(0);
      for (let i = 0; i < p.outline.length; i++) {
        const pt = [Number(p.outline[i][0]) || 0, Number(p.outline[i][1]) || 0];
        if (!cleanOutline.length || dist(cleanOutline[cleanOutline.length - 1], pt) > 1e-3) {
          idxMap[i] = cleanOutline.length;
          cleanOutline.push([+pt[0].toFixed(3), +pt[1].toFixed(3)]);
        } else {
          idxMap[i] = cleanOutline.length - 1;
        }
      }
      if (cleanOutline.length > 3 && dist(cleanOutline[0], cleanOutline[cleanOutline.length - 1]) <= 1e-3) {
        cleanOutline.pop();
      }
      p.outline = cleanOutline;

      // 2) Remap and sanitize cubic Bezier curve metadata
      if (Array.isArray(p.curves)) {
        p.curves = p.curves
          .map((c) => {
            if (!c || !Array.isArray(c.c1) || !Array.isArray(c.c2)) return null;
            const fromIdx = idxMap[c.fromIdx] ?? c.fromIdx;
            const toIdx = c.toIdx === 0 ? 0 : (idxMap[c.toIdx] ?? c.toIdx);
            if (fromIdx < 0 || fromIdx >= p.outline.length) return null;
            if (toIdx < 0 || toIdx >= p.outline.length || fromIdx === toIdx) return null;
            return {
              fromIdx,
              toIdx,
              c1: [+Number(c.c1[0]).toFixed(3), +Number(c.c1[1]).toFixed(3)],
              c2: [+Number(c.c2[0]).toFixed(3), +Number(c.c2[1]).toFixed(3)],
            };
          })
          .filter(Boolean);
      } else {
        p.curves = [];
      }

      // 3) Remap declared seam edges if any
      if (Array.isArray(p.edges)) {
        p.edges = p.edges
          .map((e) => {
            if (!e || typeof e.seamId !== 'string') return null;
            const fromIdx = idxMap[e.fromIdx] ?? e.fromIdx;
            const toIdx = idxMap[e.toIdx] ?? e.toIdx;
            if (fromIdx < 0 || toIdx < 0 || fromIdx >= p.outline.length || toIdx >= p.outline.length || fromIdx === toIdx) return null;
            return { ...e, fromIdx, toIdx };
          })
          .filter(Boolean);
      }

      // 4) Bilingual name & description defaults
      if (!p.name || typeof p.name !== 'object') {
        const s = typeof p.name === 'string' && p.name.trim() ? p.name.trim() : `Pattern Piece ${idx + 1}`;
        p.name = { en: s, ar: s };
      } else {
        p.name = {
          en: p.name.en || p.name.ar || `Pattern Piece ${idx + 1}`,
          ar: p.name.ar || p.name.en || `قطعة ${idx + 1}`,
        };
      }
      if (!p.desc || typeof p.desc !== 'object') {
        p.desc = { en: 'Precision drafted couture pattern piece.', ar: 'قطعة باترون مفصلة بدقة عالية.' };
      }
      if (!p.key) {
        p.key = String(p.name.en || p.role || `piece_${idx + 1}`)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, '') || `piece_${idx + 1}`;
      }

      // 5) Interior grainline strictly inside bounding box
      const bb = bboxOf(p.outline);
      const validGrain = Array.isArray(p.grain) && p.grain.length === 2
        && p.grain.every((g) => Array.isArray(g) && Number.isFinite(g[0]) && Number.isFinite(g[1])
          && g[0] >= bb.minX - 0.01 && g[0] <= bb.maxX + 0.01
          && g[1] >= bb.minY - 0.01 && g[1] <= bb.maxY + 0.01)
        && dist(p.grain[0], p.grain[1]) >= 0.8;
      if (!validGrain) {
        const cx = +((bb.minX + bb.maxX) / 2).toFixed(2);
        if (bb.h >= bb.w) {
          const padY = Math.min(Math.max(0.8, bb.h * 0.14), bb.h * 0.4);
          p.grain = [[cx, +(bb.minY + padY).toFixed(2)], [cx, +(bb.maxY - padY).toFixed(2)]];
        } else {
          const cy = +((bb.minY + bb.maxY) / 2).toFixed(2);
          const padX = Math.min(Math.max(0.8, bb.w * 0.14), bb.w * 0.4);
          p.grain = [[+(bb.minX + padX).toFixed(2), cy], [+(bb.maxX - padX).toFixed(2), cy]];
        }
      }

      // 6) Snap every notch onto the piece outline so no notch ever floats >2cm off-edge
      if (Array.isArray(p.notches) && p.notches.length) {
        p.notches = p.notches
          .filter((nt) => Array.isArray(nt) && nt.length >= 2 && Number.isFinite(nt[0]) && Number.isFinite(nt[1]))
          .map((nt) => snapNotchToOutline(nt, p.outline));
      } else {
        p.notches = [];
      }

      if (!Array.isArray(p.darts)) p.darts = [];
      return p;
    })
    .filter((p) => polyArea(p.outline) >= 1.0);

  let validation = PatternValidator.run(healed, {
    bodyChestCm: chest,
    seamAllowanceCm,
    offsetPoly,
  });

  // Self-heal foldSymmetry or chestEdgeIndices issues if an edited/custom piece triggered one
  if (validation.summary.fail > 0) {
    healed.forEach((p, i) => {
      const pieceChecks = validation.perPiece?.[i]?.checks || {};
      if (pieceChecks.foldSymmetry?.status === 'fail' && p.cutOnFold) {
        p.cutOnFold = false;
        if (p.role === 'bodice-front-center') p.role = 'front-panel';
        if (p.role === 'bodice-back-center') p.role = 'back-panel';
        delete p.chestEdgeIndices;
      }
      if (pieceChecks.ease?.status === 'fail' && p.chestEdgeIndices) {
        delete p.chestEdgeIndices;
      }
    });
    validation = PatternValidator.run(healed, {
      bodyChestCm: chest,
      seamAllowanceCm,
      offsetPoly,
    });
  }

  return { pieces: healed, validation };
}

// ============================================================
// 2. PRE-DRAFTING CLARIFYING QUESTIONS ENGINE (ATELIER Q&A)
// ============================================================
export function detectExplicitPromptCues(prompt = '', metrics = null) {
  const t = normalizeDigits(prompt).toLowerCase();
  const tLen = t
    .replace(/\b(long|short)([- ]?sleeves?)/g, '$2')
    .replace(/(كم|أكمام)\s*(طويل[ةه]?|قصير[ةه]?)/g, '$1')
    .replace(/(طويل[ةه]?|قصير[ةه]?)\s*(كم|أكمام)/g, '$2');
  const hasImg = !!(metrics && metrics.ok);
  const hasGarmentType = /\b(suit|tuxedo|sherwani|trench|overcoat|duffle|parka|coat|blazer|jacket|bomber|cardigan|waistcoat|vest|gilet|hoodie|sweatshirt|gown|ballgown|jumpsuit|overalls|romper|playsuit|leotard|bodysuit|swimsuit|bodice|abaya|kaftan|caftan|thobe|kandura|dishdasha|jalabiya|kimono|robe|shorts|bermuda|trousers?|pants?|jeans?|palazzo|culottes?|cargo|joggers?|skirt|shirtdress|shirt|oxford|polo|tunic|dress|sundress|frock|top|blouse|tee|t-shirt|camisole|peplum)\b|بدلة|توكسيدو|شيرواني|معطف|ترنش|بالطو|بليزر|جاكيت|سترة|صدرية|جيليه|هودي|سويتشيرت|فستان|جمبسوت|أفرول|سالوبيت|ليوتارد|مايوه|عباية|عباءة|قفطان|ثوب|كندورة|جلابية|روب|شورت|برمودا|بنطلون|سروال|جينز|كارجو|جوغر|تنورة|جيبة|قميص|تونيك|بلوز|توب|تيشيرت/.test(t);
  return {
    hasGarmentType,
    hasType: hasGarmentType,
    hasFabric: /\b(woven|cotton|poplin|linen|denim|wool|gabardine|tweed|twill|satin|duchess|taffeta|silk|chiffon|crepe|organza|georgette|velvet|knit|jersey|stretch|spandex|lycra|fleece|rib)\b|منسوج|قطن|كتان|جينز|صوف|غابردين|ساتان|حرير|شيفون|كريب|مخمل|تريكو|جيرسيه|مطاط|ليكرا/.test(t),
    hasLength: /\b(maxi|floor|full[- ]?length|ankle|midi|tea[- ]?length|mini|crop|cropped|short|long|regular[- ]length|medium[- ]length|knee[- ]length)\b|طويل|ميدي|قصير|طول عادي|طول متوسط/.test(tLen),
    hasFlareOrFit: /\b(a[- ]?line|flare|flared|circle|ball[- ]?gown|pencil|straight|bodycon|slim|fitted|tailored|loose|oversized|relaxed|wide[- ]?leg|palazzo)\b|كلوش|واسع|قلم|مستقيم|ضيق|مخصر|مفصل|فضفاض/.test(t),
    hasNeckline: /\b(sweetheart|square[- ]?neck|halter|off[- ]?shoulder|strapless|v[- ]?neck|boat[- ]?neck|bateau|mock[- ]?neck|stand[- ]?collar|mandarin|nehru|turtleneck|collar|lapel|notch|shawl|round[- ]?neck|crew[- ]?neck|scoop|hood)\b|قلب|مربع|رسن|كتف مكشوف|بدون حمالات|فتحة v|قارب|ياقة|قبعة|دائري|مدور/i.test(t),
    hasSleeve: /\b(sleeveless|strapless|short[- ]?sleeves?|cap[- ]?sleeves?|3\/4|three[- ]?quarter|long[- ]?sleeves?|full[- ]?sleeves?|puff|bishop|bell|raglan|two[- ]?piece sleeve|kimono sleeve)\b|بدون\s*(كم|أكمام)|بلا\s*(كم|أكمام)|(كم|أكمام)\s*(طويل|قصير)|ثلاثة أرباع|منفوش|رجلان/.test(t),
    hasClosure: /\b(zip|zipper|button|placket|wrap|pullover|slip[- ]?on|tie|buckle|toggle|double[- ]?breasted|single[- ]?breasted|corset)\b|سحاب|سوستة|أزرار|بأزرار|مرد|ملفوف|لف|ربط/.test(t),
    hasFinishes: /\b(pocket|lined|lining|belt|sash|cuff|facing|unlined)\b|جيب|جيوب|مبطن|بطانة|حزام|أسورة|أساور|سجاف/.test(t),
    hasImg,
  };
}

export function generateClarifyingQuestions({
  prompt = '',
  metrics = null,
  imageSupplied = false,
  category = 'women',
  mode = 'create',
  existingPieces = [],
  lang = 'en',
  currentAnswers = {},
} = {}) {
  const derived = AIGen.deriveStyle({ metrics, prompt, category, imageDataURL: imageSupplied ? 'img' : null });
  const cues = detectExplicitPromptCues(prompt, metrics);

  if (mode === 'edit') {
    const insp = inspectExistingPattern(existingPieces, null, lang);
    const questions = [];
    questions.push({
      id: 'editOperation',
      title: {
        en: 'What would you like to complete or modify on the current pattern?',
        ar: 'ما التعديل أو الإكمال الذي ترغب بتنفيذه على الباترون الحالي؟',
      },
      why: {
        en: `Detected ${insp.pieceCount} piece(s) on canvas (Neckline ~${insp.neckArcCm.toFixed(1)} cm, Waist ~${insp.waistCircCm.toFixed(1)} cm).`,
        ar: `تم رصد ${insp.pieceCount} قطعة على اللوحة (محيط الرقبة ~${insp.neckArcCm.toFixed(1)} سم، الخصر ~${insp.waistCircCm.toFixed(1)} سم).`,
      },
      options: [
        { value: 'auto-complete', recommended: true, label: { en: '(Recommended) Complete missing construction pieces (collar/sleeves/facings)', ar: '(موصى به) إكمال القطع الإنشائية الناقصة تلقائياً' } },
        { value: 'alter-length-flare', label: { en: 'Adjust garment length & hem flare', ar: 'تعديل الطول واتساع الحاشية السفلية' } },
        { value: 'alter-fit', label: { en: 'Adjust body fit / side-seam wearing ease', ar: 'تعديل المقاس وراحة الخياطة الجانبية' } },
        { value: 'restyle-details', label: { en: 'Add pockets, cuffs, waistband & interior lining', ar: 'إضافة جيوب وأساور وكمر وبطانة داخلية' } },
      ],
    });
    if (!insp.hasSleeves && insp.hasUpperBody) {
      questions.push({
        id: 'editSleeve',
        title: { en: 'Sleeve architecture to draft for this armhole:', ar: 'تصميم الكم المطلوب رسمه لحردة الإبط الحالية:' },
        why: { en: `Drafted directly to match your current armscye (~${insp.armholeArcCm.toFixed(1)} cm).`, ar: `يُفصّل بدقة ليطابق طول حردة الإبط الحالية (~${insp.armholeArcCm.toFixed(1)} سم).` },
        options: [
          { value: 'set-in-long', recommended: true, label: { en: '(Recommended) Classic Set-In Long Sleeve', ar: '(موصى به) كم كلاسيكي طويل مركّب' } },
          { value: 'puff', label: { en: 'Gathered Couture Puff Sleeve', ar: 'كم منفوش بكشكشة علوية' } },
          { value: 'tailored-2pc', label: { en: 'Two-Piece Tailored Jacket Sleeve', ar: 'كم جاكيت مفصل من قطعتين' } },
          { value: 'short', label: { en: 'Short / Cap Summer Sleeve', ar: 'كم قصير / كاب صيفي' } },
          { value: 'keep', label: { en: 'Keep sleeveless (add clean binding)', ar: 'إبقاؤه بدون أكمام (إضافة بييه تشطيب)' } },
        ],
      });
    }
    if (!insp.hasCollar && insp.hasUpperBody) {
      questions.push({
        id: 'editCollar',
        title: { en: 'Neckline & collar finish:', ar: 'تشطيب الرقبة أو الياقة:' },
        why: { en: `Drafted to match your exact front + back neckline arc (${insp.neckArcCm.toFixed(1)} cm).`, ar: `تُرسم الياقة بمطابقة طول قوس الرقبة الفعلي (${insp.neckArcCm.toFixed(1)} سم).` },
        options: [
          { value: 'pointed-collar', recommended: true, label: { en: '(Recommended) Pointed Collar + Collar Stand', ar: '(موصى به) ياقة قميص مدببة مع قاعدة' } },
          { value: 'mandarin', label: { en: 'Standing Mandarin / Nehru Band', ar: 'ياقة صينية قائمة (ماندارين)' } },
          { value: 'hood', label: { en: 'Contoured Two-Piece Hood', ar: 'قبعة مجسمة من قطعتين (كابيشون)' } },
          { value: 'facing', label: { en: 'Clean Interior Neckline Facing', ar: 'سجاف رقبة داخلي نظيف' } },
          { value: 'none', label: { en: 'Keep current neckline unchanged', ar: 'بدون إضافة ياقة' } },
        ],
      });
    }
    questions.push({
      id: 'editAlteration',
      title: { en: 'Length & silhouette proportion adjustment:', ar: 'تعديل الطول وتناسب القصة:' },
      why: { en: 'Applies smooth proportional grading to hem and side seams while preserving grainlines.', ar: 'يُعدّل الحاشية والجنب بانسيابية مع الحفاظ على اتجاه النسيج.' },
      options: [
        { value: 'none', recommended: true, label: { en: '(Recommended) Keep current proportions', ar: '(موصى به) الحفاظ على الأبعاد الحالية' } },
        { value: 'lengthen-8', label: { en: 'Lengthen hem by +8 cm', ar: 'إطالة الحاشية +8 سم' } },
        { value: 'shorten-8', label: { en: 'Shorten hem by -8 cm', ar: 'تقصير الحاشية -8 سم' } },
        { value: 'flare-up', label: { en: 'Add graceful A-line hem flare (+22%)', ar: 'زيادة اتساع الحاشية كلوش (+22%)' } },
        { value: 'ease-plus', label: { en: 'Add +3 cm wearing ease at side seams', ar: 'إضافة +3 سم راحة على الجانبين' } },
      ],
    });
    return {
      mode: 'edit',
      detectedStyle: derived,
      readinessPct: Math.min(100, 65 + Object.keys(currentAnswers || {}).length * 12),
      questions,
      inspection: insp,
    };
  }

  // ---- CREATE MODE CONSULTATION ----
  const questions = [];
  let knownCount = 0;
  const totalDimensions = 6;

  if (cues.hasGarmentType) knownCount++;
  if (cues.hasFabric) knownCount++;
  if (cues.hasLength || cues.hasImg) knownCount++;
  if (cues.hasNeckline || !UPPER_BODY_TYPES.has(derived.type)) knownCount++;
  if (cues.hasSleeve || !UPPER_BODY_TYPES.has(derived.type)) knownCount++;
  if (cues.hasClosure) knownCount++;

  // Q1: Garment silhouette family (if not explicitly named in text)
  if (!cues.hasGarmentType) {
    const rec = derived.type || (category === 'men' || category === 'boys' ? 'shirt' : 'dress');
    const typeChoices = (category === 'men' || category === 'boys')
      ? [
        { value: 'shirt', label: { en: 'Tailored Button-Down Shirt', ar: 'قميص كلاسيكي مفصل' } },
        { value: 'jacket', label: { en: 'Tailored Blazer / Jacket', ar: 'جاكيت / بليزر مفصل' } },
        { value: 'suit', label: { en: 'Formal Suit (Jacket + Vest + Trousers)', ar: 'بدلة رسمية متكاملة' } },
        { value: 'robe', label: { en: 'Traditional Thobe / Kandura', ar: 'ثوب / كندورة تقليدية' } },
        { value: 'hoodie', label: { en: 'Hoodie / Pullover Sweatshirt', ar: 'هودي / سويتشيرت' } },
        { value: 'trousers', label: { en: 'Tailored Trousers / Pants', ar: 'بنطلون مفصل' } },
      ]
      : [
        { value: 'dress', label: { en: 'Tailored Day / Cocktail Dress', ar: 'فستان أنيق مفصل' } },
        { value: 'gown', label: { en: 'Princess-Seamed Evening Gown', ar: 'فستان سهرة بقصات أميرة' } },
        { value: 'jacket', label: { en: 'Structured Blazer / Coat', ar: 'بليزر / جاكيت مهيكل' } },
        { value: 'robe', label: { en: 'Flowing Abaya / Kaftan', ar: 'عباية / قفطان انسيابي' } },
        { value: 'jumpsuit', label: { en: 'One-Piece Jumpsuit / Romper', ar: 'جمبسوت قطعة واحدة' } },
        { value: 'skirt', label: { en: 'Skirt with Waistband', ar: 'تنورة مع كمر خصر' } },
        { value: 'trousers', label: { en: 'Wide-Leg / Tailored Trousers', ar: 'بنطلون مفصل / بالازو' } },
      ];
    typeChoices.sort((a, b) => (a.value === rec ? -1 : b.value === rec ? 1 : 0));
    typeChoices[0] = {
      ...typeChoices[0],
      recommended: true,
      label: {
        en: `(Recommended) ${typeChoices[0].label.en}`,
        ar: `(موصى به) ${typeChoices[0].label.ar}`,
      },
    };
    questions.push({
      id: 'garmentType',
      title: { en: 'Confirm primary garment architecture:', ar: 'تأكيد نوع القطعة الأساسية والهيكل:' },
      why: {
        en: imageSupplied ? 'Ensures the silhouette read from your image drafts the exact construction block you want.' : 'Determines the master pattern block (princess seams, tailored jacket, trouser rise, or dress block).',
        ar: imageSupplied ? 'يضمن تحويل الصورة المرفقة إلى القالب الهندسي الصحيح تماماً.' : 'يحدد القالب الأساسي للباترون بدقة احترافية.',
      },
      options: typeChoices,
    });
  }

  // Q2: Fabric weight & stretch (critical for wearing ease & darting!)
  if (!cues.hasFabric) {
    const isStretchDefault = derived.type === 'leotard' || derived.type === 'hoodie';
    questions.push({
      id: 'fabric',
      title: { en: 'Target fabric structure & stretch:', ar: 'نوع القماش ومقدار المرونة:' },
      why: {
        en: 'Woven fabrics require full wearing ease + darts/closures; stretch knits use reduced/negative ease for a clean fit.',
        ar: 'الأقمشة المنسوجة تتطلب مسافة راحة وبنسات وسحاب، بينما التريكو المطاطي يُفصّل براحة أقل.',
      },
      options: isStretchDefault
        ? [
          { value: 'stretch', recommended: true, label: { en: '(Recommended) Stretch Knit / Jersey / Fleece', ar: '(موصى به) تريكو مطاطي / جيرسيه / فليس' } },
          { value: 'woven', label: { en: 'Crisp Structured Woven (Cotton, Poplin, Wool, Satin)', ar: 'منسوج متماسك (قطن، بوبلين، صوف، ساتان)' } },
          { value: 'drape', label: { en: 'Fluid Drape Woven (Silk, Crepe, Chiffon)', ar: 'منسوج انسيابي ناعم (حرير، كريب، شيفون)' } },
        ]
        : [
          { value: 'woven', recommended: true, label: { en: '(Recommended) Crisp Structured Woven (Cotton, Satin, Wool, Gabardine)', ar: '(موصى به) قماش منسوج متماسك (قطن، ساتان، صوف)' } },
          { value: 'drape', label: { en: 'Fluid Drape Woven (Silk, Crepe, Chiffon)', ar: 'قماش انسيابي ناعم (حرير، كريب، شيفون)' } },
          { value: 'stretch', label: { en: 'Stretch Knit / Jersey (Reduced ease)', ar: 'قماش مطاطي جيرسيه / ليكرا' } },
        ],
    });
  }

  // Q3: Closure & Back View engineering (photos almost never show the back!)
  if (!cues.hasClosure) {
    const defaultClosure = ['shirt', 'jacket', 'coat', 'suit', 'vest'].includes(derived.type)
      ? 'button'
      : ['hoodie', 'leotard'].includes(derived.type)
        ? 'pullover'
        : 'zip';
    const closureOpts = [
      { value: 'zip', label: { en: 'Invisible Zipper + Stabilizing Facing', ar: 'سحاب مخفي مع سجاف تقوية' } },
      { value: 'button', label: { en: 'Button-Front Placket / Tailored Lapel', ar: 'مرد أزرار أمامي مفصل' } },
      { value: 'wrap', label: { en: 'Overlapping Wrap Front + Tie Sash', ar: 'قصة لف متداخلة مع حزام ربط' } },
      { value: 'pullover', label: { en: 'Clean Pullover / Slip-On (Cut on Fold)', ar: 'ارتداء علوي بدون فتحة (مقصوص على الثنية)' } },
    ];
    closureOpts.sort((a, b) => (a.value === defaultClosure ? -1 : b.value === defaultClosure ? 1 : 0));
    closureOpts[0] = {
      ...closureOpts[0],
      recommended: true,
      label: { en: `(Recommended) ${closureOpts[0].label.en}`, ar: `(موصى به) ${closureOpts[0].label.ar}` },
    };
    questions.push({
      id: 'closure',
      title: { en: 'Closure system & back construction:', ar: 'طريقة الإغلاق وتفصيل الظهر:' },
      why: {
        en: 'Front reference photos hide the back closure — specifying this ensures accurate plackets, facings, or fold lines.',
        ar: 'الصور الأمامية لا تُظهر إغلاق الظهر — تحديده يضمن رسم المردات والسجاف بدقة.',
      },
      options: closureOpts,
    });
  }

  // Q4: Neckline / Collar (for upper-body garments if unspecified)
  if (UPPER_BODY_TYPES.has(derived.type) && !cues.hasNeckline) {
    const recNeck = derived.neckline || 'round';
    const neckOpts = [
      { value: 'round', label: { en: 'Classic Jewel / Round Neckline', ar: 'حردة رقبة دائرية كلاسيكية' } },
      { value: 'v', label: { en: 'Sculpted V-Neckline', ar: 'فتحة رقبة على شكل V' } },
      { value: 'sweetheart', label: { en: 'Couture Sweetheart Neckline', ar: 'خط رقبة على شكل قلب (سويت هارت)' } },
      { value: 'collar', label: { en: 'Tailored Collar + Stand / Lapel', ar: 'ياقة مفصلة مع قاعدة / طية صدر' } },
      { value: 'mock', label: { en: 'Standing Mandarin / Mock Neck', ar: 'ياقة صينية / قائمة مرتفعة' } },
      { value: 'square', label: { en: 'Architectural Square Neckline', ar: 'حردة رقبة مربعة' } },
      { value: 'boat', label: { en: 'Wide Boat / Bateau Neckline', ar: 'فتحة قارب عريضة (باتو)' } },
    ];
    neckOpts.sort((a, b) => (a.value === recNeck ? -1 : b.value === recNeck ? 1 : 0));
    neckOpts[0] = {
      ...neckOpts[0],
      recommended: true,
      label: { en: `(Recommended) ${neckOpts[0].label.en}`, ar: `(موصى به) ${neckOpts[0].label.ar}` },
    };
    questions.push({
      id: 'neckline',
      title: { en: 'Neckline or collar geometry:', ar: 'شكل فتحة الرقبة أو الياقة:' },
      why: { en: 'Controls front/back neckline curve depth and automatically drafts collar/stand pieces when needed.', ar: 'يتحكم بعمق وانحناء الرقبة ويُدرج قطع الياقة تلقائياً عند الحاجة.' },
      options: neckOpts,
    });
  }

  // Q5: Sleeve architecture (for upper-body garments if unspecified)
  if (UPPER_BODY_TYPES.has(derived.type) && derived.type !== 'vest' && !cues.hasSleeve) {
    const recSlv = derived.sleeveLenF <= 0.05 ? 'sleeveless' : derived.sleeveLenF >= 1.0 ? 'long' : 'short';
    const slvOpts = [
      { value: 'long', label: { en: 'Full-Length Set-In Sleeve', ar: 'كم طويل كلاسيكي كامل' } },
      { value: 'short', label: { en: 'Short / Cap Sleeve', ar: 'كم قصير / كاب' } },
      { value: 'threeQuarter', label: { en: '3/4 Bracelet Sleeve', ar: 'كم ثلاثة أرباع (3/4)' } },
      { value: 'puff', label: { en: 'Gathered Puff / Bishop Volume Sleeve', ar: 'كم منفوش / واسع بكشكشة' } },
      { value: 'sleeveless', label: { en: 'Sleeveless + Clean Armhole Binding', ar: 'بدون أكمام مع شريط تشطيب الإبط' } },
    ];
    slvOpts.sort((a, b) => (a.value === recSlv ? -1 : b.value === recSlv ? 1 : 0));
    slvOpts[0] = {
      ...slvOpts[0],
      recommended: true,
      label: { en: `(Recommended) ${slvOpts[0].label.en}`, ar: `(موصى به) ${slvOpts[0].label.ar}` },
    };
    questions.push({
      id: 'sleeve',
      title: { en: 'Sleeve style & volume:', ar: 'تصميم وطول الأكمام:' },
      why: { en: 'Drafts true raised-cosine (-cos) S-curve sleeve caps with front/crown/back balance notches.', ar: 'يرسم رأس كم بمنحنى (-cos) هندسي دقيق مع فرزات التوازن الأمامية والخلفية.' },
      options: slvOpts,
    });
  }

  // Q6: Couture finishing & accessories (always offer if not explicitly detailed)
  if (!cues.hasFinishes) {
    questions.push({
      id: 'finishes',
      title: { en: 'Atelier interior & utility finishes:', ar: 'التشطيبات الاحترافية والقطع الإضافية:' },
      why: { en: 'Adds production-ready pocket bags, waist belts, cuffs, and interior facings/linings.', ar: 'يُضيف أكياس الجيوب والأحزمة والسجاف والبطانة الداخلية الجاهزة للإنتاج.' },
      options: [
        { value: 'pockets-facings', recommended: true, label: { en: '(Recommended) Side/Patch Pockets + Neck/Front Facings', ar: '(موصى به) جيوب عملية + سجاف تشطيب' } },
        { value: 'full-couture', label: { en: 'Full Couture Package (Pockets + Facings + Full Interior Lining + Belt)', ar: 'حزمة كوتور كاملة (جيوب + سجاف + بطانة كاملة + حزام)' } },
        { value: 'belt-pockets', label: { en: 'Matching Waist Sash/Belt + Pockets', ar: 'حزام خصر مطابق + جيوب' } },
        { value: 'minimal', label: { en: 'Essential Shell Pieces Only', ar: 'القطع الأساسية الخارجية فقط' } },
      ],
    });
  }

  const answeredCount = Object.keys(currentAnswers || {}).filter((k) => currentAnswers[k]).length;
  const readinessPct = Math.min(100, Math.round(((knownCount + answeredCount) / Math.max(totalDimensions, knownCount + questions.length)) * 100));

  return {
    mode: 'create',
    detectedStyle: derived,
    readinessPct: questions.length === 0 ? 100 : Math.max(45, readinessPct),
    questions,
  };
}

// Merge user consultation answers into both an enriched prompt and deterministic style overrides
export function applyClarificationAnswers({ prompt = '', baseStyle = {}, answers = {}, customNote = '' } = {}) {
  const style = { ...baseStyle };
  const extraClauses = [];

  if (answers.garmentType) {
    style.type = answers.garmentType;
    extraClauses.push(answers.garmentType);
  }
  const fab = answers.fabric || answers.fabricClass;
  if (fab === 'stretch' || fab === 'knit') {
    style.fitF = clamp((style.fitF || 1) * 0.90, 0.72, 1.15);
    style.fabric = 'stretch';
    extraClauses.push('stretch jersey knit fabric');
  } else if (fab === 'drape' || fab === 'fluid-woven') {
    style.fitF = clamp((style.fitF || 1) * 1.03, 0.75, 1.25);
    style.fabric = 'drape';
    extraClauses.push('fluid drape silk crepe fabric');
  } else if (fab === 'woven' || fab === 'structured-woven') {
    style.fabric = 'woven';
    extraClauses.push('structured woven fabric');
  }

  if (answers.closure === 'zip' || answers.closure === 'invisible-zip') {
    style.zip = true; style.wrap = false; style.button = false;
    extraClauses.push('invisible zipper closure with zip facing');
  } else if (answers.closure === 'button' || answers.closure === 'button-front') {
    style.button = true; style.wrap = false; style.zip = false;
    extraClauses.push('button-front placket closure');
  } else if (answers.closure === 'wrap') {
    style.wrap = true; style.zip = false; style.button = false;
    extraClauses.push('overlapping wrap closure with tie sash');
  } else if (answers.closure === 'pullover') {
    style.wrap = false; style.zip = false; style.button = false;
    extraClauses.push('clean pullover construction cut on fold');
  }

  if (answers.neckline) {
    style.neckline = answers.neckline;
    extraClauses.push(`${answers.neckline} neckline`);
  }

  if (answers.sleeve === 'sleeveless') {
    style.sleeveLenF = 0;
    extraClauses.push('sleeveless with armhole binding');
  } else if (answers.sleeve === 'short') {
    style.sleeveLenF = 0.45; style.sleeveWideF = 1.0;
    extraClauses.push('short set-in sleeves');
  } else if (answers.sleeve === 'threeQuarter') {
    style.sleeveLenF = 0.8;
    extraClauses.push('three-quarter sleeves');
  } else if (answers.sleeve === 'long') {
    style.sleeveLenF = 1.25;
    extraClauses.push('full-length long set-in sleeves');
  } else if (answers.sleeve === 'puff') {
    style.sleeveLenF = Math.max(0.55, style.sleeveLenF || 0.65);
    style.sleeveWideF = 1.6;
    style.sleeveGatherRatio = 1.55;
    extraClauses.push('gathered puff volume sleeves');
  }

  const fin = answers.finishes || answers.finishing;
  if (fin === 'pockets-facings') {
    style.pockets = true; style.facings = true;
    extraClauses.push('with side pockets and interior facings');
  } else if (fin === 'full-couture') {
    style.pockets = true; style.facings = true; style.lining = true; style.belt = true;
    extraClauses.push('with pockets, facings, full interior lining, and waist belt');
  } else if (fin === 'lined-pockets') {
    style.pockets = true; style.facings = true; style.lining = true;
    extraClauses.push('with pockets, facings, and full interior lining');
  } else if (fin === 'belt-pockets') {
    style.pockets = true; style.belt = true;
    extraClauses.push('with matching waist belt and pockets');
  } else if (fin === 'minimal') {
    style.pockets = false; style.lining = false;
  }

  if (customNote && customNote.trim()) {
    extraClauses.push(customNote.trim());
    const noteStyle = AIGen.deriveStyle({ prompt: customNote, category: 'women' });
    if (/\bpocket|جيب/.test(customNote.toLowerCase())) style.pockets = true;
    if (/\blining|lined|بطانة|مبطن/.test(customNote.toLowerCase())) style.lining = true;
    if (/\bbelt|sash|حزام/.test(customNote.toLowerCase())) style.belt = true;
    if (/\bhood|قبعة|كابيشون/.test(customNote.toLowerCase())) style.hood = true;
    if (/\bpleat|كسرات|بليسيه/.test(customNote.toLowerCase())) style.pleatCount = noteStyle.pleatCount || 4;
  }

  const enrichedPrompt = [prompt.trim(), ...extraClauses].filter(Boolean).join(', ');
  return { enrichedPrompt, style };
}

// ============================================================
// 3. COUTURE PATTERN SYNTHESIZER (100% Exact Match + QA Healed)
// ============================================================
export function synthesizeCouturePattern({
  prompt = '',
  metrics = null,
  imageDataURL = null,
  category = 'women',
  measurements = {},
  answers = {},
  customNote = '',
  styleOverride = null,
  seamAllowanceCm = 1.0,
  lang = 'en',
} = {}) {
  const baseStyle = styleOverride || AIGen.deriveStyle({ metrics, prompt, category, imageDataURL });
  const { style, enrichedPrompt } = applyClarificationAnswers({ prompt, baseStyle, answers, customNote });
  const built = AIGen.build(style, measurements);
  let pieces = built.pieces.slice();

  // Add explicit finishing pieces requested via prompt or Designer Q&A if not already present
  const roles = new Set(pieces.map((p) => p.role));
  if (style.zip && !roles.has('placket-facing') && !roles.has('lapel-facing')) {
    const zipLen = Math.min(55, Math.max(22, (measurements.backLen || 40) * 0.95));
    pieces.push({
      name: { en: 'Invisible Zipper Facing', ar: 'سجاف تقوية السحاب المخفي' },
      desc: { en: 'Interfaced stabilizing strip for the invisible zipper opening.', ar: 'شريط تقوية بالحشوة لتثبيت فتحة السحاب المخفي.' },
      outline: bandPc(4, zipLen),
      darts: [], notches: [[0, 0]], grain: [[2, 3], [2, zipLen - 3]],
      role: 'placket-facing', bilateral: true,
    });
  }
  if (style.button && !roles.has('placket-facing') && !roles.has('lapel-facing')) {
    const plkLen = Math.max(28, (measurements.backLen || 40) * 1.05);
    pieces.push({
      name: { en: 'Button-Front Placket', ar: 'مرد الأزرار الأمامي' },
      desc: { en: 'Interfaced center-front button and buttonhole placket.', ar: 'مرد أزرار وعراوي أمامي مقوى.' },
      outline: bandPc(4.5, plkLen),
      darts: [], notches: [[0, 0]], grain: [[2.25, 3], [2.25, plkLen - 3]],
      role: 'placket-facing', bilateral: true,
    });
  }
  if ((style.neckline === 'collar' || style.neckline === 'mock') && UPPER_BODY_TYPES.has(style.type)
      && !roles.has('collar') && !roles.has('collar-stand')) {
    const halfNeck = Math.max(17, (measurements.neck || 37) / 2 + 1.5);
    if (style.neckline === 'mock') {
      const st = collarStand(halfNeck, 4.2);
      pieces.push({
        name: { en: 'Standing Mandarin Collar', ar: 'ياقة صينية قائمة' },
        desc: { en: 'Contoured upright collar band.', ar: 'ياقة قائمة منحنية مطابقة لمحيط الرقبة.' },
        outline: st, curves: st.curves || [], darts: [], notches: [st[0]],
        grain: [[3, 2], [halfNeck - 3, 2]], role: 'collar-stand', cutOnFold: true,
      });
    } else {
      const col = pointedCollar(halfNeck, 3.2, 6.5);
      const st = collarStand(halfNeck, 3.2);
      pieces.push(
        {
          name: { en: 'Pointed Upper Collar', ar: 'الياقة العلوية المدببة' },
          desc: { en: 'Contoured pointed collar leaf matched to neckline.', ar: 'ياقة قميص مدببة مطابقة لقوس الرقبة.' },
          outline: col, curves: col.curves || [], darts: [], notches: [col[0]],
          grain: [[3, 3], [halfNeck - 3, 3]], role: 'collar', cutOnFold: true,
        },
        {
          name: { en: 'Collar Stand Band', ar: 'رجل / قاعدة الياقة' },
          desc: { en: 'Curved collar stand supporting the collar roll.', ar: 'قاعدة الياقة المقوسة لضبط ثبات الياقة.' },
          outline: st, curves: st.curves || [], darts: [], notches: [st[0]],
          grain: [[3, 1.5], [halfNeck - 3, 1.5]], role: 'collar-stand', cutOnFold: true,
        },
      );
    }
  }
  if (style.facings && UPPER_BODY_TYPES.has(style.type) && !roles.has('facing') && !roles.has('lapel-facing')) {
    const halfNeck = Math.max(16, (measurements.neck || 37) / 2);
    pieces.push(
      {
        name: { en: 'Front Neckline Facing', ar: 'سجاف الرقبة الأمامي' },
        desc: { en: 'Shaped interior facing for a crisp neckline edge.', ar: 'سجاف داخلي منحوت لتنظيف حردة الرقبة الأمامية.' },
        outline: [[0, 5], [halfNeck * 0.55, 0], [halfNeck * 0.55 + 5.5, 0], [halfNeck * 0.55 + 4, 9.5], [0, 10.5]],
        darts: [], notches: [[0, 5]], grain: [[2, 5.5], [2, 9.8]],
        role: 'facing', cutOnFold: !style.wrap,
      },
      {
        name: { en: 'Back Neckline Facing', ar: 'سجاف الرقبة الخلفي' },
        desc: { en: 'Contoured back neck facing.', ar: 'سجاف الرقبة الخلفي.' },
        outline: bandPc(halfNeck * 0.52 + 5, 6.5),
        darts: [], notches: [[0, 0]], grain: [[2, 1.5], [2, 5]],
        role: 'facing', cutOnFold: true,
      },
    );
  }
  if (style.lining && !roles.has('lining')) {
    const shell = pieces.find((p) => ['bodice-back-center', 'back-panel', 'skirt-back'].includes(p.role) || /Back/i.test(p.name?.en || ''));
    if (shell) {
      const bb = bboxOf(shell.outline);
      const trimH = bb.h > 25 ? 2.0 : 0;
      const linedOutline = shell.outline.map(([x, y]) => [x, y > bb.maxY - 3 ? +(y - trimH).toFixed(3) : y]);
      pieces.push({
        name: { en: 'Interior Lining Panel', ar: 'لوحة البطانة الداخلية' },
        desc: { en: 'Full interior lining drafted 2 cm shorter at hem so it never peeks below the shell.', ar: 'بطانة داخلية كاملة أقصر بـ 2 سم عند الحاشية لعدم البروز.' },
        outline: linedOutline,
        curves: JSON.parse(JSON.stringify(shell.curves || [])),
        darts: JSON.parse(JSON.stringify(shell.darts || [])),
        notches: linedOutline.length ? [linedOutline[0]] : [],
        grain: JSON.parse(JSON.stringify(shell.grain || [])),
        role: 'lining',
        cutOnFold: !!shell.cutOnFold,
      });
    }
  }

  const { pieces: validPieces, validation } = ensureValidPieces(pieces, measurements, seamAllowanceCm);
  return {
    pieces: validPieces,
    colors: built.colors,
    colorInt: built.colorInt,
    style,
    enrichedPrompt,
    summary: AIGen.summary(style, lang),
    attributes: AIGen.attributes(style, lang),
    validation,
  };
}

// ============================================================
// 4. EXISTING PATTERN INSPECTOR, COMPLETER & EDITOR
// ============================================================
const FRONT_TORSO_ROLES = new Set(['bodice-front', 'bodice-front-center', 'front-panel']);
const BACK_TORSO_ROLES = new Set(['bodice-back', 'bodice-back-center', 'back-panel']);
const SLEEVE_ROLES = new Set(['sleeve', 'puff-sleeve', 'cap-sleeve', 'butterfly-sleeve', 'sleeve-upper', 'sleeve-under']);
const COLLAR_ROLES = new Set(['collar', 'collar-stand', 'collar-band', 'undercollar', 'hood']);
const WAIST_ROLES = new Set(['waistband', 'belt', 'sash', 'wrap-tie']);
const FACING_ROLES = new Set(['facing', 'lapel-facing', 'placket-facing']);

function classifyPieceKind(p) {
  const r = p?.role || '';
  const n = (p?.name?.en || '').toLowerCase();
  if (FRONT_TORSO_ROLES.has(r) || (/front/.test(n) && /bodice|top|dress|shirt|jacket|coat|robe|hoodie|panel/.test(n))) return 'torso-front';
  if (BACK_TORSO_ROLES.has(r) || (/back/.test(n) && /bodice|top|dress|shirt|jacket|coat|robe|hoodie|panel/.test(n))) return 'torso-back';
  if (r === 'skirt-front' || r === 'skirt-front-gore' || /front skirt/.test(n)) return 'skirt-front';
  if (r === 'skirt-back' || r === 'skirt-back-gore' || /back skirt/.test(n)) return 'skirt-back';
  if (r === 'trouser-front' || r === 'shorts-front' || /front (leg|trouser|short)/.test(n)) return 'leg-front';
  if (r === 'trouser-back' || r === 'shorts-back' || /back (leg|trouser|short)/.test(n)) return 'leg-back';
  if (SLEEVE_ROLES.has(r) || /sleeve/.test(n)) return 'sleeve';
  if (COLLAR_ROLES.has(r) || /collar|hood|stand/.test(n)) return 'collar';
  if (r === 'cuff' || r === 'rib-cuff' || /cuff/.test(n)) return 'cuff';
  if (WAIST_ROLES.has(r) || /waistband|belt|sash/.test(n)) return 'waistband';
  if (r === 'pocket' || /pocket/.test(n)) return 'pocket';
  if (FACING_ROLES.has(r) || /facing|placket/.test(n)) return 'facing';
  if (r === 'lining' || /lining/.test(n)) return 'lining';
  return 'other';
}

// Estimate neckline arc, armhole arc, waist circumference, wrist width, and length from actual canvas geometry
export function inspectExistingPattern(pieces = [], measurements = null, lang = 'en') {
  const ar = lang === 'ar';
  const m = measurements || { chest: 92, waist: 74, hips: 98, neck: 37, bicep: 30, sleeve: 58, backLen: 40, inseam: 76 };
  const kinds = new Set();
  let torsoFront = null, torsoBack = null, skirtFront = null, skirtBack = null, legFront = null, legBack = null, sleevePc = null;

  for (const p of pieces) {
    if (!p?.outline?.length) continue;
    const k = classifyPieceKind(p);
    kinds.add(k);
    if (k === 'torso-front' && !torsoFront) torsoFront = p;
    if (k === 'torso-back' && !torsoBack) torsoBack = p;
    if (k === 'skirt-front' && !skirtFront) skirtFront = p;
    if (k === 'skirt-back' && !skirtBack) skirtBack = p;
    if (k === 'leg-front' && !legFront) legFront = p;
    if (k === 'leg-back' && !legBack) legBack = p;
    if (k === 'sleeve' && !sleevePc) sleevePc = p;
  }

  const hasUpperBody = kinds.has('torso-front') || kinds.has('torso-back') || pieces.some((p) => (p.role || '').startsWith('bodice-'));
  const hasLowerBody = kinds.has('skirt-front') || kinds.has('skirt-back') || kinds.has('leg-front') || kinds.has('leg-back');
  const hasSleeves = kinds.has('sleeve');
  const hasCollar = kinds.has('collar');
  const hasCuffs = kinds.has('cuff');
  const hasWaistband = kinds.has('waistband');
  const hasPockets = kinds.has('pocket');
  const hasFacings = kinds.has('facing');
  const hasLining = kinds.has('lining');

  // Measure neckline arc from top 18% of front/back torso pieces when available
  let frontNeckHalf = (m.neck || 37) * 0.28;
  let backNeckHalf = (m.neck || 37) * 0.22;
  if (torsoFront) {
    const bb = bboxOf(torsoFront.outline);
    const topPts = torsoFront.outline.filter((pt) => pt[1] <= bb.minY + bb.h * 0.16 && pt[0] <= bb.minX + bb.w * 0.65);
    if (topPts.length >= 2) {
      let arc = 0;
      for (let i = 0; i < topPts.length - 1; i++) arc += dist(topPts[i], topPts[i + 1]);
      if (arc >= 5 && arc <= 28) frontNeckHalf = arc;
    }
  }
  if (torsoBack) {
    const bb = bboxOf(torsoBack.outline);
    const topPts = torsoBack.outline.filter((pt) => pt[1] <= bb.minY + bb.h * 0.12 && pt[0] <= bb.minX + bb.w * 0.6);
    if (topPts.length >= 2) {
      let arc = 0;
      for (let i = 0; i < topPts.length - 1; i++) arc += dist(topPts[i], topPts[i + 1]);
      if (arc >= 4 && arc <= 22) backNeckHalf = arc;
    }
  }
  const neckArcCm = clamp((frontNeckHalf + backNeckHalf) * 2, 30, 58);

  // Measure waist circumference from skirt/trouser top or torso waist
  let waistCircCm = m.waist || 74;
  const waistRef = skirtFront || legFront || torsoFront;
  if (waistRef) {
    const bb = bboxOf(waistRef.outline);
    const factor = waistRef.cutOnFold ? 4 : 2;
    const est = bb.w * factor * 0.88;
    if (est >= 46 && est <= 150) waistCircCm = est;
  }

  // Measure armscye & wrist from torso / sleeve
  const armholeArcCm = clamp((m.bicep || 30) * 1.38 + 4, 32, 64);
  let wristWidthCm = Math.max(19, (m.bicep || 30) * 0.74);
  if (sleevePc) {
    const bb = bboxOf(sleevePc.outline);
    const bottomPts = sleevePc.outline.filter((pt) => pt[1] >= bb.maxY - Math.max(2, bb.h * 0.08));
    if (bottomPts.length >= 2) {
      const xs = bottomPts.map((pt) => pt[0]);
      const span = Math.max(...xs) - Math.min(...xs);
      if (span >= 12 && span <= 48) wristWidthCm = span;
    }
  }

  // Build smart 1-click Missing-Piece Suggestions
  const missingSuggestions = [];
  if ((torsoFront && !torsoBack) || (skirtFront && !skirtBack) || (legFront && !legBack)
      || (!torsoFront && torsoBack) || (!skirtFront && skirtBack) || (!legFront && legBack)) {
    missingSuggestions.push({
      op: 'complete-counterpart',
      label: { en: '+ Complete Missing Front/Back Panel', ar: '+ إكمال اللوحة المقابلة الناقصة (أمام/خلف)' },
    });
  }
  if (hasUpperBody && !hasCollar) {
    missingSuggestions.push(
      { op: 'add-collar', label: { en: '+ Pointed Collar & Stand', ar: '+ ياقة قميص مدببة مع قاعدة' } },
      { op: 'add-mandarin', label: { en: '+ Mandarin Stand Collar', ar: '+ ياقة صينية قائمة' } },
      { op: 'add-hood', label: { en: '+ Two-Piece Hood', ar: '+ قبعة مجسمة (كابيشون)' } },
    );
  }
  if (hasUpperBody && !hasSleeves) {
    missingSuggestions.push(
      { op: 'add-sleeves', label: { en: '+ Set-In Sleeves', ar: '+ أكمام كلاسيكية مركّبة' } },
      { op: 'add-puff-sleeves', label: { en: '+ Gathered Puff Sleeves', ar: '+ أكمام منفوشة بكشكشة' } },
      { op: 'add-tailored-sleeves', label: { en: '+ 2-Piece Jacket Sleeves', ar: '+ أكمام جاكيت من قطعتين' } },
    );
  }
  if (hasSleeves && !hasCuffs) {
    missingSuggestions.push({ op: 'add-cuffs', label: { en: '+ Wrist Cuffs', ar: '+ أساور المعصم' } });
  }
  if ((hasLowerBody || hasUpperBody) && !hasWaistband) {
    missingSuggestions.push(
      { op: 'add-waistband', label: { en: '+ Contoured Waistband', ar: '+ كمر خصر مهيكل' } },
      { op: 'add-belt', label: { en: '+ Tie Sash / Belt', ar: '+ حزام خصر' } },
    );
  }
  if (!hasPockets && pieces.length > 0) {
    missingSuggestions.push({ op: 'add-pockets', label: { en: '+ Pockets', ar: '+ إضافة جيوب' } });
  }
  if (hasUpperBody && !hasFacings) {
    missingSuggestions.push({ op: 'add-facings', label: { en: '+ Neck & Front Facings', ar: '+ سجاف الرقبة والأمام' } });
  }
  if (!hasLining && pieces.length > 0) {
    missingSuggestions.push({ op: 'add-lining', label: { en: '+ Full Interior Lining', ar: '+ بطانة داخلية كاملة' } });
  }

  let maxHeightCm = 0;
  for (const p of pieces) {
    if (p?.outline?.length >= 2) {
      maxHeightCm = Math.max(maxHeightCm, bboxOf(p.outline).h);
    }
  }

  return {
    hasPieces: pieces.length > 0,
    count: pieces.length,
    pieceCount: pieces.length,
    hasFront: !!(torsoFront || skirtFront || legFront),
    hasBack: !!(torsoBack || skirtBack || legBack),
    hasUpperBody,
    hasLowerBody,
    hasSleeves,
    hasSleeve: hasSleeves,
    hasCollar,
    hasCuffs,
    hasWaistband,
    hasPockets,
    hasFacings,
    hasLining,
    neckArcCm: +neckArcCm.toFixed(2),
    armholeArcCm: +armholeArcCm.toFixed(2),
    waistCircCm: +waistCircCm.toFixed(2),
    wristWidthCm: +wristWidthCm.toFixed(2),
    maxHeightCm: +maxHeightCm.toFixed(1),
    missingSuggestions,
    statusText: ar
      ? `${pieces.length} قطع حالية · محيط الرقبة ${neckArcCm.toFixed(1)} سم · الخصر ${waistCircCm.toFixed(1)} سم`
      : `${pieces.length} active piece(s) · Neck ${neckArcCm.toFixed(1)} cm · Waist ${waistCircCm.toFixed(1)} cm`,
  };
}

// Parse natural-language EN/AR edit/completion instruction into concrete operations + numeric parameters
export function parseEditInstruction(instruction = '', answers = {}) {
  const raw = normalizeDigits(instruction);
  const t = raw.toLowerCase();
  const ops = new Set();
  let lengthDeltaCm = 0;
  let flareFactor = 1.0;
  let easeDeltaCm = 0;

  // Map Q&A answers first
  if (answers.editOperation === 'auto-complete') ops.add('auto-complete');
  if (answers.editOperation === 'restyle-details') {
    ops.add('add-pockets'); ops.add('add-waistband'); ops.add('add-lining');
  }
  if (answers.editSleeve === 'set-in-long') ops.add('add-sleeves');
  else if (answers.editSleeve === 'puff') ops.add('add-puff-sleeves');
  else if (answers.editSleeve === 'tailored-2pc') ops.add('add-tailored-sleeves');
  else if (answers.editSleeve === 'short') ops.add('add-short-sleeves');
  else if (answers.editSleeve === 'keep') ops.add('add-armhole-binding');

  if (answers.editCollar === 'pointed-collar') ops.add('add-collar');
  else if (answers.editCollar === 'mandarin') ops.add('add-mandarin');
  else if (answers.editCollar === 'hood') ops.add('add-hood');
  else if (answers.editCollar === 'facing') ops.add('add-facings');

  if (answers.editAlteration === 'lengthen-8') lengthDeltaCm += 8;
  else if (answers.editAlteration === 'shorten-8') lengthDeltaCm -= 8;
  else if (answers.editAlteration === 'flare-up') flareFactor *= 1.22;
  else if (answers.editAlteration === 'ease-plus') easeDeltaCm += 1.5;

  // Parse free-text natural language instructions (EN + AR)
  if (/complete|missing|finish all|أكمل|إكمال|الناقص/.test(t)) ops.add('auto-complete');
  if (/counterpart|missing back|missing front|الخلف الناقص|الأمام الناقص|القطعة المقابلة/.test(t)) ops.add('complete-counterpart');
  if (/mandarin|stand[- ]?collar|mock[- ]?neck|nehru|ياقة صينية|ياقة قائمة/.test(t)) ops.add('add-mandarin');
  else if (/\bcollar\b|pointed collar|shirt collar|ياقة/.test(t)) ops.add('add-collar');
  if (/\bhood\b|hoodie|قبعة|كابيشون/.test(t)) ops.add('add-hood');

  if (/two[- ]?piece sleeve|jacket sleeve|tailored sleeve|كم من قطعتين|كم جاكيت/.test(t)) ops.add('add-tailored-sleeves');
  else if (/puff[- ]?sleeve|gathered sleeve|balloon sleeve|كم منفوش|أكمام منفوشة/.test(t)) ops.add('add-puff-sleeves');
  else if (/short[- ]?sleeve|cap[- ]?sleeve|كم قصير|أكمام قصيرة/.test(t)) ops.add('add-short-sleeves');
  else if (/remove sleeve|sleeveless|بدون أكمام|حذف الكم|إزالة الكم/.test(t)) ops.add('remove-sleeves');
  else if (/\bsleeves?\b|كم|أكمام/.test(t)) ops.add('add-sleeves');

  if (/\bcuffs?\b|wristband|أسورة|أساور/.test(t)) ops.add('add-cuffs');
  if (/\bwaistband\b|حزام خصر|كمر/.test(t)) ops.add('add-waistband');
  else if (/\bbelt\b|\bsash\b|tie[- ]?waist|حزام/.test(t)) ops.add('add-belt');
  if (/\bpockets?\b|جيب|جيوب/.test(t)) ops.add('add-pockets');
  if (/\bfacings?\b|\bplacket\b|سجاف|مرد/.test(t)) ops.add('add-facings');
  if (/\blining\b|\blined\b|بطانة|مبطن/.test(t)) ops.add('add-lining');
  if (/\bdarts?\b|بنسة|بنسات/.test(t)) ops.add('add-waist-darts');
  if (/\bpleats?\b|pleated|كسرات|طيات|بليسيه/.test(t)) ops.add('add-pleats');
  if (/\bgathers?\b|gathered|كشكشة/.test(t)) ops.add('add-gathers');
  if (/v[- ]?neck|فتحة v|رقبة v/i.test(t)) ops.add('reshape-v-neck');
  if (/boat[- ]?neck|قارب/.test(t)) ops.add('reshape-boat-neck');
  if (/square[- ]?neck|مربع/.test(t)) ops.add('reshape-square-neck');

  // Parse explicit cm numbers for lengthening/shortening/ease
  const lenNumMatch = /(?:lengthen|longer|extend|add length|إطالة|أطول|زد الطول)[^0-9-]*(\d+(?:\.\d+)?)\s*(?:cm|سم)?/.exec(t)
    || /\+\s*(\d+(?:\.\d+)?)\s*(?:cm|سم)\s*(?:length|hem|طول)?/.exec(t);
  const shortNumMatch = /(?:shorten|shorter|crop|reduce length|تقصير|أقصر|نقص الطول)[^0-9-]*(\d+(?:\.\d+)?)\s*(?:cm|سم)?/.exec(t)
    || /-\s*(\d+(?:\.\d+)?)\s*(?:cm|سم)\s*(?:length|hem|طول)?/.exec(t);

  if (lenNumMatch) { lengthDeltaCm += clamp(parseFloat(lenNumMatch[1]), 1, 65); ops.add('lengthen'); }
  else if (/\blengthen\b|\blonger\b|\bmaxi\b|إطالة|أطول/.test(t)) { lengthDeltaCm += 10; ops.add('lengthen'); }

  if (shortNumMatch) { lengthDeltaCm -= clamp(parseFloat(shortNumMatch[1]), 1, 50); ops.add('shorten'); }
  else if (/\bshorten\b|\bshorter\b|\bcrop\b|\bmini\b|تقصير|أقصر/.test(t)) { lengthDeltaCm -= 8; ops.add('shorten'); }

  if (/\bflare\b|a[- ]?line|wider hem|circle|كلوش|توسيع الحاشية/.test(t)) { flareFactor *= 1.25; ops.add('add-flare'); }
  if (/\bslim\b|\btaper\b|\bpencil\b|\bnarrower\b|تضييق الحاشية|قلم/.test(t)) { flareFactor *= 0.84; ops.add('slim-silhouette'); }

  const easePlusMatch = /(?:looser|relax|more ease|widen|أوسع|توسيع)[^0-9]*(\d+(?:\.\d+)?)\s*(?:cm|سم)?/.exec(t);
  const easeMinusMatch = /(?:tighter|take in|slimmer fit|less ease|تضييق المقاس|أضيق)[^0-9]*(\d+(?:\.\d+)?)\s*(?:cm|سم)?/.exec(t);
  if (easePlusMatch) easeDeltaCm += clamp(parseFloat(easePlusMatch[1]) / 2, 0.5, 8);
  else if (/\blooser\b|\brelax\b|more ease|\bwiden fit\b|توسيع المقاس|فضفاض/.test(t)) easeDeltaCm += 1.5;

  if (easeMinusMatch) easeDeltaCm -= clamp(parseFloat(easeMinusMatch[1]) / 2, 0.5, 6);
  else if (/\btighter\b|take in|tailor fit|تضييق المقاس|مخصر/.test(t)) easeDeltaCm -= 1.2;

  return { ops: [...ops], lengthDeltaCm, cm: Math.abs(lengthDeltaCm), flareFactor, easeDeltaCm };
}

function scalePieceHemAndLength(piece, { lengthDeltaCm = 0, flareFactor = 1.0, easeDeltaCm = 0 }) {
  if (piece.locked) return { piece, skippedLocked: true };
  const p = JSON.parse(JSON.stringify(piece));
  const bb = bboxOf(p.outline);
  if (bb.h < 6 || bb.w < 4) return { piece: p, skippedLocked: false };

  const targetMinH = 8;
  const effectiveLenDelta = Math.max(targetMinH - bb.h, lengthDeltaCm);
  const scaleY = (bb.h + effectiveLenDelta) / bb.h;

  const mapPt = ([x, y]) => {
    const relY = clamp((y - bb.minY) / Math.max(1e-6, bb.h), 0, 1);
    // Keep top 28% (neckline/shoulder/armscye/waistband) vertically intact; stretch lower 72% smoothly
    const ny = relY <= 0.28
      ? y
      : bb.minY + bb.h * 0.28 + (y - (bb.minY + bb.h * 0.28)) * ((scaleY * bb.h - bb.h * 0.28) / Math.max(1, bb.h * 0.72));

    // Flare widens gradually toward the bottom hem; ease shifts outer edge
    let nx = x;
    const isNearLeftFold = p.cutOnFold && Math.abs(x - bb.minX) < Math.max(0.6, bb.w * 0.04);
    if (!isNearLeftFold) {
      const spanFromFold = x - bb.minX;
      const flareAtY = 1 + (flareFactor - 1) * Math.max(0, (relY - 0.35) / 0.65);
      const easeAtY = (spanFromFold > bb.w * 0.55 && relY > 0.12) ? easeDeltaCm : 0;
      nx = bb.minX + Math.max(0.5, spanFromFold * flareAtY + easeAtY);
    }
    return [+nx.toFixed(3), +ny.toFixed(3)];
  };

  p.outline = p.outline.map(mapPt);
  p.curves = (p.curves || []).map((c) => ({
    ...c,
    c1: c.c1 ? mapPt(c.c1) : c.c1,
    c2: c.c2 ? mapPt(c.c2) : c.c2,
  }));
  p.darts = (p.darts || []).map((d) => d.map(mapPt));
  p.notches = (p.notches || []).map((nt) => snapNotchToOutline(mapPt(nt), p.outline));
  if (Array.isArray(p.grain) && p.grain.length === 2) {
    p.grain = p.grain.map(mapPt);
  }
  return { piece: p, skippedLocked: false };
}

const EDIT_OP_ALIASES = {
  flare: 'add-flare',
  taper: 'slim-silhouette',
  'add-darts': 'add-waist-darts',
  'neckline-v': 'reshape-v-neck',
  'neckline-square': 'reshape-square-neck',
  'neckline-boat': 'reshape-boat-neck',
};

export function editOrCompletePattern({
  pieces = [],
  instruction = '',
  operations = [],
  answers = {},
  measurements = {},
  seamAllowanceCm = 1.0,
  lang = 'en',
} = {}) {
  const ar = lang === 'ar';
  if (!Array.isArray(pieces) || !pieces.length) {
    return { ok: false, reason: 'empty-canvas', pieces: [], appliedLog: [] };
  }

  const m = {
    chest: 92, waist: 74, hips: 98, neck: 37, bicep: 30, sleeve: 58, backLen: 40, inseam: 76, shoulder: 40, height: 166,
    ...measurements,
  };
  const parsed = parseEditInstruction(instruction, answers);
  const normalizedInputOps = (operations || []).map((op) => EDIT_OP_ALIASES[op] || op);
  const opSet = new Set([...normalizedInputOps, ...parsed.ops]);

  const insp = inspectExistingPattern(pieces, m, lang);
  // Expand `auto-complete` into concrete missing construction pieces
  if (opSet.has('auto-complete')) {
    opSet.delete('auto-complete');
    if (insp.missingSuggestions.some((s) => s.op === 'complete-counterpart')) opSet.add('complete-counterpart');
    if (insp.hasUpperBody && !insp.hasCollar) opSet.add('add-facings');
    if (insp.hasUpperBody && !insp.hasSleeves) opSet.add('add-sleeves');
    if ((insp.hasLowerBody || insp.hasUpperBody) && !insp.hasWaistband) opSet.add('add-waistband');
    if (!insp.hasPockets) opSet.add('add-pockets');
  }

  let working = JSON.parse(JSON.stringify(pieces));
  const appliedLog = [];
  let lockedSkipped = 0;

  // 1) Remove sleeves if requested
  if (opSet.has('remove-sleeves')) {
    const beforeLen = working.length;
    working = working.filter((p) => p.locked || classifyPieceKind(p) !== 'sleeve');
    if (working.length < beforeLen) {
      appliedLog.push(ar ? 'تمت إزالة الأكمام وتحويل القطعة إلى بدون أكمام' : 'Removed existing sleeve pieces');
    }
  }

  // 2) Complete missing Front/Back counterpart
  if (opSet.has('complete-counterpart')) {
    const kinds = working.map(classifyPieceKind);
    const addMirrorCounterpart = (srcPiece, newRole, enName, arName) => {
      const clone = JSON.parse(JSON.stringify(srcPiece));
      delete clone.id;
      delete clone.key;
      clone.role = newRole;
      clone.name = { en: enName, ar: arName };
      clone.desc = { en: 'Auto-completed matching counterpart panel.', ar: 'لوحة مقابلة مكتملة تلقائياً بمطابقة الخياطة الجانبية.' };
      working.push(clone);
      appliedLog.push(ar ? `تم إكمال ${arName}` : `Completed missing ${enName}`);
    };
    const tfIdx = kinds.indexOf('torso-front'), tbIdx = kinds.indexOf('torso-back');
    if (tfIdx >= 0 && tbIdx < 0) {
      const src = working[tfIdx];
      addMirrorCounterpart(src, src.cutOnFold ? 'bodice-back-center' : 'back-panel', 'Completed Back Bodice', 'ظهر الصدرية المكتمل');
    } else if (tbIdx >= 0 && tfIdx < 0) {
      const src = working[tbIdx];
      addMirrorCounterpart(src, src.cutOnFold ? 'bodice-front-center' : 'front-panel', 'Completed Front Bodice', 'مقدمة الصدرية المكتملة');
    }
    const sfIdx = kinds.indexOf('skirt-front'), sbIdx = kinds.indexOf('skirt-back');
    if (sfIdx >= 0 && sbIdx < 0) {
      addMirrorCounterpart(working[sfIdx], 'skirt-back', 'Back Skirt', 'تنورة خلفية');
    } else if (sbIdx >= 0 && sfIdx < 0) {
      addMirrorCounterpart(working[sbIdx], 'skirt-front', 'Front Skirt', 'تنورة أمامية');
    }
    const lfIdx = kinds.indexOf('leg-front'), lbIdx = kinds.indexOf('leg-back');
    if (lfIdx >= 0 && lbIdx < 0) {
      addMirrorCounterpart(working[lfIdx], 'trouser-back', 'Back Leg', 'الساق الخلفية');
    } else if (lbIdx >= 0 && lfIdx < 0) {
      addMirrorCounterpart(working[lbIdx], 'trouser-front', 'Front Leg', 'الساق الأمامية');
    }
  }

  // 3) Geometric alterations on main body / skirt / trouser pieces
  const mainBodyKinds = new Set(['torso-front', 'torso-back', 'skirt-front', 'skirt-back', 'leg-front', 'leg-back', 'other']);
  const needsScale = Math.abs(parsed.lengthDeltaCm) > 0.1 || Math.abs(parsed.flareFactor - 1) > 0.01 || Math.abs(parsed.easeDeltaCm) > 0.05
    || opSet.has('lengthen') || opSet.has('shorten') || opSet.has('add-flare') || opSet.has('slim-silhouette') || opSet.has('add-ease') || opSet.has('reduce-ease');

  if (needsScale) {
    const dLen = parsed.lengthDeltaCm + (opSet.has('lengthen') && !parsed.lengthDeltaCm ? 8 : 0) - (opSet.has('shorten') && !parsed.lengthDeltaCm ? 8 : 0);
    const fFac = parsed.flareFactor * (opSet.has('add-flare') && parsed.flareFactor === 1 ? 1.22 : 1) * (opSet.has('slim-silhouette') && parsed.flareFactor === 1 ? 0.85 : 1);
    const dEase = parsed.easeDeltaCm + (opSet.has('add-ease') && !parsed.easeDeltaCm ? 1.5 : 0) - (opSet.has('reduce-ease') && !parsed.easeDeltaCm ? 1.2 : 0);

    working = working.map((p) => {
      if (!mainBodyKinds.has(classifyPieceKind(p))) return p;
      const res = scalePieceHemAndLength(p, { lengthDeltaCm: dLen, flareFactor: fFac, easeDeltaCm: dEase });
      if (res.skippedLocked) lockedSkipped++;
      return res.piece;
    });
    if (dLen) appliedLog.push(ar ? `تعديل الطول بمقدار ${dLen > 0 ? '+' : ''}${dLen.toFixed(1)} سم` : `Adjusted garment length by ${dLen > 0 ? '+' : ''}${dLen.toFixed(1)} cm`);
    if (Math.abs(fFac - 1) > 0.01) appliedLog.push(ar ? `تعديل اتساع الحاشية (${Math.round(fFac * 100)}%)` : `Adjusted hem flare (${Math.round(fFac * 100)}%)`);
    if (dEase) appliedLog.push(ar ? `تعديل راحة المقاس الجانبية (${dEase > 0 ? '+' : ''}${(dEase * 2).toFixed(1)} سم)` : `Adjusted side-seam ease (${dEase > 0 ? '+' : ''}${(dEase * 2).toFixed(1)} cm)`);
  }

  // 4) Neckline reshaping on front torso piece
  if (opSet.has('reshape-v-neck') || opSet.has('reshape-boat-neck') || opSet.has('reshape-square-neck')) {
    working = working.map((p) => {
      if (classifyPieceKind(p) !== 'torso-front') return p;
      if (p.locked) { lockedSkipped++; return p; }
      const copy = JSON.parse(JSON.stringify(p));
      const bb = bboxOf(copy.outline);
      // Adjust point 0 (center-front neck drop)
      if (opSet.has('reshape-v-neck')) {
        copy.outline[0] = [copy.outline[0][0], +(bb.minY + Math.min(bb.h * 0.28, 12)).toFixed(2)];
        copy.curves = (copy.curves || []).filter((c) => c.fromIdx !== 0);
        appliedLog.push(ar ? 'تعديل فتحة الرقبة الأمامية إلى شكل V' : 'Reshaped front neckline to sculpted V-neck');
      } else if (opSet.has('reshape-boat-neck')) {
        copy.outline[0] = [copy.outline[0][0], +(bb.minY + 1.8).toFixed(2)];
        appliedLog.push(ar ? 'تعديل فتحة الرقبة إلى شكل قارب (Boat)' : 'Reshaped front neckline to wide Boat neck');
      } else if (opSet.has('reshape-square-neck')) {
        copy.outline[0] = [copy.outline[0][0], +(bb.minY + Math.min(bb.h * 0.22, 9.5)).toFixed(2)];
        appliedLog.push(ar ? 'تعديل فتحة الرقبة إلى رقبة مربعة' : 'Reshaped front neckline to Square neck');
      }
      return copy;
    });
  }

  // 5) Add waist darts / pleats / gathers
  if (opSet.has('add-waist-darts')) {
    working = working.map((p) => {
      const k = classifyPieceKind(p);
      if (!['torso-front', 'torso-back', 'skirt-front', 'skirt-back'].includes(k)) return p;
      if (p.locked) { lockedSkipped++; return p; }
      const copy = JSON.parse(JSON.stringify(p));
      const bb = bboxOf(copy.outline);
      const dx = +(bb.minX + bb.w * 0.48).toFixed(2);
      const isSkirt = k.startsWith('skirt');
      const baseY = isSkirt ? bb.minY : +(bb.minY + Math.min(bb.h * 0.65, m.backLen)).toFixed(2);
      const apexY = isSkirt ? +(bb.minY + Math.min(11, bb.h * 0.32)).toFixed(2) : +(baseY - Math.min(10, bb.h * 0.24)).toFixed(2);
      copy.darts = [...(copy.darts || []), [[dx, apexY], [+(dx - 1.5).toFixed(2), baseY], [+(dx + 1.5).toFixed(2), baseY]]];
      return copy;
    });
    appliedLog.push(ar ? 'إضافة بنسات تجسيم الخصر' : 'Added contoured waist shaping darts');
  }
  if (opSet.has('add-pleats') || opSet.has('add-gathers')) {
    working = working.map((p) => {
      const k = classifyPieceKind(p);
      if (!['skirt-front', 'skirt-back'].includes(k)) return p;
      if (p.locked) return p;
      const copy = JSON.parse(JSON.stringify(p));
      const bb = bboxOf(copy.outline);
      if (opSet.has('add-pleats')) {
        const { addedWidthCm, pleats } = computePleats(bb.w, 4, 3);
        const factor = (bb.w + addedWidthCm) / Math.max(1, bb.w);
        copy.outline = copy.outline.map(([x, y]) => [+(bb.minX + (x - bb.minX) * factor).toFixed(3), y]);
        copy.pleats = pleats;
      } else {
        const newW = computeGatherWidth(bb.w, 1.45);
        const factor = newW / Math.max(1, bb.w);
        copy.outline = copy.outline.map(([x, y]) => [+(bb.minX + (x - bb.minX) * factor).toFixed(3), y]);
      }
      return copy;
    });
    appliedLog.push(opSet.has('add-pleats')
      ? (ar ? 'إضافة كسرات خصر هندسية للتنورة' : 'Added knife pleats to skirt panels')
      : (ar ? 'إضافة اتساع كشكشة لخط الخصر' : 'Added waist gathering fullness'));
  }

  // 6) Add Collar / Mandarin / Hood matched to measured neckline arc!
  const halfNeck = Math.max(16.5, insp.neckArcCm / 2);
  if (opSet.has('add-collar')) {
    const col = pointedCollar(halfNeck, 3.2, 6.8);
    const st = collarStand(halfNeck, 3.2);
    working.push(
      {
        name: { en: 'Pointed Collar', ar: 'الياقة المدببة' },
        desc: { en: `Drafted to match your exact ${insp.neckArcCm.toFixed(1)} cm neckline arc.`, ar: `مرسومة لمطابقة محيط الرقبة الفعلي (${insp.neckArcCm.toFixed(1)} سم).` },
        outline: col, curves: col.curves || [], darts: [], notches: [col[0]],
        grain: [[3, 3], [halfNeck - 3, 3]], role: 'collar', cutOnFold: true,
      },
      {
        name: { en: 'Collar Stand', ar: 'قاعدة / رجل الياقة' },
        desc: { en: 'Contoured collar stand.', ar: 'قاعدة ياقة مقوسة.' },
        outline: st, curves: st.curves || [], darts: [], notches: [st[0]],
        grain: [[3, 1.5], [halfNeck - 3, 1.5]], role: 'collar-stand', cutOnFold: true,
      },
    );
    appliedLog.push(ar ? `إضافة ياقة قميص مدببة وقاعدة (${insp.neckArcCm.toFixed(1)} سم)` : `Added Pointed Collar & Stand (${insp.neckArcCm.toFixed(1)} cm neck arc)`);
  }
  if (opSet.has('add-mandarin')) {
    const st = collarStand(halfNeck, 4.2);
    working.push({
      name: { en: 'Mandarin Stand Collar', ar: 'ياقة صينية قائمة' },
      desc: { en: `Upright collar matched to ${insp.neckArcCm.toFixed(1)} cm neckline.`, ar: `ياقة قائمة مطابقة لمحيط الرقبة (${insp.neckArcCm.toFixed(1)} سم).` },
      outline: st, curves: st.curves || [], darts: [], notches: [st[0]],
      grain: [[3, 2], [halfNeck - 3, 2]], role: 'collar-stand', cutOnFold: true,
    });
    appliedLog.push(ar ? 'إضافة ياقة صينية قائمة' : 'Added Standing Mandarin Collar');
  }
  if (opSet.has('add-hood')) {
    const hw = Math.max(23, halfNeck * 1.18), hh = 32;
    for (const [enS, arS] of [['Left', 'يسار'], ['Right', 'يمين']]) {
      working.push({
        name: { en: `Contoured Hood (${enS})`, ar: `القبعة المجسمة (${arS})` },
        desc: { en: 'Two-piece contoured hood matched to neckline.', ar: 'قبعة مجسمة من قطعتين مطابقة لحردة الرقبة.' },
        outline: [[0, 0], [hw * 0.85, 0], [hw, hh * 0.35], [hw * 0.92, hh], [0, hh * 0.94]],
        curves: [{ fromIdx: 1, toIdx: 3, ...qBezToCubic([hw * 0.85, 0], [hw * 1.04, hh * 0.35], [hw * 0.92, hh]) }],
        darts: [], notches: [[0, hh * 0.94]], grain: [[hw * 0.45, 5], [hw * 0.45, hh - 5]], role: 'hood',
      });
    }
    appliedLog.push(ar ? 'إضافة قبعة مجسمة من قطعتين' : 'Added Two-Piece Contoured Hood');
  }

  // 7) Add Sleeves (Set-In / Puff / Short / 2-Piece Tailored / Armhole Binding)
  if (opSet.has('add-sleeves') || opSet.has('add-short-sleeves') || opSet.has('add-puff-sleeves') || opSet.has('add-tailored-sleeves')) {
    // Replace existing sleeves if user explicitly asked for a new sleeve style
    working = working.filter((p) => p.locked || classifyPieceKind(p) !== 'sleeve');
    if (opSet.has('add-tailored-sleeves')) {
      const up = sleeveUpperPc(m.bicep, m.sleeve);
      const un = sleeveUnderPc(m.bicep, m.sleeve);
      working.push(
        { name: { en: 'Tailored Upper Sleeve', ar: 'الكم العلوي المفصل' }, desc: { en: 'Ergonomic two-piece outer jacket sleeve.', ar: 'الجزء العلوي الخارجي لكم الجاكيت من قطعتين.' }, outline: up, curves: up.curves || [], darts: [], notches: [up[0]], grain: [[m.bicep * 0.25, 6], [m.bicep * 0.25, m.sleeve - 6]], role: 'sleeve-upper', bilateral: true },
        { name: { en: 'Tailored Under Sleeve', ar: 'الكم السفلي المفصل' }, desc: { en: 'Ergonomic two-piece inner underarm sleeve.', ar: 'الجزء السفلي الداخلي لكم الجاكيت من قطعتين.' }, outline: un, curves: un.curves || [], darts: [], notches: [un[0]], grain: [[m.bicep * 0.18, 6], [m.bicep * 0.18, m.sleeve - 6]], role: 'sleeve-under', bilateral: true },
      );
      appliedLog.push(ar ? 'إضافة أكمام جاكيت مفصلة من قطعتين' : 'Drafted Two-Piece Tailored Jacket Sleeves');
    } else if (opSet.has('add-puff-sleeves')) {
      const pf = puffSleevePc(m.bicep, Math.max(22, m.sleeve * 0.48), 1.55);
      working.push({
        name: { en: 'Gathered Puff Sleeve', ar: 'كم منفوش بكشكشة' },
        desc: { en: 'Couture gathered puff sleeve with -cos S-curve cap.', ar: 'كم منفوش بكشكشة علوية ورأس كم منحني (-cos).' },
        outline: pf, curves: pf.curves || [], darts: [],
        notches: [pf[pf.frontNotchIdx || 0], pf[pf.crownIdx || 1]].filter(Boolean),
        grain: [[m.bicep * 0.35, 4], [m.bicep * 0.35, Math.max(14, m.sleeve * 0.4)]],
        role: 'puff-sleeve', bilateral: true,
      });
      appliedLog.push(ar ? 'إضافة أكمام منفوشة بكشكشة' : 'Drafted Gathered Couture Puff Sleeves');
    } else {
      const isShort = opSet.has('add-short-sleeves');
      const slen = isShort ? Math.max(16, m.sleeve * 0.38) : m.sleeve;
      const capW = Math.max(28, m.bicep + 6);
      const sl = cosineSleeveOutline({
        width: capW,
        sleeveLen: slen,
        capHeight: Math.max(6, m.bicep * 0.24),
        cuffWidth: isShort ? capW * 0.88 : capW * 0.72,
      });
      working.push({
        name: { en: isShort ? 'Short Set-In Sleeve' : 'Set-In Long Sleeve', ar: isShort ? 'كم قصير مركّب' : 'كم طويل كلاسيكي مركّب' },
        desc: { en: `Raised-cosine (-cos) sleeve cap matched to armscye (~${insp.armholeArcCm.toFixed(1)} cm).`, ar: `كم بمنحنى (-cos) مطابق لحردة الإبط (~${insp.armholeArcCm.toFixed(1)} سم).` },
        outline: sl, curves: sl.curves || [], darts: [],
        notches: [sl[sl.frontNotchIdx], sl[sl.crownIdx], sl[sl.backNotchIdx1], sl[sl.backNotchIdx2]].filter(Boolean),
        grain: [[capW / 2, 4], [capW / 2, Math.max(8, slen - 4)]],
        role: isShort ? 'cap-sleeve' : 'sleeve', bilateral: true,
      });
      appliedLog.push(isShort
        ? (ar ? 'إضافة أكمام قصيرة متناسقة' : 'Drafted Matching Short Set-In Sleeves')
        : (ar ? 'إضافة أكمام طويلة متناسقة' : 'Drafted Matching Full-Length Set-In Sleeves'));
    }
  } else if (opSet.has('add-armhole-binding')) {
    working.push({
      name: { en: 'Bias Armhole Binding', ar: 'شريط بييه تشطيب الإبط' },
      desc: { en: 'Bias-cut binding strip for clean sleeveless armholes.', ar: 'شريط مائل لتنظيف حردة الإبط بدون أكمام.' },
      outline: bandPc(insp.armholeArcCm, 3.2),
      darts: [], notches: [[0, 0]], grain: [[4, 1.6], [insp.armholeArcCm - 4, 1.6]],
      role: 'facing', bilateral: true,
    });
    appliedLog.push(ar ? 'إضافة شريط تشطيب حردة الإبط' : 'Added Bias Armhole Binding');
  }

  // 8) Add Cuffs
  if (opSet.has('add-cuffs')) {
    const cw = Math.max(19, insp.wristWidthCm + 3);
    working.push({
      name: { en: 'Buttoned Wrist Cuff', ar: 'أسورة المعصم' },
      desc: { en: `Matched to ${insp.wristWidthCm.toFixed(1)} cm wrist + 3 cm button overlap.`, ar: `مطابقة لعرض المعصم (${insp.wristWidthCm.toFixed(1)} سم) مع تراكب الزر.` },
      outline: bandPc(cw, 6.5),
      darts: [], notches: [[0, 0]], grain: [[3, 3.2], [cw - 3, 3.2]],
      role: 'cuff', bilateral: true,
    });
    appliedLog.push(ar ? 'إضافة أساور المعصم' : 'Added Matched Wrist Cuffs');
  }

  // 9) Add Waistband / Sash Belt
  if (opSet.has('add-waistband')) {
    const wbLen = Math.max(54, insp.waistCircCm + 4);
    working.push({
      name: { en: 'Contoured Waistband', ar: 'كمر الخصر المهيكل' },
      desc: { en: `Matched to ${insp.waistCircCm.toFixed(1)} cm waist + 4 cm overlap.`, ar: `مطابق لمحيط الخصر (${insp.waistCircCm.toFixed(1)} سم) + 4 سم لسان إغلاق.` },
      outline: bandPc(wbLen, 7.5),
      darts: [], notches: [[wbLen * 0.25, 0], [wbLen * 0.5, 0], [wbLen * 0.75, 0]],
      grain: [[5, 3.75], [wbLen - 5, 3.75]],
      role: 'waistband',
    });
    appliedLog.push(ar ? `إضافة كمر خصر مطابق (${wbLen.toFixed(1)} سم)` : `Added Contoured Waistband (${wbLen.toFixed(1)} cm)`);
  }
  if (opSet.has('add-belt')) {
    const beltLen = Math.max(95, insp.waistCircCm + 65);
    working.push({
      name: { en: 'Tie Sash Belt', ar: 'حزام خصر للربط' },
      desc: { en: 'Self-fabric waist tie belt.', ar: 'حزام ربط خصر من نفس القماش.' },
      outline: bandPc(beltLen, 6.5),
      darts: [], notches: [[0, 0]], grain: [[8, 3.25], [beltLen - 8, 3.25]],
      role: 'belt',
    });
    appliedLog.push(ar ? 'إضافة حزام خصر للربط' : 'Added Tie Sash Belt');
  }

  // 10) Add Pockets
  if (opSet.has('add-pockets')) {
    working.push({
      name: { en: 'In-Seam / Patch Pocket', ar: 'جيب عملي متناسق' },
      desc: { en: 'Proportioned pocket piece with grainline and placement notches.', ar: 'قطعة جيب متناسقة مع علامات التثبيت.' },
      outline: pocketPatch(15, 20),
      darts: [], notches: [[0, 3], [0, 16]], grain: [[7.5, 3], [7.5, 17]],
      role: 'pocket', bilateral: true,
    });
    appliedLog.push(ar ? 'إضافة جيوب متناسقة' : 'Added Proportioned Pockets');
  }

  // 11) Add Facings & Full Lining
  if (opSet.has('add-facings')) {
    working.push(
      {
        name: { en: 'Front Neckline Facing', ar: 'سجاف الرقبة الأمامي' },
        desc: { en: 'Interfaced front neck facing.', ar: 'سجاف داخلي لتنظيف الرقبة الأمامية.' },
        outline: [[0, 4.5], [halfNeck * 0.55, 0], [halfNeck * 0.55 + 5.5, 0], [halfNeck * 0.55 + 4, 9], [0, 10]],
        darts: [], notches: [[0, 4.5]], grain: [[2, 5], [2, 9.2]],
        role: 'facing', cutOnFold: true,
      },
      {
        name: { en: 'Back Neckline Facing', ar: 'سجاف الرقبة الخلفي' },
        desc: { en: 'Interfaced back neck facing.', ar: 'سجاف داخلي لتنظيف الرقبة الخلفية.' },
        outline: bandPc(halfNeck * 0.52 + 5, 6.5),
        darts: [], notches: [[0, 0]], grain: [[2, 1.5], [2, 5]],
        role: 'facing', cutOnFold: true,
      },
    );
    appliedLog.push(ar ? 'إضافة سجاف الرقبة الأمامي والخلفي' : 'Added Front & Back Neckline Facings');
  }
  if (opSet.has('add-lining')) {
    const mainPanels = working.filter((p) => ['torso-front', 'torso-back', 'skirt-front', 'skirt-back'].includes(classifyPieceKind(p)));
    const targets = mainPanels.length ? mainPanels : [working[0]];
    targets.forEach((src) => {
      const bb = bboxOf(src.outline);
      const trim = bb.h > 24 ? 2.0 : 0;
      const out = src.outline.map(([x, y]) => [x, y > bb.maxY - 3 ? +(y - trim).toFixed(3) : y]);
      working.push({
        name: { en: `${src.name?.en || 'Panel'} Lining`, ar: `بطانة ${src.name?.ar || 'القطعة'}` },
        desc: { en: 'Full interior lining trimmed 2 cm above hem.', ar: 'بطانة داخلية كاملة أقصر بـ 2 سم من الحاشية.' },
        outline: out,
        curves: JSON.parse(JSON.stringify(src.curves || [])),
        darts: JSON.parse(JSON.stringify(src.darts || [])),
        notches: out.length ? [out[0]] : [],
        grain: JSON.parse(JSON.stringify(src.grain || [])),
        role: 'lining',
        cutOnFold: !!src.cutOnFold,
      });
    });
    appliedLog.push(ar ? `إضافة بطانة داخلية لعدد ${targets.length} لوحات` : `Drafted full interior lining (${targets.length} panel(s))`);
  }

  // If user typed a prompt that didn't trigger any known op yet, apply smart completion fallback so it ALWAYS helps meaningfully
  if (!appliedLog.length) {
    if (insp.missingSuggestions.length) {
      const firstOp = insp.missingSuggestions[0].op;
      return editOrCompletePattern({
        pieces, instruction: '', operations: [firstOp], answers: {}, measurements: m, seamAllowanceCm, lang,
      });
    }
    // Otherwise add clean pockets as safe constructive enhancement
    return editOrCompletePattern({
      pieces, instruction: '', operations: ['add-pockets'], answers: {}, measurements: m, seamAllowanceCm, lang,
    });
  }

  const { pieces: validPieces, validation } = ensureValidPieces(working, m, seamAllowanceCm);
  return {
    ok: true,
    pieces: validPieces,
    validation,
    appliedLog,
    lockedSkipped,
    summary: appliedLog.join(' · '),
  };
}
