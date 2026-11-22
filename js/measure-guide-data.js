/* ============================================================
   BerryStudio 3D Measurement Teaching Studio — Data & Surface Math
   Pure, DOM-free, Three.js-agnostic specifications and 3D anatomical
   path builders shared by js/measure-guide-3d.js and node unit tests.
   ============================================================ */

export const MEAS_GUIDE_KEYS = Object.freeze([
  "chest",
  "waist",
  "hips",
  "shoulder",
  "backLen",
  "sleeve",
  "neck",
  "bicep",
  "inseam",
  "thigh",
  "height",
]);

export const MEAS_GUIDE_SPECS = Object.freeze({
  chest: Object.freeze({
    index: 1,
    key: "chest",
    kind: "circumference",
    camera: Object.freeze({ azimuth: 0.52, elevation: 0.14, distanceFactor: 0.44, targetOffsetY: 0.01, targetXScale: 0 }),
    title: Object.freeze({ en: "Chest / Bust", ar: "محيط الصدر" }),
    anatomy: Object.freeze({
      en: "Horizontal perimeter across the fullest point of the bust/chest, under the arms, and straight across the shoulder blades.",
      ar: "المحيط الأفقي المار بأعلى بروز في الصدر، ثم أسفل الإبطين مباشرة، وبشكل مستقيم على لوحَي الكتف في الظهر.",
    }),
    steps: Object.freeze({
      en: [
        "Stand tall looking straight ahead with arms hanging loosely at both sides and normal relaxed breathing.",
        "Wrap the tape horizontally under the armpits, across the fullest projection of the bust/pectorals, and flat across the back.",
        "Bridge smoothly across the center front cleavage without pulling into the sternum, then read where zero meets.",
      ],
      ar: [
        "قف منتصبًا ناظرًا للأمام مع استرخاء الذراعين على الجانبين والتنفس بشكل طبيعي دون شد أو نفخ.",
        "لف شريط القياس أفقيًا أسفل الإبطين مرورًا بأعلى بروز للصدر ثم باستقامة تامة على الظهر.",
        "اجعل الشريط مستويًا وممدودًا بلطف عبر منتصف الصدر دون الغوص للداخل، ثم اقرأ القياس عند التقابل.",
      ],
    }),
    easeTip: Object.freeze({
      en: "Keep 1 finger neatly under the tape and check in a mirror that the tape stays strictly parallel to the floor front and back.",
      ar: "اترك إصبعًا واحدًا برفق أسفل الشريط وتأكد أمام المرآة أن الشريط موازٍ تمامًا للأرض من الأمام والخلف.",
    }),
    avoid: Object.freeze({
      en: "Do not let the tape droop down across the back blades or inhale to expand the ribcage.",
      ar: "تجنب هبوط الشريط نحو أسفل الظهر أو أخذ نفس عميق يوسّع القفص الصدري أثناء القراءة.",
    }),
    landmarkLabels: Object.freeze([
      Object.freeze({ id: "apex", en: "Bust / Chest Apex", ar: "أعلى بروز للصدر" }),
      Object.freeze({ id: "backLevel", en: "Center Back Level", ar: "استواء منتصف الظهر" }),
    ]),
  }),

  waist: Object.freeze({
    index: 2,
    key: "waist",
    kind: "circumference",
    camera: Object.freeze({ azimuth: 0.45, elevation: 0.10, distanceFactor: 0.42, targetOffsetY: 0, targetXScale: 0 }),
    title: Object.freeze({ en: "Natural Waist", ar: "محيط الوسط (الخصر)" }),
    anatomy: Object.freeze({
      en: "Natural horizontal crease between the bottom of the ribcage and the top of the pelvic hip bone (iliac crest).",
      ar: "أضيق منطقة طبيعية في الجذع تقع بين أسفل القفص الصدري وأعلى عظمة الحوض.",
    }),
    steps: Object.freeze({
      en: [
        "Bend gently to one side to spot the natural crease above your hip bone — that indentation is your true natural waist.",
        "Stand upright again with relaxed abdominal muscles (do not suck the stomach in) and tie or align a guide cord if helpful.",
        "Wrap the tape horizontally around this narrowest hollow and read at the end of a gentle exhale.",
      ],
      ar: [
        "امل جانبًا قليلًا لتحديد نقطة الانثناء الطبيعية فوق عظمة الحوض؛ فهذه الثنية هي الخصر الطبيعي الحقيقي.",
        "عد للوقوف باستقامة مع إرخاء عضلات البطن تمامًا دون شفطها للداخل.",
        "لف شريط القياس أفقيًا حول أضيق محيط للخصر واقرأ الرقم عند نهاية زفير هادئ.",
      ],
    }),
    easeTip: Object.freeze({
      en: "Snug against the torso with room for 1 flat finger — never cinched like a belt or loose enough to slide down.",
      ar: "ملاصق للجسم بنعومة مع اتساع لإصبع واحد مسطح؛ لا تضغطه كالحزام ولا تتركه يرتخي للأسفل.",
    }),
    avoid: Object.freeze({
      en: "Do not measure down at lower jeans waistband level unless drafting low-rise pants separately.",
      ar: "لا تقس عند مستوى خصر البنطال المنخفض بل عند الانحناء الطبيعي الأعلى للجذع.",
    }),
    landmarkLabels: Object.freeze([
      Object.freeze({ id: "sideCrease", en: "Side Waist Crease", ar: "ثنية الخصر الجانبية" }),
      Object.freeze({ id: "frontWaist", en: "Center Front Waist", ar: "منتصف الخصر الأمامي" }),
    ]),
  }),

  hips: Object.freeze({
    index: 3,
    key: "hips",
    kind: "circumference",
    camera: Object.freeze({ azimuth: 2.35, elevation: 0.08, distanceFactor: 0.46, targetOffsetY: 0, targetXScale: 0 }),
    title: Object.freeze({ en: "Full Hips / Seat", ar: "محيط الأرداف (الورك الكامل)" }),
    anatomy: Object.freeze({
      en: "Horizontal circumference around the fullest projection of the buttocks and trochanter hip curve.",
      ar: "أكبر محيط أفقي يمر بأعلى بروز للمؤخرة ومنحنى عظمتَي الحوض الجانبيتين.",
    }),
    steps: Object.freeze({
      en: [
        "Stand with feet together (heels gently touching) so hip muscles stay neutral and even.",
        "Locate the widest point from a side mirror view — typically 18–22 cm below the natural waist on adults.",
        "Wrap horizontally over both hips and the fullest seat projection, keeping the tape straight over any pocket/cleft contour.",
      ],
      ar: [
        "قف مع ضم القدمين برفق حتى تبقى عضلات الفخذ والأرداف متوازنة ومسترخية.",
        "حدد أعرض نقطة من المنظور الجانبي في المرآة (غالباً أسفل الخصر بحوالي ١٨–٢٢ سم للبالغين).",
        "لف الشريط أفقيًا حول أعرض جزء من المؤخرة والفخذ العلوي دون أن ينزلق لأعلى من الخلف.",
      ],
    }),
    easeTip: Object.freeze({
      en: "Pass smoothly across both glute peaks without pressing into the center back curve; check levelness from the side.",
      ar: "امرر الشريط بنعومة فوق بروزَي الأرداف دون ضغطه للداخل وتأكد من استوائه أفقيًا من الجانب.",
    }),
    avoid: Object.freeze({
      en: "Do not measure high around the pelvic bone ridge instead of the lower, fuller seat projection.",
      ar: "تجنب القياس أعلى عظمة الحوض حيث يكون المحيط أضيق من البروز الكامل للأرداف.",
    }),
    landmarkLabels: Object.freeze([
      Object.freeze({ id: "gluteCrest", en: "Fullest Seat Crest", ar: "أعلى بروز للأرداف" }),
      Object.freeze({ id: "hipSide", en: "Trochanter Side", ar: "أعرض نقطة جانبية للورك" }),
    ]),
  }),

  shoulder: Object.freeze({
    index: 4,
    key: "shoulder",
    kind: "surface-arc",
    camera: Object.freeze({ azimuth: Math.PI - 0.18, elevation: 0.20, distanceFactor: 0.44, targetOffsetY: -0.02, targetXScale: 0 }),
    title: Object.freeze({ en: "Shoulder Width", ar: "عرض الكتفين" }),
    anatomy: Object.freeze({
      en: "Back-side arc spanning from one lateral shoulder bone tip (acromion), up gently across the C7 base of the neck, to the opposite tip.",
      ar: "قوس الظهر العلوي الممتد من طرف عظمة الكتف اليمنى مرورًا برأس فقرة العنق البارزة (C7) حتى طرف عظمة الكتف اليسرى.",
    }),
    steps: Object.freeze({
      en: [
        "Rotate to view the back — find the small bony corner on top of each outer shoulder where the arm drops vertically.",
        "Hold zero at the left acromion corner while keeping both shoulders relaxed (neither hunched nor pulled back).",
        "Drape the tape gently up over the C7 vertebra bump at the nape of the neck and straight across to the right acromion corner.",
      ],
      ar: [
        "استدر نحو الظهر وحدد الحافة العظمية الصغيرة أعلى كل كتف حيث يبدأ الذراع بالنزول عموديًا.",
        "ثبت بداية الشريط عند طرف عظمة الكتف الأولى مع إبقاء الكتفين مسترخيين دون رفعهما أو شدهما للخلف.",
        "امرر الشريط عبر قاعدة العنق الخلفية (الفقرة السابعة البارزة C7) وصولًا إلى طرف عظمة الكتف المقابلة.",
      ],
    }),
    easeTip: Object.freeze({
      en: "Follow the slight natural curve across the upper back via C7 — a straight ruler chord across air under-measures woven garments.",
      ar: "اتبع الانحناء الطبيعي الخفيف لأعلى الظهر عبر فقرة العنق C7 بدل شده في الهواء بخط مستقيم.",
    }),
    avoid: Object.freeze({
      en: "Do not run too far down onto the rounded deltoid arm cap — stop strictly at the bony acromion joint.",
      ar: "لا تمد الشريط إلى استدارة عضلة أعلى الذراع؛ توقف بدقة عند الحافة العظمية لمفصل الكتف.",
    }),
    landmarkLabels: Object.freeze([
      Object.freeze({ id: "acromionR", en: "Right Acromion Tip", ar: "طرف عظمة الكتف الأيمن" }),
      Object.freeze({ id: "c7", en: "C7 Neck Vertebra", ar: "فقرة قاعدة العنق C7" }),
      Object.freeze({ id: "acromionL", en: "Left Acromion Tip", ar: "طرف عظمة الكتف الأيسر" }),
    ]),
  }),

  backLen: Object.freeze({
    index: 5,
    key: "backLen",
    kind: "surface-arc",
    camera: Object.freeze({ azimuth: Math.PI + 0.35, elevation: 0.12, distanceFactor: 0.48, targetOffsetY: 0, targetXScale: 0 }),
    title: Object.freeze({ en: "Back Waist Length", ar: "طول الظهر (حتى الوسط)" }),
    anatomy: Object.freeze({
      en: "Vertical contour down the center spine from the prominent C7 cervical vertebra at the nape to the natural waist cord.",
      ar: "الخط الطولي على امتداد العمود الفقري من الفقرة السابعة البارزة بأسفل الرقبة من الخلف حتى خط الوسط الطبيعي.",
    }),
    steps: Object.freeze({
      en: [
        "Tilt the head slightly forward to feel the most prominent bone bump at the base of the neck (C7 nape), then lift head upright.",
        "Anchor zero firmly at C7 and trace downward directly over the spine following the upper back and gentle lumbar curve.",
        "Stop squarely at the center back natural waist level marked in Step 2.",
      ],
      ar: [
        "أحنِ الرأس للأمام قليلًا لتحسّس العظمة الأشد بروزًا بأسفل مؤخرة الرقبة (C7)، ثم ارفع الرأس باستقامة.",
        "ثبّت بداية الشريط عند تلك الفقرة وتتبّع الانحناء الطبيعي للظهر والعمود الفقري نحو الأسفل.",
        "توقف بدقة عند تقاطع الشريط مع خط الخصر الطبيعي المحدد في الخطوة ٢ من الخلف.",
      ],
    }),
    easeTip: Object.freeze({
      en: "Let the tape kiss the spinal hollow lightly rather than bridging tightly past the lower back curve.",
      ar: "اترك الشريط يلامس انحناء أسفل الظهر بلطف ليعطي الطول الحقيقي لباترون الظهر.",
    }),
    avoid: Object.freeze({
      en: "Do not start higher up on the hairline of the neck — hairline sits 2–4 cm above true collar seam C7.",
      ar: "لا تبدأ القياس من منبت الشعر في الرقبة بل من الفقرة العظمية C7 التي تلتقي عندها الياقة.",
    }),
    landmarkLabels: Object.freeze([
      Object.freeze({ id: "c7Top", en: "C7 Nape Bone", ar: "فقرة C7 أسفل الرقبة" }),
      Object.freeze({ id: "backWaist", en: "Center Back Waist", ar: "منتصف الوسط من الخلف" }),
    ]),
  }),

  sleeve: Object.freeze({
    index: 6,
    key: "sleeve",
    kind: "arm-path",
    camera: Object.freeze({ azimuth: -Math.PI * 0.46, elevation: 0.10, distanceFactor: 0.58, targetOffsetY: 0, targetXScale: 0.85 }),
    title: Object.freeze({ en: "Sleeve Length", ar: "طول الكم (الذراع)" }),
    anatomy: Object.freeze({
      en: "3-point lateral arm contour starting at the acromion shoulder tip, curving outside the elbow olecranon, to the ulnar wrist bone.",
      ar: "المسار الجانبي الثلاثي من طرف عظمة الكتف مرورًا بخارج الكوع (المرفق) وحتى عظمة الرسغ.",
    }),
    steps: Object.freeze({
      en: [
        "Stand naturally with the arm slightly bent at the elbow (about 10–15°, never locked rigidly straight).",
        "Place zero on the outer acromion shoulder tip and guide the tape down along the outer deltoid to the point of the elbow.",
        "Pivot cleanly around the elbow bone and continue along the outer forearm down to the knobby outer wrist styloid bone.",
      ],
      ar: [
        "قف باسترخاء مع ثني خفيف للذراع عند الكوع (١٠–١٥ درجة) دون فرد الذراع بشكل متيبس.",
        "ثبت الصفر عند طرف عظمة الكتف الخارجية وتوجه للأسفل محاذيًا للعضد حتى رأس عظمة المرفق.",
        "اتبع انحناء المرفق ثم اكمل محاذيًا للساعد من الخارج وصولًا إلى عظمة الرسغ الجانبية البارزة.",
      ],
    }),
    easeTip: Object.freeze({
      en: "Always include that slight elbow bend so finished long sleeves never ride above the wrist when reaching forward.",
      ar: "حافظ على الانثناء البسيط للكوع دائمًا كي لا يقصر الكم عن المعصم عند تحريك الذراع للأمام.",
    }),
    avoid: Object.freeze({
      en: "Do not drop vertically straight to the floor bypassing the outer elbow bend, or extend past the wrist onto the thumb joint.",
      ar: "تجنب الشد المستقيم دون المرور بالكوع أو التمديد نحو باطن الكف بعد عظمة المعصم.",
    }),
    landmarkLabels: Object.freeze([
      Object.freeze({ id: "armAcromion", en: "Shoulder Tip", ar: "رأس الكتف" }),
      Object.freeze({ id: "armElbow", en: "Outer Elbow", ar: "مفصل المرفق" }),
      Object.freeze({ id: "armWrist", en: "Wrist Bone", ar: "عظمة الرسغ" }),
    ]),
  }),

  neck: Object.freeze({
    index: 7,
    key: "neck",
    kind: "circumference",
    camera: Object.freeze({ azimuth: 0.42, elevation: 0.18, distanceFactor: 0.30, targetOffsetY: 0, targetXScale: 0 }),
    title: Object.freeze({ en: "Neck Base", ar: "محيط الرقبة (قاعدة العنق)" }),
    anatomy: Object.freeze({
      en: "Sloped anatomical collar ring tracing C7 behind, around the lateral trapezius bases, and dipping to the suprasternal notch in front.",
      ar: "حلقة ياقة مائلة طبيعيًا تمر بفقرة C7 من الخلف وجانبَي قاعدة العنق ثم تنخفض قليلًا إلى نقرة النحر بالأمام.",
    }),
    steps: Object.freeze({
      en: [
        "Locate the base of the neck where a shirt collar naturally rests — higher at the back C7 and sloping smoothly downward at the front.",
        "Drape the tape gently around the collar base without pulling horizontally high up onto the throat.",
        "Slip 1 index finger inside at the front collarbone hollow before reading.",
      ],
      ar: [
        "حدد قاعدة العنق الطبيعية حيث تستقر الياقة: مرتفعة قليلًا عند الفقرة C7 خلفًا ومائلة لأسفل نحو نقرة الترقوة أمامًا.",
        "لف شريط القياس بنعومة على هذه القاعدة المائلة دون رفعه أفقيًا لأعلى الحنجرة.",
        "اترك مسافة إصبع واحد داخل الشريط عند تجويف الترقوة الأمامي قبل قراءة المقاس.",
      ],
    }),
    easeTip: Object.freeze({
      en: "Follow the angled collar bed rather than a rigid horizontal ring so necklines sit flat without choking or gaping.",
      ar: "اتبع ميل قاعدة الرقبة الطبيعي لا الخط الأفقي المستقيم حتى تستقر فتحة الرقبة بانسيابية مريحة.",
    }),
    avoid: Object.freeze({
      en: "Do not measure high around the middle throat or pull tight against the windpipe.",
      ar: "لا تقس في منتصف الرقبة العلوي ولا تشد الشريط على الحنجرة.",
    }),
    landmarkLabels: Object.freeze([
      Object.freeze({ id: "neckBack", en: "C7 Collar Back", ar: "مؤخرة قاعدة العنق" }),
      Object.freeze({ id: "neckNotch", en: "Collarbone Hollow", ar: "تجويف الترقوة الأمامي" }),
    ]),
  }),

  bicep: Object.freeze({
    index: 8,
    key: "bicep",
    kind: "circumference",
    camera: Object.freeze({ azimuth: 0.78, elevation: 0.12, distanceFactor: 0.36, targetOffsetY: 0, targetXScale: 0.92 }),
    title: Object.freeze({ en: "Upper Arm / Bicep", ar: "محيط أعلى الذراع (العضد)" }),
    anatomy: Object.freeze({
      en: "Perpendicular circumference around the fullest mid-belly of the upper arm halfway between acromion and elbow.",
      ar: "المحيط العمودي على محور الذراع حول أضخم نقطة في عضلة أعلى الذراع (بين الكتف والمرفق).",
    }),
    steps: Object.freeze({
      en: [
        "Let the measured arm hang relaxed straight down at your side — keep the muscle soft, not flexed.",
        "Wrap the tape around the widest part of the upper arm roughly midway between shoulder and elbow.",
        "Check that the ring sits perpendicular (at right angles) to the upper arm bone axis, with 1 finger of breathing room.",
      ],
      ar: [
        "أرخِ الذراع المراد قياسه للأسفل بجانب الجسم مع ترك العضلة مسترخية تمامًا دون شد أو ثني.",
        "لف الشريط حول أعرض منطقة في منتصف أعلى الذراع تقريبًا.",
        "احرص على أن يكون الشريط عموديًا على محور عظمة العضد مع سماح إصبع واحد خفيف.",
      ],
    }),
    easeTip: Object.freeze({
      en: "Keep perpendicular to the tilted arm angle — a slanted oval over-inflates sleeve cap width.",
      ar: "ابقِ الشريط عموديًا على ميل الذراع الفعلي كي لا يعطي قراءة زائدة لعرض رأس الكم.",
    }),
    avoid: Object.freeze({
      en: "Do not flex the bicep muscle or measure diagonally up into the armpit crease.",
      ar: "تجنب شد العضلة أو إمالة الشريط بشكل مائل داخل ثنية الإبط.",
    }),
    landmarkLabels: Object.freeze([
      Object.freeze({ id: "bicepPeak", en: "Mid-Bicep Belly", ar: "منتصف بروز العضد" }),
    ]),
  }),

  inseam: Object.freeze({
    index: 9,
    key: "inseam",
    kind: "vertical-span",
    camera: Object.freeze({ azimuth: 0.24, elevation: 0.04, distanceFactor: 0.66, targetOffsetY: 0, targetXScale: 0.15 }),
    title: Object.freeze({ en: "Inseam", ar: "طول الساق الداخلي" }),
    anatomy: Object.freeze({
      en: "Vertical inner-leg span from the highest crotch/groin point straight down along the medial leg seam to the inner ankle bone.",
      ar: "المسافة العمودية على طول الساق من الداخل؛ من أعلى نقطة بالحجر مباشرة نحو الأسفل حتى عظمة الكاحل الداخلية.",
    }),
    steps: Object.freeze({
      en: [
        "Stand barefoot with feet hip-width apart (15–20 cm) in upright posture with weight balanced on both feet.",
        "Anchor zero cleanly at the uppermost crotch point where front and back trouser seams meet (using a book spine gently leveled helps solo).",
        "Drop the tape vertically along the inside of the leg to the prominent inner ankle bone (medial malleolus) — or floor for full-length trousers.",
      ],
      ar: [
        "قف حافي القدمين مع تباعد خفيف وموزون للقدمين وتوزيع الوزن بالتساوي عليهما.",
        "ثبّت بداية الشريط عند أعلى نقطة في الحجر بين الساقين (الاستعانة بمسطرة أو كتاب أفقي تساعد في تحديد المستوى بدقة).",
        "مد الشريط عموديًا للأسفل بمحاذاة الساق الداخلية وصولًا إلى عظمة الكاحل الداخلية البارزة.",
      ],
    }),
    easeTip: Object.freeze({
      en: "Stand upright with an assistant or wall aid — bending forward shifts the hip and shortens your reading by 2–4 cm.",
      ar: "ابقَ منتصب القامة تمامًا؛ الانحناء للأمام لقراءة الشريط بنفسك يقلّص القياس بنحو ٢–٤ سم.",
    }),
    avoid: Object.freeze({
      en: "Do not curve along the inner thigh contour or pull diagonally out toward the big toe.",
      ar: "تجنب لف الشريط على استدارة الفخذ الداخلي أو إمالته قطريًا نحو مقدمة القدم.",
    }),
    landmarkLabels: Object.freeze([
      Object.freeze({ id: "crotchApex", en: "Crotch Seam Apex", ar: "أعلى نقطة بالحجر" }),
      Object.freeze({ id: "innerAnkle", en: "Inner Ankle Bone", ar: "عظمة الكاحل الداخلية" }),
    ]),
  }),

  thigh: Object.freeze({
    index: 10,
    key: "thigh",
    kind: "circumference",
    camera: Object.freeze({ azimuth: 0.50, elevation: 0.08, distanceFactor: 0.44, targetOffsetY: 0, targetXScale: 0.65 }),
    title: Object.freeze({ en: "Upper Thigh", ar: "محيط الفخذ العلوي" }),
    anatomy: Object.freeze({
      en: "Horizontal circumference circling the fullest upper thigh approximately 2.5 cm below the crotch/gluteal crease.",
      ar: "المحيط الأفقي حول أضخم جزء من أعلى الفخذ أسفل ثنية الحجر والمؤخرة بحوالي ٢.٥ سم.",
    }),
    steps: Object.freeze({
      en: [
        "Stand tall with weight distributed evenly over both legs and feet slightly parted.",
        "Position the tape horizontally right below the gluteal fold at the fullest upper-thigh girth.",
        "Keep the loop level around both front quadriceps and back hamstring without digging into skin.",
      ],
      ar: [
        "قف باستقامة مع توزيع الوزن بالتساوي على الساقين وتباعد خفيف بينهما.",
        "ضع الشريط أفقيًا أسفل ثنية الأرداف مباشرة عند أضخم نقطة في الفخذ العلوي.",
        "اجعل الحلقة مستوية من الأمام والخلف حول عضلة الفخذ دون ضغط زائد على الجلد.",
      ],
    }),
    easeTip: Object.freeze({
      en: "Keep parallel to the floor and allow 1 comfortable finger inside for stride ease on woven trousers.",
      ar: "حافظ على استوائه الموازي للأرض مع ترك سماح إصبع واحد لحركة المشي في البناطيل المنسوجة.",
    }),
    avoid: Object.freeze({
      en: "Do not measure mid-thigh near the knee — trouser block thigh ease depends on the highest girth.",
      ar: "لا تقس في منتصف الفخذ قرب الركبة لأن باترون البنطال يعتمد على أعرض نقطة بأعلى الفخذ.",
    }),
    landmarkLabels: Object.freeze([
      Object.freeze({ id: "thighFullest", en: "Fullest Upper Thigh", ar: "أعرض جزء بأعلى الفخذ" }),
    ]),
  }),

  height: Object.freeze({
    index: 11,
    key: "height",
    kind: "vertical-span",
    camera: Object.freeze({ azimuth: 0.34, elevation: 0.06, distanceFactor: 1.20, targetOffsetY: 0, targetXScale: 0 }),
    title: Object.freeze({ en: "Total Height", ar: "الطول الكلي للجسم" }),
    anatomy: Object.freeze({
      en: "True vertical stature measured perpendicular to the floor from flat barefoot soles up to the highest skull crown.",
      ar: "القامة العمودية الكاملة عموديًا على الأرض من باطن القدمين الحافيتين حتى أعلى قمة في الرأس.",
    }),
    steps: Object.freeze({
      en: [
        "Stand barefoot with heels, calves, glutes, shoulder blades, and back of head lightly resting near a flat vertical wall.",
        "Look horizontally forward (ear canal and lower eye socket level) without lifting your chin or heels.",
        "Rest a flat right-angle square firmly on the hair crown touching the vertical stadiometer line and read to the floor.",
      ],
      ar: [
        "قف حافي القدمين مع ملامسة الكعبين والأرداف والكتفين ومؤخرة الرأس بخفة لحائط مستوٍ عمودي.",
        "انظر للأمام أفقيًا دون رفع الذقن أو الكعبين عن الأرض.",
        "أنزل مسطرة أفقية بزاوية قائمة حتى تلامس قمة الرأس واقرأ المسافة العمودية حتى سطح الأرض.",
      ],
    }),
    easeTip: Object.freeze({
      en: "Compress lofty hair lightly onto the skull crown — tall hairstyles add false vertical proportion errors.",
      ar: "اضغط التسريحة العالية برفق حتى تلامس قمة الرأس الحقيقية للحصول على طول سليم للباترون.",
    }),
    avoid: Object.freeze({
      en: "Do not measure wearing heels or shoes, or curve the tape inward against the waist and head.",
      ar: "تجنب القياس بالحذاء أو ثني الشريط باتجاه الخصر والرقبة بدل إبقائه خطًا عموديًا مستقيمًا.",
    }),
    landmarkLabels: Object.freeze([
      Object.freeze({ id: "crownTop", en: "Crown of Head", ar: "أعلى قمة الرأس" }),
      Object.freeze({ id: "floorSole", en: "Barefoot Floor Level", ar: "مستوى باطن القدمين" }),
    ]),
  }),
});

function dist3(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

function normalize3(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function sub3(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function add3(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale3(v, s) {
  return [v[0] * s, v[1] * s, v[2] * s];
}

export function polylineLengthCm(points, closed = false) {
  if (!Array.isArray(points) || points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist3(points[i - 1], points[i]);
  if (closed) total += dist3(points[points.length - 1], points[0]);
  return Math.round(total * 1000) / 10;
}

/**
 * Prevents cloth measuring loops from sinking into anatomical valleys
 * (anterior bust cleavage on chest; posterior gluteal cleft on hips) by
 * bridging concave XZ points across the tangent chord connecting left/right peaks.
 */
export function applyConvexBridge(points, mode = "front") {
  if (!Array.isArray(points) || points.length < 6) return points.map((p) => p.slice());
  const out = points.map((p) => p.slice());
  const isFront = mode === "front";
  const signZ = isFront ? 1 : -1;

  let leftIdx = -1;
  let rightIdx = -1;
  let bestLeftZ = -Infinity;
  let bestRightZ = -Infinity;

  for (let i = 0; i < out.length; i++) {
    const [x, , z] = out[i];
    const projZ = z * signZ;
    if (projZ <= 0) continue;
    if (x < -0.005 && projZ > bestLeftZ) {
      bestLeftZ = projZ;
      leftIdx = i;
    } else if (x > 0.005 && projZ > bestRightZ) {
      bestRightZ = projZ;
      rightIdx = i;
    }
  }

  if (leftIdx < 0 || rightIdx < 0) return out;
  const a = out[leftIdx];
  const b = out[rightIdx];
  const xMin = Math.min(a[0], b[0]);
  const xMax = Math.max(a[0], b[0]);
  if (xMax - xMin < 1e-4) return out;

  for (let i = 0; i < out.length; i++) {
    const [x, y, z] = out[i];
    if (z * signZ <= 0 || x <= xMin || x >= xMax) continue;
    const u = (x - a[0]) / (b[0] - a[0]);
    const chordZ = a[2] + (b[2] - a[2]) * u;
    const chordY = a[1] + (b[1] - a[1]) * u;
    if (z * signZ < chordZ * signZ) {
      out[i] = [x, chordY, chordZ];
    }
  }
  return out;
}

/**
 * Samples a closed loop around `center` in the plane spanned by unit axes
 * `(axisU, axisV)` by raycasting outward from `center` against the baked
 * body surface (`hits[0]`), falling back smoothly to `radiusHint` ellipse.
 */
export function sampleCircumferenceLoop(center, axisU, axisV, radiusHint, raycastFn, opts = {}) {
  const segments = opts.segments || 64;
  const clearance = opts.clearance ?? 0.0042;
  const maxDist = opts.maxDist ?? Math.max(radiusHint * 1.85, 0.28);
  const yDipFn = opts.yDipFn || null;
  const bridgeMode = opts.bridgeMode || null;

  const basePts = [];
  for (let i = 0; i < segments; i++) {
    const theta = (2 * Math.PI * i) / segments;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const dir = normalize3([
      axisU[0] * cosT + axisV[0] * sinT,
      axisU[1] * cosT + axisV[1] * sinT + (yDipFn ? yDipFn(theta) : 0),
      axisU[2] * cosT + axisV[2] * sinT,
    ]);
    const origin = [
      center[0] + dir[0] * 0.004,
      center[1] + dir[1] * 0.004,
      center[2] + dir[2] * 0.004,
    ];
    let pt = null;
    if (typeof raycastFn === "function") {
      const hit = raycastFn(origin, dir, maxDist, opts.near ?? 0.002);
      if (hit && Array.isArray(hit.point) && hit.point.every(Number.isFinite)) {
        pt = hit.point;
      }
    }
    if (!pt) {
      const rx = opts.fallbackRadiusU ?? radiusHint;
      const rz = opts.fallbackRadiusV ?? radiusHint;
      pt = [
        center[0] + axisU[0] * cosT * rx + axisV[0] * sinT * rz,
        center[1] + axisU[1] * cosT * rx + axisV[1] * sinT * rz + (yDipFn ? yDipFn(theta) * rx : 0),
        center[2] + axisU[2] * cosT * rx + axisV[2] * sinT * rz,
      ];
    }
    basePts.push(pt);
  }

  const bridged = bridgeMode ? applyConvexBridge(basePts, bridgeMode) : basePts;
  const normals = bridged.map((p) => {
    const rad = sub3(p, center);
    // Keep normal mostly in measurement plane
    return normalize3(rad);
  });
  const lifted = bridged.map((p, idx) => add3(p, scale3(normals[idx], clearance)));
  return {
    points: lifted,
    normals,
    closed: true,
    arcLengthCm: polylineLengthCm(lifted, true),
  };
}

function projectSurfaceSweep(probeOrigins, probeTargetOffset, fallbackPts, raycastFn, clearance = 0.0045) {
  const pts = [];
  const normals = [];
  for (let i = 0; i < probeOrigins.length; i++) {
    const orig = probeOrigins[i];
    const dir = normalize3(probeTargetOffset);
    let pt = null;
    let nrm = scale3(dir, -1);
    if (typeof raycastFn === "function") {
      const hit = raycastFn(orig, dir, 0.75, 0.01);
      if (hit && Array.isArray(hit.point) && hit.point.every(Number.isFinite)) {
        pt = hit.point;
        if (Array.isArray(hit.normal) && hit.normal.every(Number.isFinite)) {
          nrm = hit.normal[0] * dir[0] + hit.normal[1] * dir[1] + hit.normal[2] * dir[2] > 0
            ? scale3(hit.normal, -1)
            : normalize3(hit.normal);
        }
      }
    }
    if (!pt) pt = fallbackPts[i];
    pts.push(add3(pt, scale3(nrm, clearance)));
    normals.push(nrm);
  }
  return { points: pts, normals };
}

function lerp3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function radialOutwardOnAxis(center, axisDir, radialDir, raycastFn, maxDist = 0.25, fallbackR = 0.04, clearance = 0.004) {
  // Ensure radialDir is orthogonal to axisDir
  const dot = radialDir[0] * axisDir[0] + radialDir[1] * axisDir[1] + radialDir[2] * axisDir[2];
  const ortho = normalize3([
    radialDir[0] - axisDir[0] * dot,
    radialDir[1] - axisDir[1] * dot,
    radialDir[2] - axisDir[2] * dot,
  ]);
  if (typeof raycastFn === "function") {
    const hit = raycastFn(add3(center, scale3(ortho, 0.003)), ortho, maxDist, 0.002);
    if (hit && Array.isArray(hit.point) && hit.point.every(Number.isFinite)) {
      return {
        point: add3(hit.point, scale3(ortho, clearance)),
        normal: ortho,
      };
    }
  }
  return {
    point: add3(center, scale3(ortho, fallbackR + clearance)),
    normal: ortho,
  };
}

/**
 * Computes all 11 3D tape paths, landmark pins, witness bars, level planes, and
 * camera focus targets for the active mannequin geometry.
 */
export function buildMeasurementPaths(dims, landmarks, posedJoints = {}, bodyBounds = null, raycastFn = null) {
  const { H, hipY, span, shoulderY, shoulderHalf, chestR, waistR, hipR, neckR, upperR, thighR, female } = dims;
  const crownY = bodyBounds && Number.isFinite(bodyBounds.maxY) ? bodyBounds.maxY : H;
  const floorY = bodyBounds && Number.isFinite(bodyBounds.minY) ? bodyBounds.minY : 0;

  const waistY = landmarks?.waistY ?? (hipY + span * 0.44);
  const chestY = hipY + span * (female ? 0.715 : 0.735);
  const hipMeasureY = hipY - span * 0.018;
  const neckBaseY = landmarks?.neckBaseY ?? (shoulderY + span * 0.02);
  const ankleY = landmarks?.ankleY ?? Math.max(0.054, H * 0.047);

  const axisZ = [0, 0, 1];
  const axisX = [1, 0, 0];

  const getJoint = (key, fallback) => {
    const v = posedJoints?.[key];
    return Array.isArray(v) && v.length === 3 && v.every(Number.isFinite) ? v : fallback;
  };

  const armLPos = getJoint("arm1", [shoulderHalf * 0.82, shoulderY - span * 0.035, 0]);
  const elbowLPos = getJoint("elbow1", [armLPos[0] + 0.04, armLPos[1] - dims.armLen * 0.48, -0.01]);
  const armRPos = getJoint("arm-1", [-shoulderHalf * 0.82, shoulderY - span * 0.035, 0]);
  const elbowRPos = getJoint("elbow-1", [armRPos[0] - 0.04, armRPos[1] - dims.armLen * 0.48, -0.01]);
  const handRPos = getJoint("hand-1", [elbowRPos[0] - 0.03, elbowRPos[1] - dims.armLen * 0.46, 0.04]);
  const legLPos = getJoint("leg1", [hipR * (female ? 0.45 : 0.47), hipY - span * 0.04, 0]);
  const kneeLPos = getJoint("knee1", [legLPos[0], landmarks?.kneeY ?? (hipY * 0.52), 0]);

  const zScale = female ? 0.72 : 0.78;
  const paths = {};

  // 1. Chest / Bust
  const chestLoop = sampleCircumferenceLoop(
    [0, chestY, 0],
    axisZ,
    axisX,
    chestR * (female ? 1.04 : 1.05),
    raycastFn,
    {
      segments: 64,
      clearance: 0.0044,
      maxDist: Math.max(chestR * 1.48, 0.22),
      fallbackRadiusU: chestR * zScale * 1.08,
      fallbackRadiusV: chestR * 1.02,
      bridgeMode: "front",
    },
  );
  const chestFrontPt = chestLoop.points.reduce((best, p) => (p[2] > best[2] ? p : best), chestLoop.points[0]);
  const chestLeftPt = chestLoop.points.reduce((best, p) => (p[0] < best[0] ? p : best), chestLoop.points[0]);
  const chestBackPt = chestLoop.points.reduce((best, p) => (p[2] < best[2] ? p : best), chestLoop.points[0]);
  paths.chest = {
    ...chestLoop,
    kind: "circumference",
    levelPlane: { y: chestY, rx: chestR * 1.24, rz: chestR * zScale * 1.28 },
    pinAnchor: [chestLeftPt[0] - 0.012, chestLeftPt[1], chestLeftPt[2]],
    cameraTarget: [0, chestY, 0],
    landmarkPins: [
      { id: "apex", position: chestFrontPt, en: MEAS_GUIDE_SPECS.chest.landmarkLabels[0].en, ar: MEAS_GUIDE_SPECS.chest.landmarkLabels[0].ar },
      { id: "backLevel", position: chestBackPt, en: MEAS_GUIDE_SPECS.chest.landmarkLabels[1].en, ar: MEAS_GUIDE_SPECS.chest.landmarkLabels[1].ar },
    ],
  };

  // 2. Natural Waist
  const waistLoop = sampleCircumferenceLoop(
    [0, waistY, 0],
    axisZ,
    axisX,
    waistR,
    raycastFn,
    {
      segments: 64,
      clearance: 0.0042,
      maxDist: Math.max(waistR * 1.48, 0.19),
      fallbackRadiusU: waistR * zScale,
      fallbackRadiusV: waistR,
    },
  );
  const waistSidePt = waistLoop.points.reduce((best, p) => (p[0] < best[0] ? p : best), waistLoop.points[0]);
  const waistFrontPt = waistLoop.points.reduce((best, p) => (p[2] > best[2] ? p : best), waistLoop.points[0]);
  paths.waist = {
    ...waistLoop,
    kind: "circumference",
    levelPlane: { y: waistY, rx: waistR * 1.24, rz: waistR * zScale * 1.24 },
    pinAnchor: [waistSidePt[0] - 0.012, waistSidePt[1], waistSidePt[2]],
    cameraTarget: [0, waistY, 0],
    landmarkPins: [
      { id: "sideCrease", position: waistSidePt, en: MEAS_GUIDE_SPECS.waist.landmarkLabels[0].en, ar: MEAS_GUIDE_SPECS.waist.landmarkLabels[0].ar },
      { id: "frontWaist", position: waistFrontPt, en: MEAS_GUIDE_SPECS.waist.landmarkLabels[1].en, ar: MEAS_GUIDE_SPECS.waist.landmarkLabels[1].ar },
    ],
  };

  // 3. Full Hips
  const hipsLoop = sampleCircumferenceLoop(
    [0, hipMeasureY, 0],
    axisZ,
    axisX,
    hipR,
    raycastFn,
    {
      segments: 64,
      clearance: 0.0044,
      maxDist: Math.max(hipR * 1.45, 0.24),
      fallbackRadiusU: hipR * zScale * 1.08,
      fallbackRadiusV: hipR,
      bridgeMode: "back",
    },
  );
  const hipSidePt = hipsLoop.points.reduce((best, p) => (p[0] < best[0] ? p : best), hipsLoop.points[0]);
  const hipBackPt = hipsLoop.points.reduce((best, p) => (p[2] < best[2] ? p : best), hipsLoop.points[0]);
  paths.hips = {
    ...hipsLoop,
    kind: "circumference",
    levelPlane: { y: hipMeasureY, rx: hipR * 1.24, rz: hipR * zScale * 1.32 },
    pinAnchor: [hipSidePt[0] - 0.012, hipSidePt[1], hipSidePt[2]],
    cameraTarget: [0, hipMeasureY, 0],
    landmarkPins: [
      { id: "gluteCrest", position: hipBackPt, en: MEAS_GUIDE_SPECS.hips.landmarkLabels[0].en, ar: MEAS_GUIDE_SPECS.hips.landmarkLabels[0].ar },
      { id: "hipSide", position: hipSidePt, en: MEAS_GUIDE_SPECS.hips.landmarkLabels[1].en, ar: MEAS_GUIDE_SPECS.hips.landmarkLabels[1].ar },
    ],
  };

  // 4. Shoulder Width (Back view: R Acromion -> C7 Nape -> L Acromion)
  const shoulderSamples = 25;
  const shoulderProbes = [];
  const shoulderFallbacks = [];
  const shHalfSpan = shoulderHalf * 0.96;
  for (let i = 0; i < shoulderSamples; i++) {
    const u = -1 + (2 * i) / (shoulderSamples - 1); // -1..+1
    const arch = 1 - u * u;
    const x = u * shHalfSpan;
    const y = lerp3([0, shoulderY - span * 0.012, 0], [0, neckBaseY - span * 0.015, 0], arch)[1];
    shoulderProbes.push([x, y + 0.04, -0.34]);
    shoulderFallbacks.push([x, y, -chestR * zScale * 0.55 - neckR * 0.45 * arch]);
  }
  const shoulderProj = projectSurfaceSweep(shoulderProbes, [0, -0.22, 1], shoulderFallbacks, raycastFn, 0.005);
  const midShoulderIdx = (shoulderSamples - 1) >> 1;
  const shPinR = shoulderProj.points[0];
  const shPinC7 = shoulderProj.points[midShoulderIdx];
  const shPinL = shoulderProj.points[shoulderSamples - 1];
  paths.shoulder = {
    points: shoulderProj.points,
    normals: shoulderProj.normals,
    closed: false,
    kind: "surface-arc",
    arcLengthCm: polylineLengthCm(shoulderProj.points, false),
    witnessLines: [
      [add3(shPinR, [0, 0.018, 0]), add3(shPinR, [0, -0.018, 0])],
      [add3(shPinL, [0, 0.018, 0]), add3(shPinL, [0, -0.018, 0])],
    ],
    pinAnchor: [shPinR[0] - 0.014, shPinR[1] + 0.018, shPinR[2]],
    cameraTarget: [0, (shoulderY + neckBaseY) * 0.5, -neckR * 0.3],
    landmarkPins: [
      { id: "acromionR", position: shPinR, en: MEAS_GUIDE_SPECS.shoulder.landmarkLabels[0].en, ar: MEAS_GUIDE_SPECS.shoulder.landmarkLabels[0].ar },
      { id: "c7", position: shPinC7, en: MEAS_GUIDE_SPECS.shoulder.landmarkLabels[1].en, ar: MEAS_GUIDE_SPECS.shoulder.landmarkLabels[1].ar },
      { id: "acromionL", position: shPinL, en: MEAS_GUIDE_SPECS.shoulder.landmarkLabels[2].en, ar: MEAS_GUIDE_SPECS.shoulder.landmarkLabels[2].ar },
    ],
  };

  // 5. Back Waist Length (C7 down spine curve to center back waist)
  const backSamples = 24;
  const backProbes = [];
  const backFallbacks = [];
  const backTopY = neckBaseY + 0.004;
  for (let i = 0; i < backSamples; i++) {
    const t = i / (backSamples - 1);
    const y = backTopY + (waistY - backTopY) * t;
    backProbes.push([0, y, -0.40]);
    backFallbacks.push([0, y, -chestR * zScale * 0.85]);
  }
  const backProj = projectSurfaceSweep(backProbes, [0, 0, 1], backFallbacks, raycastFn, 0.005);
  const backTopPt = backProj.points[0];
  const backBotPt = backProj.points[backProj.points.length - 1];
  const backMidPt = backProj.points[backSamples >> 1];
  paths.backLen = {
    points: backProj.points,
    normals: backProj.normals,
    closed: false,
    kind: "surface-arc",
    arcLengthCm: polylineLengthCm(backProj.points, false),
    witnessLines: [
      [add3(backTopPt, [-0.028, 0, 0]), add3(backTopPt, [0.028, 0, 0])],
      [add3(backBotPt, [-0.028, 0, 0]), add3(backBotPt, [0.028, 0, 0])],
    ],
    pinAnchor: [backMidPt[0] + 0.022, backMidPt[1], backMidPt[2] - 0.012],
    cameraTarget: [0, (backTopY + waistY) * 0.5, -waistR * 0.4],
    landmarkPins: [
      { id: "c7Top", position: backTopPt, en: MEAS_GUIDE_SPECS.backLen.landmarkLabels[0].en, ar: MEAS_GUIDE_SPECS.backLen.landmarkLabels[0].ar },
      { id: "backWaist", position: backBotPt, en: MEAS_GUIDE_SPECS.backLen.landmarkLabels[1].en, ar: MEAS_GUIDE_SPECS.backLen.landmarkLabels[1].ar },
    ],
  };

  // 6. Sleeve / Arm Length (Outer -X arm: Shoulder Acromion -> Elbow -> Wrist)
  const upperArmDirR = normalize3(sub3(elbowRPos, armRPos));
  const forearmDirR = normalize3(sub3(handRPos, elbowRPos));
  const acromionTopR = radialOutwardOnAxis(
    [armRPos[0] - 0.01, shoulderY, 0],
    upperArmDirR,
    [-0.95, 0.30, -0.08],
    raycastFn,
    0.20,
    upperR * 0.95,
    0.005,
  ).point;
  const sleevePts = [];
  const sleeveNormals = [];
  const upperN = 11;
  const foreN = 11;
  for (let i = 0; i < upperN; i++) {
    const t = i / (upperN - 1);
    const axisPt = lerp3(armRPos, elbowRPos, t);
    const out = radialOutwardOnAxis(axisPt, upperArmDirR, [-0.94, 0, -0.32 * t], raycastFn, upperR * 2.2, upperR * 0.96, 0.005);
    sleevePts.push(i === 0 ? acromionTopR : out.point);
    sleeveNormals.push(out.normal);
  }
  for (let i = 1; i < foreN; i++) {
    const t = i / (foreN - 1);
    const axisPt = lerp3(elbowRPos, handRPos, t);
    const out = radialOutwardOnAxis(axisPt, forearmDirR, [-0.94, 0, -0.32 * (1 - t * 0.65)], raycastFn, upperR * 2.2, upperR * 0.62, 0.005);
    sleevePts.push(out.point);
    sleeveNormals.push(out.normal);
  }
  const slElbowPt = sleevePts[upperN - 1];
  const slWristPt = sleevePts[sleevePts.length - 1];
  const slMidPt = sleevePts[4];
  paths.sleeve = {
    points: sleevePts,
    normals: sleeveNormals,
    closed: false,
    kind: "arm-path",
    arcLengthCm: polylineLengthCm(sleevePts, false),
    witnessLines: [
      [add3(acromionTopR, [0.022, 0, 0]), add3(acromionTopR, [-0.022, 0, 0])],
      [add3(slWristPt, [0.022, 0, 0]), add3(slWristPt, [-0.022, 0, 0])],
    ],
    pinAnchor: [slMidPt[0] - 0.016, slMidPt[1], slMidPt[2]],
    cameraTarget: [armRPos[0] - 0.03, (shoulderY + handRPos[1]) * 0.5, 0],
    landmarkPins: [
      { id: "armAcromion", position: acromionTopR, en: MEAS_GUIDE_SPECS.sleeve.landmarkLabels[0].en, ar: MEAS_GUIDE_SPECS.sleeve.landmarkLabels[0].ar },
      { id: "armElbow", position: slElbowPt, en: MEAS_GUIDE_SPECS.sleeve.landmarkLabels[1].en, ar: MEAS_GUIDE_SPECS.sleeve.landmarkLabels[1].ar },
      { id: "armWrist", position: slWristPt, en: MEAS_GUIDE_SPECS.sleeve.landmarkLabels[2].en, ar: MEAS_GUIDE_SPECS.sleeve.landmarkLabels[2].ar },
    ],
  };

  // 7. Neck Base Circumference (tilted collar line: higher at back C7, lower at anterior notch)
  const neckMidY = neckBaseY + span * 0.010;
  const neckLoop = sampleCircumferenceLoop(
    [0, neckMidY, 0],
    axisZ,
    axisX,
    neckR,
    raycastFn,
    {
      segments: 48,
      clearance: 0.0038,
      maxDist: Math.max(neckR * 2.2, 0.14),
      fallbackRadiusU: neckR * 0.92,
      fallbackRadiusV: neckR * 0.96,
      yDipFn: (theta) => -0.18 * Math.cos(theta),
    },
  );
  const neckFrontPt = neckLoop.points.reduce((best, p) => (p[2] > best[2] ? p : best), neckLoop.points[0]);
  const neckBackPt = neckLoop.points.reduce((best, p) => (p[2] < best[2] ? p : best), neckLoop.points[0]);
  const neckSidePt = neckLoop.points.reduce((best, p) => (p[0] > best[0] ? p : best), neckLoop.points[0]);
  paths.neck = {
    ...neckLoop,
    kind: "circumference",
    levelPlane: { y: neckMidY, rx: neckR * 1.28, rz: neckR * 1.28 },
    pinAnchor: [neckSidePt[0] + 0.010, neckSidePt[1] + 0.008, neckSidePt[2]],
    cameraTarget: [0, neckMidY + 0.015, 0],
    landmarkPins: [
      { id: "neckBack", position: neckBackPt, en: MEAS_GUIDE_SPECS.neck.landmarkLabels[0].en, ar: MEAS_GUIDE_SPECS.neck.landmarkLabels[0].ar },
      { id: "neckNotch", position: neckFrontPt, en: MEAS_GUIDE_SPECS.neck.landmarkLabels[1].en, ar: MEAS_GUIDE_SPECS.neck.landmarkLabels[1].ar },
    ],
  };

  // 8. Upper Arm / Bicep Circumference (perpendicular ring around +X upper arm mid-belly)
  const bicepCenter = lerp3(armLPos, elbowLPos, 0.45);
  const armAxisL = normalize3(sub3(elbowLPos, armLPos));
  const armU = normalize3(cross3(armAxisL, axisZ));
  const armV = normalize3(cross3(armAxisL, armU));
  const bicepLoop = sampleCircumferenceLoop(
    bicepCenter,
    armU,
    armV,
    upperR * 0.94,
    raycastFn,
    {
      segments: 40,
      clearance: 0.0038,
      maxDist: Math.max(upperR * 1.9, 0.14),
      fallbackRadiusU: upperR * 0.92,
      fallbackRadiusV: upperR * 0.96,
    },
  );
  const bicepOuterPt = bicepLoop.points.reduce((best, p) => (p[0] > best[0] ? p : best), bicepLoop.points[0]);
  paths.bicep = {
    ...bicepLoop,
    kind: "circumference",
    pinAnchor: [bicepOuterPt[0] + 0.012, bicepOuterPt[1], bicepOuterPt[2]],
    cameraTarget: bicepCenter,
    landmarkPins: [
      { id: "bicepPeak", position: bicepOuterPt, en: MEAS_GUIDE_SPECS.bicep.landmarkLabels[0].en, ar: MEAS_GUIDE_SPECS.bicep.landmarkLabels[0].ar },
    ],
  };

  // 9. Inseam (Vertical inner-leg span along medial +X thigh from crotch apex to inner ankle)
  const crotchY = hipY - span * 0.078;
  const ankleInnerX = Math.max(0.032, legLPos[0] - thighR * 0.34);
  const crotchAnchor = [0.008, crotchY, 0.012];
  const ankleAnchor = [ankleInnerX, ankleY, 0.012];
  const inseamMid = lerp3(crotchAnchor, ankleAnchor, 0.50);
  const inseamPts = [crotchAnchor, inseamMid, ankleAnchor];
  paths.inseam = {
    points: inseamPts,
    normals: [[0, 0, 1], [0, 0, 1], [0, 0, 1]],
    closed: false,
    kind: "vertical-span",
    arcLengthCm: polylineLengthCm([crotchAnchor, ankleAnchor], false),
    witnessLines: [
      [[-0.035, crotchY, 0.012], [legLPos[0] * 0.65, crotchY, 0.012]],
      [[ankleAnchor[0] - 0.025, ankleY, 0.012], [ankleAnchor[0] + 0.025, ankleY, 0.012]],
    ],
    pinAnchor: [-0.016, inseamMid[1], 0.024],
    cameraTarget: [0, (crotchY + ankleY) * 0.5, 0],
    landmarkPins: [
      { id: "crotchApex", position: crotchAnchor, en: MEAS_GUIDE_SPECS.inseam.landmarkLabels[0].en, ar: MEAS_GUIDE_SPECS.inseam.landmarkLabels[0].ar },
      { id: "innerAnkle", position: ankleAnchor, en: MEAS_GUIDE_SPECS.inseam.landmarkLabels[1].en, ar: MEAS_GUIDE_SPECS.inseam.landmarkLabels[1].ar },
    ],
  };

  // 10. Upper Thigh Circumference (around +X leg just below crotch/gluteal fold)
  const thighCenterY = crotchY - (crotchY - kneeLPos[1]) * 0.16;
  const thighCenter = [legLPos[0] * 0.98, thighCenterY, 0];
  const thighLoop = sampleCircumferenceLoop(
    thighCenter,
    axisZ,
    axisX,
    thighR,
    raycastFn,
    {
      segments: 48,
      clearance: 0.0040,
      maxDist: Math.max(thighR * 1.9, 0.18),
      fallbackRadiusU: thighR,
      fallbackRadiusV: thighR * 0.92,
    },
  );
  const thighOuterPt = thighLoop.points.reduce((best, p) => (p[0] > best[0] ? p : best), thighLoop.points[0]);
  paths.thigh = {
    ...thighLoop,
    kind: "circumference",
    levelPlane: { y: thighCenterY, rx: thighR * 1.32, rz: thighR * 1.32, centerX: thighCenter[0] },
    pinAnchor: [thighOuterPt[0] + 0.012, thighOuterPt[1], thighOuterPt[2]],
    cameraTarget: thighCenter,
    landmarkPins: [
      { id: "thighFullest", position: thighOuterPt, en: MEAS_GUIDE_SPECS.thigh.landmarkLabels[0].en, ar: MEAS_GUIDE_SPECS.thigh.landmarkLabels[0].ar },
    ],
  };

  // 11. Total Height (Full vertical stadiometer ruler outside +X side from floor sole to crown)
  const heightRulerX = Math.max(armLPos[0] + upperR * 3.4, hipR * 1.45, shoulderHalf * 1.35) + 0.12;
  const hTop = [heightRulerX, crownY, 0];
  const hMid = [heightRulerX, (crownY + floorY) * 0.5, 0];
  const hBot = [heightRulerX, floorY, 0];
  paths.height = {
    points: [hBot, hMid, hTop],
    normals: [[0, 0, 1], [0, 0, 1], [0, 0, 1]],
    closed: false,
    kind: "vertical-span",
    arcLengthCm: Math.round((crownY - floorY) * 1000) / 10,
    witnessLines: [
      [[0, crownY, 0], [heightRulerX + 0.02, crownY, 0]],
      [[0, floorY, 0], [heightRulerX + 0.02, floorY, 0]],
    ],
    pinAnchor: [heightRulerX + 0.016, hMid[1], 0],
    cameraTarget: [0, (crownY + floorY) * 0.5, 0],
    landmarkPins: [
      { id: "crownTop", position: [0, crownY, 0], en: MEAS_GUIDE_SPECS.height.landmarkLabels[0].en, ar: MEAS_GUIDE_SPECS.height.landmarkLabels[0].ar },
      { id: "floorSole", position: [0, floorY, 0], en: MEAS_GUIDE_SPECS.height.landmarkLabels[1].en, ar: MEAS_GUIDE_SPECS.height.landmarkLabels[1].ar },
    ],
  };

  return paths;
}
