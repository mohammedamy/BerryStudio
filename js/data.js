/* ============================================================
   Measurement standards, size grading engine & parametric
   pattern definitions. All measurements in centimetres.
   ============================================================ */

const SIZES = ["XXS","XS","S","M","L","XL","XXL","XXXL","XXXXL","5XL","6XL"];
// Grade step relative to M (index 3). Each step = one size.
const SIZE_STEP = SIZES.reduce((o,s,i)=>(o[s]=i-3,o),{});

const KIDS_AGES = [
  { id:"2-3",   label:{en:"2–3Y",  ar:"٢-٣ سنة"},  height:98 },
  { id:"4-5",   label:{en:"4–5Y",  ar:"٤-٥ سنة"},  height:110 },
  { id:"6-7",   label:{en:"6–7Y",  ar:"٦-٧ سنة"},  height:122 },
  { id:"8-9",   label:{en:"8–9Y",  ar:"٨-٩ سنة"},  height:134 },
  { id:"10-12", label:{en:"10–12Y",ar:"١٠-١٢ سنة"},height:150 },
  { id:"13-14", label:{en:"13–14Y",ar:"١٣-١٤ سنة"},height:162 },
  { id:"15-16", label:{en:"15–16Y",ar:"١٥-١٦ سنة"},height:170 },
];

/* Base body (size M / mid-age) per category. */
const BASE = {
  women: { chest:88, waist:70, hips:96, shoulder:39, backLen:41, sleeve:58, neck:37, bicep:28, inseam:78, thigh:56, height:167 },
  men:   { chest:100,waist:86, hips:100,shoulder:46, backLen:45, sleeve:64, neck:40, bicep:33, inseam:82, thigh:60, height:178 },
  girls: { chest:68, waist:60, hips:72, shoulder:31, backLen:31, sleeve:44, neck:30, bicep:21, inseam:58, thigh:40, height:134 },
  boys:  { chest:70, waist:63, hips:73, shoulder:32, backLen:33, sleeve:46, neck:31, bicep:22, inseam:60, thigh:41, height:138 },
};

/* Per-size-step grade increments (cm) — proportion-perfect. */
const GRADE = {
  chest:4, waist:4, hips:4, shoulder:1, backLen:1, sleeve:1.5, neck:0.8, bicep:1.2, inseam:2, thigh:1.6, height:4
};

/* Standard offsets — Egyptian & Gulf blocks run slightly different
   ease and rise vs. ASTM/ISO. Applied as small proportional shifts. */
const STANDARDS = {
  intl:  { name:{en:"International (ASTM/ISO)",ar:"عالمي"}, chest:0, waist:0, hips:0, ease:1.00 },
  egypt: { name:{en:"Egyptian",ar:"مصري"},                 chest:1, waist:2, hips:1, ease:1.04 },
  saudi: { name:{en:"Saudi / Gulf",ar:"سعودي / خليجي"},    chest:2, waist:1, hips:2, ease:1.06 },
};

/* Compute a full measurement set for the given selection. */
function computeMeasurements({ category, size, standard, kids, custom }) {
  const base = { ...BASE[category] };
  let step = SIZE_STEP[size] ?? 0;

  // Kids mode overrides the block by height ratio.
  if (kids) {
    const age = KIDS_AGES.find(a => a.id === kids) || KIDS_AGES[2];
    const ratio = age.height / base.height;
    for (const k in base) base[k] = +(base[k] * ratio).toFixed(1);
    base.height = age.height;
    step = 0;
  }

  const std = STANDARDS[standard] || STANDARDS.intl;
  const out = {};
  for (const k in base) {
    let v = base[k] + (GRADE[k] || 0) * step;
    if (std[k] != null) v += std[k];          // standard body offset
    if (["chest","waist","hips"].includes(k)) v *= std.ease; // ease factor
    out[k] = +v.toFixed(1);
  }
  // Manual custom overrides win.
  if (custom) for (const k in custom) if (custom[k] != null && custom[k] !== "") out[k] = +custom[k];
  return out;
}

/* ============================================================
   PARAMETRIC PATTERNS
   Each piece is a function(m) -> geometry in cm (drafting space).
   The canvas renderer scales & positions pieces automatically.
   ============================================================ */

// small helper — quarter measurements for front/back blocks
const q = v => v / 4;

const PATTERNS = {
  /* -------- WOMEN'S FITTED DRESS (multi-piece) -------- */
  womens_dress: {
    id: "womens_dress",
    category: "women",
    name: { en: "Women's Fitted Dress", ar: "فستان حريمي بقصة ضيقة" },
    desc: { en: "Classic darted sheath dress block.", ar: "بلوك فستان كلاسيكي ببنسات." },
    pieces: (m) => {
      const cF = q(m.chest) + 1, wF = q(m.waist) + 2, hF = q(m.hips) + 1.5;
      const len = m.backLen + 58; // waist->hem
      return [
        {
          key:"front_bodice",
          name:{en:"Front Bodice",ar:"قصة أمامية"},
          desc:{en:"Front base for dresses, blouses and shirts.",ar:"الأساس الأمامي للفساتين والبلوزات والقمصان."},
          outline:[[0,0],[cF,1],[cF+1,m.backLen*0.55],[wF+1,m.backLen],[hF+1,m.backLen+24],[hF+1,len],[0,len]],
          darts:[[[wF*0.5,m.backLen-9],[wF*0.5-2,m.backLen],[wF*0.5+2,m.backLen]]],
          notches:[[cF,1],[wF+1,m.backLen]],
          grain:[[cF*0.5,10],[cF*0.5,len-10]],
        },
        {
          key:"back_bodice",
          name:{en:"Back Bodice",ar:"قصة خلفية"},
          desc:{en:"Back base, mirrors the front with shaping.",ar:"الأساس الخلفي، يقابل الأمام مع تشكيل الوسط."},
          outline:[[0,0],[cF,1.5],[cF+1,m.backLen*0.55],[wF+0.5,m.backLen],[hF+0.5,m.backLen+24],[hF+0.5,len],[0,len]],
          darts:[[[wF*0.5,m.backLen-11],[wF*0.5-2,m.backLen],[wF*0.5+2,m.backLen]]],
          notches:[[cF,1.5],[wF+0.5,m.backLen]],
          grain:[[2,10],[2,len-10]],
        },
        {
          key:"sleeve",
          name:{en:"Set-in Sleeve",ar:"كم مركّب"},
          desc:{en:"Fitted sleeve eased into the armhole.",ar:"كم ضيق يُركّب في فتحة الإبط."},
          outline:[[0,0],[q(m.bicep),-6],[q(m.bicep)*2,0],[q(m.bicep)*2-1,m.sleeve],[1,m.sleeve]],
          notches:[[q(m.bicep),-6]],
          grain:[[q(m.bicep),4],[q(m.bicep),m.sleeve-4]],
        },
        {
          key:"skirt_front",
          name:{en:"Front Skirt Panel",ar:"بنل التنورة الأمامي"},
          desc:{en:"Flared lower front for movement.",ar:"جزء أمامي سفلي واسع للحركة."},
          outline:[[0,0],[hF+1,0],[hF+6,len-m.backLen],[-4,len-m.backLen]],
          grain:[[hF*0.5,6],[hF*0.5,len-m.backLen-6]],
        },
      ];
    }
  },

  /* -------- MEN'S CLASSIC SHIRT -------- */
  mens_shirt: {
    id: "mens_shirt",
    category: "men",
    name: { en: "Men's Classic Shirt", ar: "قميص رجالي كلاسيكي" },
    desc: { en: "Tailored button-down shirt block.", ar: "بلوك قميص مفصّل بأزرار." },
    pieces: (m) => {
      const cF = q(m.chest) + 3, len = m.backLen + 32;
      return [
        { key:"front", name:{en:"Shirt Front",ar:"مقدمة القميص"},
          desc:{en:"Front with button placket edge.",ar:"المقدمة مع حاشية الأزرار."},
          outline:[[0,0],[cF,2],[cF+1,m.backLen*0.5],[cF,m.backLen],[cF,len],[0,len]],
          notches:[[cF,m.backLen]], grain:[[3,8],[3,len-8]] },
        { key:"back", name:{en:"Shirt Back with Yoke",ar:"ظهر القميص مع الكوة"},
          desc:{en:"Back panel joined to a shoulder yoke.",ar:"الظهر متصل بكوّة الكتف."},
          outline:[[0,0],[cF+1,2],[cF+2,m.backLen*0.5],[cF+1,len],[0,len]],
          grain:[[3,8],[3,len-8]] },
        { key:"sleeve", name:{en:"Shirt Sleeve",ar:"كم القميص"},
          desc:{en:"Full sleeve with placket for the cuff.",ar:"كم كامل مع فتحة للأساور."},
          outline:[[0,0],[q(m.bicep)+2,-7],[q(m.bicep)*2+4,0],[q(m.bicep)*2+2,m.sleeve-6],[2,m.sleeve-6]],
          notches:[[q(m.bicep)+2,-7]], grain:[[q(m.bicep)+2,4],[q(m.bicep)+2,m.sleeve-10]] },
        { key:"collar", name:{en:"Collar & Stand",ar:"الياقة والقاعدة"},
          desc:{en:"Two-piece collar with band.",ar:"ياقة من قطعتين مع القاعدة."},
          outline:[[0,0],[m.neck/2+3,0],[m.neck/2+3,7],[0,8]],
          grain:[[2,2],[m.neck/2,2]] },
        { key:"cuff", name:{en:"Cuff",ar:"الأساور"},
          desc:{en:"Buttoned wrist cuff.",ar:"أساور المعصم بالأزرار."},
          outline:[[0,0],[m.neck/2+6,0],[m.neck/2+6,7],[0,7]],
          grain:[[2,2],[m.neck/2,2]] },
      ];
    }
  },

  /* -------- WOMEN'S ABAYA -------- */
  abaya: {
    id:"abaya", category:"women",
    name:{en:"Classic Abaya",ar:"عباية كلاسيكية"},
    desc:{en:"Flowing open-front abaya block.",ar:"بلوك عباية مفتوحة انسيابية."},
    pieces:(m)=>{
      const w=q(m.chest)+10, len=m.height-20;
      return [
        { key:"front", name:{en:"Abaya Front",ar:"مقدمة العباية"},
          desc:{en:"Open front panel with draped fall.",ar:"بنل أمامي مفتوح بانسدال."},
          outline:[[0,0],[w,3],[w+14,len],[-2,len]],
          grain:[[6,8],[6,len-8]] },
        { key:"back", name:{en:"Abaya Back",ar:"ظهر العباية"},
          desc:{en:"Full back on the fold.",ar:"ظهر كامل على الطية."},
          outline:[[0,0],[w+2,3],[w+16,len],[0,len]],
          grain:[[4,8],[4,len-8]] },
        { key:"sleeve", name:{en:"Wide Sleeve",ar:"كم واسع"},
          desc:{en:"Loose flared sleeve.",ar:"كم واسع منسدل."},
          outline:[[0,0],[q(m.bicep)+8,-8],[q(m.bicep)*2+16,0],[q(m.bicep)*2+20,m.sleeve],[-4,m.sleeve]],
          grain:[[q(m.bicep)+8,4],[q(m.bicep)+8,m.sleeve-4]] },
      ];
    }
  },

  /* -------- MEN'S THOBE -------- */
  thobe: {
    id:"thobe", category:"men",
    name:{en:"Men's Thobe",ar:"ثوب رجالي"},
    desc:{en:"Traditional Gulf thobe block.",ar:"بلوك الثوب الخليجي التقليدي."},
    pieces:(m)=>{
      const w=q(m.chest)+6, len=m.height-16;
      return [
        { key:"front", name:{en:"Thobe Front",ar:"مقدمة الثوب"},
          desc:{en:"Front with placket and pocket.",ar:"المقدمة مع الحاشية والجيب."},
          outline:[[0,0],[w,2],[w+4,m.backLen],[w+8,len],[0,len]],
          grain:[[4,8],[4,len-8]] },
        { key:"back", name:{en:"Thobe Back",ar:"ظهر الثوب"},
          desc:{en:"Back on the fold.",ar:"الظهر على الطية."},
          outline:[[0,0],[w+1,2],[w+5,m.backLen],[w+9,len],[0,len]],
          grain:[[4,8],[4,len-8]] },
        { key:"sleeve", name:{en:"Thobe Sleeve",ar:"كم الثوب"},
          desc:{en:"Long straight sleeve.",ar:"كم طويل مستقيم."},
          outline:[[0,0],[q(m.bicep)+4,-6],[q(m.bicep)*2+8,0],[q(m.bicep)*2+4,m.sleeve+4],[2,m.sleeve+4]],
          grain:[[q(m.bicep)+4,4],[q(m.bicep)+4,m.sleeve]] },
        { key:"gusset", name:{en:"Underarm Gusset",ar:"دكة تحت الإبط"},
          desc:{en:"Diamond gusset for ease of movement.",ar:"دكة ماسية لسهولة الحركة."},
          outline:[[6,0],[12,10],[6,20],[0,10]], grain:[[6,3],[6,17]] },
      ];
    }
  },

  /* -------- KIDS DRESS (girls) -------- */
  girls_dress: {
    id:"girls_dress", category:"girls",
    name:{en:"Girls' Party Dress",ar:"فستان بناتي للحفلات"},
    desc:{en:"Gathered-skirt girls dress.",ar:"فستان بناتي بتنورة مكشكشة."},
    pieces:(m)=>{
      const cF=q(m.chest)+1.5, bod=m.backLen;
      return [
        { key:"bodice_front", name:{en:"Bodice Front",ar:"صدرية أمامية"},
          desc:{en:"Fitted front bodice.",ar:"صدرية أمامية ضيقة."},
          outline:[[0,0],[cF,1],[cF,bod],[0,bod]], grain:[[cF/2,4],[cF/2,bod-4]] },
        { key:"bodice_back", name:{en:"Bodice Back",ar:"صدرية خلفية"},
          desc:{en:"Back bodice with button opening.",ar:"صدرية خلفية بفتحة أزرار."},
          outline:[[0,0],[cF,1],[cF,bod],[0,bod]], grain:[[cF/2,4],[cF/2,bod-4]] },
        { key:"skirt", name:{en:"Gathered Skirt",ar:"تنورة مكشكشة"},
          desc:{en:"Full rectangle skirt, gathered to waist.",ar:"تنورة مستطيلة كاملة تُكشكش عند الوسط."},
          outline:[[0,0],[m.waist*1.6,0],[m.waist*1.6,m.inseam*0.55],[0,m.inseam*0.55]],
          grain:[[8,4],[8,m.inseam*0.5]] },
        { key:"sleeve", name:{en:"Puff Sleeve",ar:"كم منفوش"},
          desc:{en:"Short gathered puff sleeve.",ar:"كم قصير منفوش."},
          outline:[[0,0],[q(m.bicep)+3,-5],[q(m.bicep)*2+6,0],[q(m.bicep)*2,18],[0,18]],
          grain:[[q(m.bicep)+3,3],[q(m.bicep)+3,15]] },
      ];
    }
  },

  /* -------- BOYS TROUSERS -------- */
  boys_trousers: {
    id:"boys_trousers", category:"boys",
    name:{en:"Boys' Trousers",ar:"بنطلون ولادي"},
    desc:{en:"Straight-leg kids trouser block.",ar:"بلوك بنطلون ولادي مستقيم."},
    pieces:(m)=>{
      const w=q(m.hips)+2;
      return [
        { key:"front_leg", name:{en:"Front Leg",ar:"الساق الأمامية"},
          desc:{en:"Front trouser leg with crease.",ar:"الساق الأمامية مع الكسرة."},
          outline:[[0,0],[w,0],[w+2,10],[w,m.inseam+18],[2,m.inseam+18],[-2,10]],
          grain:[[w/2,6],[w/2,m.inseam+12]] },
        { key:"back_leg", name:{en:"Back Leg",ar:"الساق الخلفية"},
          desc:{en:"Back leg with seat shaping.",ar:"الساق الخلفية مع تشكيل المقعد."},
          outline:[[0,0],[w+3,0],[w+5,10],[w+2,m.inseam+18],[2,m.inseam+18],[-4,12]],
          grain:[[w/2,6],[w/2,m.inseam+12]] },
        { key:"waistband", name:{en:"Waistband",ar:"الحزام"},
          desc:{en:"Elastic waistband strip.",ar:"شريط حزام بأستك."},
          outline:[[0,0],[m.waist+4,0],[m.waist+4,7],[0,7]], grain:[[3,2],[m.waist,2]] },
      ];
    }
  },
};

/* Library card list (order + tags for filtering). */
const LIBRARY = [
  { id:"womens_dress", cat:"women",  tag:{en:"Dress",ar:"فستان"},   type:"dress" },
  { id:"abaya",        cat:"women",  tag:{en:"Abaya",ar:"عباية"},   type:"robe" },
  { id:"mens_shirt",   cat:"men",    tag:{en:"Shirt",ar:"قميص"},    type:"shirt" },
  { id:"thobe",        cat:"men",    tag:{en:"Thobe",ar:"ثوب"},     type:"robe" },
  { id:"girls_dress",  cat:"girls",  tag:{en:"Dress",ar:"فستان"},   type:"dress" },
  { id:"boys_trousers",cat:"boys",   tag:{en:"Trousers",ar:"بنطلون"},type:"trousers" },
];
