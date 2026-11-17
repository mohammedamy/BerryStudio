import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMeasurements } from '../js/data.js';
import { PatternValidator } from '../js/validate.js';
import { offsetPoly } from '../js/geometry.js';
import { AIGen } from '../js/ai.js';
import {
  ATELIER_PRESETS,
  ensureValidPieces,
  detectExplicitPromptCues,
  generateClarifyingQuestions,
  applyClarificationAnswers,
  synthesizeCouturePattern,
  inspectExistingPattern,
  parseEditInstruction,
  editOrCompletePattern,
} from '../js/ai-atelier.js';

const MEAS_WOMEN = computeMeasurements({ category: 'women', size: 'M', standard: 'intl' });
const MEAS_MEN = computeMeasurements({ category: 'men', size: 'L', standard: 'intl' });
const MEAS_GIRLS = computeMeasurements({ category: 'girls', size: 'M', standard: 'intl', kids: '8-9' });
const MEAS_BOYS = computeMeasurements({ category: 'boys', size: 'M', standard: 'intl', kids: '8-9' });

function assertZeroValidatorFails(pieces, meas, contextLabel) {
  assert.ok(Array.isArray(pieces) && pieces.length >= 1, `${contextLabel}: expected >=1 piece`);
  const rep = PatternValidator.run(pieces, {
    bodyChestCm: meas.chest,
    seamAllowanceCm: 1.0,
    offsetPoly,
  });
  assert.equal(
    rep.summary.fail,
    0,
    `${contextLabel}: expected 0 validator fails, got ${rep.summary.fail}: ${JSON.stringify((rep.checks || []).filter((c) => c.status === 'fail'))}`
  );
}

test('all 12 ATELIER_PRESETS draft valid 0-fail patterns in both English and Arabic', () => {
  assert.equal(ATELIER_PRESETS.length, 12);
  for (const preset of ATELIER_PRESETS) {
    for (const lang of ['en', 'ar']) {
      const cat = preset.id === 'tailored-suit' || preset.id === 'cargo-trousers' ? 'men' : 'women';
      const meas = cat === 'men' ? MEAS_MEN : MEAS_WOMEN;
      const res = synthesizeCouturePattern({
        prompt: preset.prompt[lang],
        category: cat,
        measurements: meas,
        seamAllowanceCm: 1.0,
        lang,
      });
      assert.equal(res.validation.summary.fail, 0, `preset ${preset.id} (${lang}) had validator failures`);
      assertZeroValidatorFails(res.pieces, meas, `preset:${preset.id}:${lang}`);
    }
  }
});

test('all 17 garment families draft exact-match valid patterns across women/men/girls/boys', () => {
  const familyPrompts = [
    { expected: 'gown', prompt: 'floor-length evening gown with sweetheart neckline and princess seams', cat: 'women', meas: MEAS_WOMEN },
    { expected: 'dress', prompt: 'midi A-line dress with square neckline and puff sleeves', cat: 'women', meas: MEAS_WOMEN },
    { expected: 'jacket', prompt: 'tailored single-breasted blazer jacket with notched collar and two-piece sleeves', cat: 'women', meas: MEAS_WOMEN },
    { expected: 'coat', prompt: 'long winter trench coat with belt and welt pockets', cat: 'women', meas: MEAS_WOMEN },
    { expected: 'suit', prompt: 'classic tailored two-piece suit with jacket and trousers', cat: 'men', meas: MEAS_MEN },
    { expected: 'vest', prompt: 'tailored sleeveless waistcoat vest with V-neck and welt pockets', cat: 'men', meas: MEAS_MEN },
    { expected: 'hoodie', prompt: 'relaxed fleece hoodie sweatshirt with hood, kangaroo pocket, and ribbed cuffs', cat: 'boys', meas: MEAS_BOYS },
    { expected: 'jumpsuit', prompt: 'wide-leg tailored jumpsuit with waist belt and short sleeves', cat: 'women', meas: MEAS_WOMEN },
    { expected: 'romper', prompt: 'summer playsuit romper with short sleeves and patch pockets', cat: 'girls', meas: MEAS_GIRLS },
    { expected: 'shirt', prompt: 'classic dress shirt with collar stand, back yoke, front placket, and cuffs', cat: 'men', meas: MEAS_MEN },
    { expected: 'top', prompt: 'fitted knit top with boat neckline and three-quarter sleeves', cat: 'women', meas: MEAS_WOMEN },
    { expected: 'skirt', prompt: 'pleated midi skirt with contoured waistband and pockets', cat: 'women', meas: MEAS_WOMEN },
    { expected: 'trousers', prompt: 'tailored pleated trousers with waistband and side pockets', cat: 'men', meas: MEAS_MEN },
    { expected: 'shorts', prompt: 'tailored bermuda shorts with waistband and patch pockets', cat: 'boys', meas: MEAS_BOYS },
    { expected: 'robe', prompt: 'flowing modest abaya kaftan robe with wide kimono sleeves', cat: 'women', meas: MEAS_WOMEN },
    { expected: 'bodice', prompt: 'fitted sloper bodice block with waist and bust darts', cat: 'women', meas: MEAS_WOMEN },
    { expected: 'leotard', prompt: 'stretch gymnastics leotard with long sleeves and round neckline', cat: 'girls', meas: MEAS_GIRLS },
  ];

  for (const item of familyPrompts) {
    const res = synthesizeCouturePattern({
      prompt: item.prompt,
      category: item.cat,
      measurements: item.meas,
      seamAllowanceCm: 1.0,
      lang: 'en',
    });
    assert.equal(res.style.type, item.expected, `expected family ${item.expected} for "${item.prompt}", got ${res.style.type}`);
    assertZeroValidatorFails(res.pieces, item.meas, `family:${item.expected}`);
  }
});

test('Arabic couture prompts accurately resolve garment type, neckline, sleeves, and pass validation', () => {
  const arCases = [
    { prompt: 'فستان سهرة طويل بفتحة صدر قلب وأكمام منفوخة', expectType: 'gown', expectNeck: 'sweetheart' },
    { prompt: 'هودي رياضي بقبعة وجيب أمامي وأساور', expectType: 'hoodie' },
    { prompt: 'جمبسوت أنيق بأرجل واسعة وحزام خصر', expectType: 'jumpsuit' },
    { prompt: 'عباية واسعة بأكمام طويلة وحزام', expectType: 'robe' },
    { prompt: 'شورت صيفي بجيوب وحزام خصر', expectType: 'shorts' },
  ];
  for (const c of arCases) {
    const res = synthesizeCouturePattern({
      prompt: c.prompt,
      category: 'women',
      measurements: MEAS_WOMEN,
      lang: 'ar',
    });
    assert.equal(res.style.type, c.expectType, `AR prompt "${c.prompt}" -> ${res.style.type}`);
    if (c.expectNeck) assert.equal(res.style.neckline, c.expectNeck);
    assertZeroValidatorFails(res.pieces, MEAS_WOMEN, `ar:${c.expectType}`);
  }
});

test('generateClarifyingQuestions asks smart context-aware questions and skips already-specified cues', () => {
  // Vague prompt -> asks garmentType, fabric, neckline, sleeve, closure, finishes
  const vague = generateClarifyingQuestions({ prompt: 'something elegant', mode: 'create', lang: 'en' });
  assert.ok(vague.questions.some((q) => q.id === 'garmentType'), 'vague prompt must ask garmentType');
  assert.ok(vague.questions.some((q) => q.id === 'fabric'), 'vague prompt must ask fabric');
  assert.ok(vague.readinessPct <= 55);

  // Specific prompt -> skips garmentType, neckline, sleeve, fabric
  const specificPrompt = 'silk satin midi dress with sweetheart neckline, long puff sleeves, invisible back zipper, and full lining';
  const cues = detectExplicitPromptCues(specificPrompt);
  assert.equal(cues.hasType, true);
  assert.equal(cues.hasNeckline, true);
  assert.equal(cues.hasSleeve, true);
  assert.equal(cues.hasFabric, true);
  assert.equal(cues.hasClosure, true);

  const specific = generateClarifyingQuestions({ prompt: specificPrompt, mode: 'create', lang: 'en' });
  assert.ok(!specific.questions.some((q) => q.id === 'garmentType'), 'explicit dress prompt must not re-ask garmentType');
  assert.ok(!specific.questions.some((q) => q.id === 'neckline'), 'explicit sweetheart prompt must not re-ask neckline');
  assert.ok(!specific.questions.some((q) => q.id === 'sleeve'), 'explicit sleeve prompt must not re-ask sleeve');
  assert.ok(specific.readinessPct >= 85, `expected high readiness, got ${specific.readinessPct}`);
});

test('applyClarificationAnswers overrides style and synthesizes requested interior/finishing pieces', () => {
  const answers = {
    garmentType: 'jacket',
    fabric: 'woven',
    neckline: 'collar',
    sleeve: 'long',
    closure: 'button',
    finishes: 'full-couture',
  };
  const res = synthesizeCouturePattern({
    prompt: 'custom bespoke piece',
    category: 'women',
    measurements: MEAS_WOMEN,
    answers,
    customNote: 'add waist belt',
    lang: 'en',
  });
  assert.equal(res.style.type, 'jacket');
  const keys = res.pieces.map((p) => p.key);
  assert.ok(keys.some((k) => /pocket/i.test(k)), 'expected pockets from full-couture answer');
  assert.ok(keys.some((k) => /lining/i.test(k)), 'expected lining pieces from full-couture answer');
  assert.ok(keys.some((k) => /belt/i.test(k)), 'expected belt from customNote');
  assertZeroValidatorFails(res.pieces, MEAS_WOMEN, 'clarified-jacket');
});

test('inspectExistingPattern + editOrCompletePattern completes missing pieces and alters live pattern geometry', () => {
  // Start with a single front bodice piece only (incomplete pattern)
  const baseBodice = AIGen.build({ type: 'bodice', neckline: 'round', sleeveLenF: 0, lengthF: 0.55, flareF: 1.0 }, MEAS_WOMEN).pieces;
  const frontOnly = baseBodice.filter((p) => /front/i.test(p.key || p.name?.en || '')).slice(0, 1);
  assert.equal(frontOnly.length, 1);

  const insp = inspectExistingPattern(frontOnly, MEAS_WOMEN, 'en');
  assert.equal(insp.hasPieces, true);
  assert.equal(insp.hasFront, true);
  assert.equal(insp.hasBack, false);
  assert.equal(insp.hasSleeve, false);
  assert.ok(insp.missingSuggestions.some((s) => s.op === 'complete-counterpart'));
  assert.ok(insp.missingSuggestions.some((s) => s.op === 'add-sleeves'));

  // Complete counterpart + add sleeves + collar + pockets + lining + lengthen by 8 cm via natural instruction
  const origHeight = Math.max(...frontOnly[0].outline.map((pt) => pt[1])) - Math.min(...frontOnly[0].outline.map((pt) => pt[1]));
  const edited = editOrCompletePattern({
    pieces: frontOnly,
    instruction: 'complete missing back, add long sleeves with cuffs, add shirt collar, add pockets and lining, lengthen by 8 cm',
    measurements: MEAS_WOMEN,
    seamAllowanceCm: 1.0,
    lang: 'en',
  });

  assert.equal(edited.ok, true);
  assert.ok(edited.pieces.length >= 6, `expected completed garment pieces, got ${edited.pieces.length}`);
  const editedFront = edited.pieces[0];
  const newHeight = Math.max(...editedFront.outline.map((pt) => pt[1])) - Math.min(...editedFront.outline.map((pt) => pt[1]));
  assert.ok(Math.abs((newHeight - origHeight) - 8) < 1.2, `expected ~+8cm length delta, got ${(newHeight - origHeight).toFixed(2)}cm`);
  assertZeroValidatorFails(edited.pieces, MEAS_WOMEN, 'completed-and-edited-pattern');
});

test('editOrCompletePattern respects locked pieces during alterations and supports Arabic edit instructions', () => {
  const skirtPieces = AIGen.build({ type: 'skirt', lengthF: 0.95, flareF: 1.15, sleeveLenF: 0 }, MEAS_WOMEN).pieces;
  const lockedFirst = skirtPieces.map((p, idx) => (idx === 0 ? { ...p, locked: true } : { ...p, locked: false }));
  const beforeLockedOutline = JSON.stringify(lockedFirst[0].outline);

  const parsedAr = parseEditInstruction('تقصير بمقدار 5 سم وإضافة كسرات وحزام خصر وجيوب');
  assert.ok(parsedAr.ops.includes('shorten'));
  assert.equal(parsedAr.cm, 5);
  assert.ok(parsedAr.ops.includes('add-pleats'));
  assert.ok(parsedAr.ops.includes('add-waistband'));
  assert.ok(parsedAr.ops.includes('add-pockets'));

  // 1) Locking Front Skirt during shorten skips Front Skirt and shortens unlocked Back Skirt
  const resShorten = editOrCompletePattern({
    pieces: lockedFirst,
    instruction: 'تقصير بمقدار 5 سم',
    measurements: MEAS_WOMEN,
    lang: 'ar',
  });
  assert.equal(resShorten.ok, true);
  assert.equal(resShorten.lockedSkipped, 1, 'locked piece must be reported as skipped during shorten');
  assert.equal(JSON.stringify(resShorten.pieces[0].outline), beforeLockedOutline, 'locked piece geometry must stay untouched');

  // 2) Locking Front Skirt during Arabic waist-dart + pocket addition keeps side-seam parity intact with 0 validator failures
  const resValid = editOrCompletePattern({
    pieces: lockedFirst,
    instruction: 'إضافة بنسات خصر وجيوب',
    measurements: MEAS_WOMEN,
    lang: 'ar',
  });
  assert.equal(resValid.ok, true);
  assert.equal(resValid.lockedSkipped, 1, 'locked Front Skirt must be skipped when adding waist darts');
  assert.equal(JSON.stringify(resValid.pieces[0].outline), beforeLockedOutline, 'locked Front Skirt outline must stay untouched');
  assert.equal((resValid.pieces[0].darts || []).length, 0, 'locked Front Skirt must not receive new darts');
  assert.ok((resValid.pieces[1].darts || []).length >= 1, 'unlocked Back Skirt should receive waist dart');
  assert.ok(resValid.pieces.some((p) => p.role === 'pocket'), 'pocket piece should be added');
  assertZeroValidatorFails(resValid.pieces, MEAS_WOMEN, 'arabic-locked-edit');
});

test('ensureValidPieces self-heals unclosed or degenerate piece metadata so validation passes', () => {
  const raw = [
    {
      key: 'custom_panel',
      name: { en: 'Custom Panel' },
      role: 'bodice',
      outline: [[0, 0], [26, 0], [26, 42], [0, 42], [0, 0]], // duplicate closing point
    },
  ];
  const healed = ensureValidPieces(raw, MEAS_WOMEN, 1.0);
  assert.equal(healed.validation.summary.fail, 0);
  assert.ok(Array.isArray(healed.pieces[0].grain) && healed.pieces[0].grain.length === 2);
  assert.ok(healed.pieces[0].name.ar, 'Arabic bilingual piece name should be populated');
});
