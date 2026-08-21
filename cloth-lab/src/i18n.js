/* ============================================================
   cloth-lab — EN/AR strings + RTL.

   cloth-lab has no language switcher of its own — `lang` always comes from
   the bridge payload (js/app.js's buildClothLabPayload() -> App.jsx's
   `pattern.lang`), mirroring whichever language the root BerryStudio app is
   currently in. Standalone/dev preview (no `pattern` prop) defaults to 'en'.

   Terminology is deliberately reused verbatim from the root app's own
   js/i18n.js wherever the same concept appears there (categories,
   measurement labels) so a bilingual user never sees two different Arabic
   words for the same thing depending on which tab they're on.
   ============================================================ */

export const STRINGS = {
  en: {
    title: 'BerryStudio 3D — Cloth Lab',
    // category switcher (standalone-only — embedded mode defers to the
    // root app's own switcher, see Header.jsx's own header comment)
    cat_women: 'Women', cat_men: 'Men', cat_girls: 'Girls', cat_boys: 'Boys',
    // debug-view switcher
    dv_off: 'Off', dv_off_title: 'No pattern-piece debug overlay',
    dv_pieces: 'Pieces', dv_pieces_title: 'Per-piece flat-color static placement (no physics)',
    dv_weld: 'Weld', dv_weld_title: 'Weld-degree overlay: grey=unwelded, green=seam, red=multi-piece corner',
    dv_cloth: 'Cloth', dv_cloth_title: 'Live GPU cloth simulation: structural+bend+self-collision, body collision, grab-and-drag',
    dv_seams: 'Seams', dv_seams_title: 'Interactively author seam pairings for an imported pattern, in 3D',
    // AvatarPanel
    skinTone: 'Skin Tone',
    pose: 'Pose',
    pose_standing: 'Standing', pose_apose: 'A-pose', pose_tpose: 'T-pose',
    pose_contrapposto: 'Contrapposto', pose_seated: 'Seated', pose_walk: 'Walk',
    // FabricPanel
    fabric: 'Fabric',
    // WP-35: opt-in high-quality tier — true dihedral-angle bend
    // (default tier's behavior/performance are completely unchanged).
    simQuality: 'Simulation quality',
    simQualityDefault: 'Default',
    simQualityHigh: 'High (dihedral bend)',
    simQualityHighHint: 'Real angle-based fold constraint instead of an approximate distance spring — sharper, more accurate drape on dense garments. Costs more per frame; rebuilds the simulation when toggled.',
    // MeasurementPanel — reuses the root app's own m_* measurement labels below
    bodyMeasurements: 'Body Measurements (cm)',
    m_chest: 'Chest / Bust', m_waist: 'Waist', m_hips: 'Hips', m_shoulder: 'Shoulder width',
    m_backLen: 'Back length', m_sleeve: 'Sleeve length', m_neck: 'Neck', m_bicep: 'Bicep',
    m_inseam: 'Inseam', m_thigh: 'Thigh', m_height: 'Height',
    // ExportPanel
    export: 'Export',
    exportGLB: 'Export GLB', exportOBJ: 'Export OBJ', exportUSDZ: 'Export USDZ',
    exportTurntablePNGs: 'Turntable PNGs', recordTurntableVideo: 'Record Turntable Video',
    working: 'Working…',
    exportFailed: '{key} failed: {msg}',
    // SeamEditorPanel
    seamAuthoring: 'Seam Authoring',
    seamAuthoringHint: 'Click a start point then an end point on a piece to mark an edge (walking forward through its outline), then do the same on a second piece to pair them into a seam. Anything you never mark stays a free edge (like a hem or neckline).',
    startPointPicked: 'Start point picked on {piece} — click an end point on the SAME piece to finish this edge (click the start point again to cancel).',
    edgeN: 'Edge {n}',
    pickTwoMore: 'Pick 2 points on another piece to pair with…',
    reverse: 'Reverse',
    createSeam: 'Create Seam',
    clearSelection: 'Clear selection',
    seamsCount: 'Seams ({n})',
    noneYet: 'None yet.',
    rev: 'rev',
    removeSeam: 'Remove seam',
    simulateGarment: 'Simulate This Garment',
    // App.jsx Workspace
    garment: 'Garment:',
    garmentFromDesign: 'From your BerryStudio design',
    garmentCustom: 'Custom (seam-authored)',
    garmentDefault: 'T-shirt (default)',
    reset: 'Reset',
    piecesUsedSkipped: '{used} of {total} pieces used — skipped: {list}',
    // GLBAvatar.jsx / BodyAvatar.jsx pose-support + load-error messages (WP-9 issue #3)
    poseWarnVRM: 'This avatar uses the VRM format — pose selection has no effect, and simulated cloth assumes an arms-down pose, so sleeves and fitted areas may visibly float or clip.',
    poseWarnNoRig: 'No recognized body rig (Mixamo/Ready Player Me) was found in this avatar — pose selection has no effect, and simulated cloth assumes an arms-down pose, so sleeves and fitted areas may visibly float or clip.',
    poseWarnSeatedLeg: 'This avatar’s leg rig wasn’t recognized, so "Seated" only relaxes the arms — the legs stay standing.',
    poseWarnWalkNoClip: 'This avatar has no embedded animation clip — the "Walk" pose renders standing instead.',
    avatarLoadError: 'This custom avatar failed to load — showing the standard body instead.',
  },
  ar: {
    title: 'بيري ستوديو ٣D — معمل القماش',
    cat_women: 'حريمي', cat_men: 'رجالي', cat_girls: 'بناتي', cat_boys: 'ولادي',
    dv_off: 'إيقاف', dv_off_title: 'بدون طبقة تصحيح لقطع الباترون',
    dv_pieces: 'القطع', dv_pieces_title: 'عرض ثابت بلون واحد لكل قطعة (بدون محاكاة فيزيائية)',
    dv_weld: 'اللحام', dv_weld_title: 'طبقة درجة اللحام: رمادي = غير ملحوم، أخضر = غرزة، أحمر = زاوية بين عدة قطع',
    dv_cloth: 'القماش', dv_cloth_title: 'محاكاة قماش حية عبر GPU: بنية + انحناء + تصادم ذاتي، تصادم مع الجسم، سحب وإفلات',
    dv_seams: 'الغرز', dv_seams_title: 'إنشاء تزاوج الغرز تفاعليًا لباترون مستورد، في بيئة ثلاثية الأبعاد',
    skinTone: 'لون البشرة',
    pose: 'الوضعية',
    pose_standing: 'واقفة', pose_apose: 'وضعية A', pose_tpose: 'وضعية T',
    pose_contrapposto: 'وضعية مائلة', pose_seated: 'جالسة', pose_walk: 'المشي',
    fabric: 'القماش',
    simQuality: 'جودة المحاكاة',
    simQualityDefault: 'افتراضي',
    simQualityHigh: 'عالية (ثني بزاوية حقيقية)',
    simQualityHighHint: 'قيد ثني قائم على الزاوية الفعلية بدلاً من نابض مسافة تقريبي — طيّات أدق وأكثر واقعية للملابس الكثيفة. تكلفة أعلى لكل إطار؛ يعيد بناء المحاكاة عند التبديل.',
    bodyMeasurements: 'قياسات الجسم (سم)',
    m_chest: 'الصدر', m_waist: 'الوسط', m_hips: 'الأرداف', m_shoulder: 'عرض الكتف',
    m_backLen: 'طول الظهر', m_sleeve: 'طول الكم', m_neck: 'الرقبة', m_bicep: 'محيط الذراع',
    m_inseam: 'طول الساق الداخلي', m_thigh: 'الفخذ', m_height: 'الطول',
    export: 'تصدير',
    exportGLB: 'تصدير GLB', exportOBJ: 'تصدير OBJ', exportUSDZ: 'تصدير USDZ',
    exportTurntablePNGs: 'صور دوران (PNG)', recordTurntableVideo: 'تسجيل فيديو الدوران',
    working: 'جارٍ التنفيذ…',
    exportFailed: 'فشل {key}: {msg}',
    seamAuthoring: 'إنشاء الغرز',
    seamAuthoringHint: 'اضغط على نقطة بداية ثم نقطة نهاية على إحدى القطع لتحديد حافة (بالسير للأمام عبر محيطها)، ثم كرّر ذلك على قطعة ثانية لتزاوجهما في غرزة واحدة. أي حافة لا تُحدَّدها تبقى حافة حرة (كالكفة أو خط الرقبة).',
    startPointPicked: 'تم اختيار نقطة البداية على {piece} — اضغط على نقطة نهاية في نفس القطعة لإتمام هذه الحافة (أو اضغط على نقطة البداية مجددًا للإلغاء).',
    edgeN: 'الحافة {n}',
    pickTwoMore: 'اختر نقطتين على قطعة أخرى لتزاوجها معها…',
    reverse: 'عكس',
    createSeam: 'إنشاء غرزة',
    clearSelection: 'مسح التحديد',
    seamsCount: 'الغرز ({n})',
    noneYet: 'لا يوجد بعد.',
    rev: 'عكس',
    removeSeam: 'إزالة الغرزة',
    simulateGarment: 'محاكاة هذا التصميم',
    garment: 'التصميم:',
    garmentFromDesign: 'من تصميمك في بيري ستوديو',
    garmentCustom: 'مخصّص (غرز مُنشأة يدويًا)',
    garmentDefault: 'تيشيرت (افتراضي)',
    reset: 'إعادة تعيين',
    piecesUsedSkipped: 'استُخدم {used} من {total} قطعة — تم تخطي: {list}',
    poseWarnVRM: 'هذا الشكل بصيغة VRM — لا تأثير لاختيار الوضعية، والمحاكاة تفترض وضع الذراعين للأسفل، لذا قد تطفو الأكمام والمناطق الضيقة أو تتداخل مع الجسم.',
    poseWarnNoRig: 'لم يُعثر على هيكل عظمي معروف (Mixamo/Ready Player Me) في هذا الشكل — لا تأثير لاختيار الوضعية، والمحاكاة تفترض وضع الذراعين للأسفل، لذا قد تطفو الأكمام والمناطق الضيقة أو تتداخل مع الجسم.',
    poseWarnSeatedLeg: 'لم يُتعرّف على هيكل الساقين لهذا الشكل، لذا وضعية "جالسة" تُرخي الذراعين فقط — وتبقى الساقان في وضع الوقوف.',
    poseWarnWalkNoClip: 'لا يحتوي هذا الشكل على مقطع حركة مضمّن — لذا تُعرض وضعية "المشي" كوضعية وقوف بدلاً من ذلك.',
    avatarLoadError: 'تعذّر تحميل هذا الشكل المخصّص — يتم عرض الجسم الافتراضي بدلاً منه.',
  },
}

export function t(lang, key, vars) {
  const dict = STRINGS[lang] || STRINGS.en
  let s = dict[key] ?? STRINGS.en[key] ?? key
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v)
  return s
}

export const dirFor = (lang) => (lang === 'ar' ? 'rtl' : 'ltr')
