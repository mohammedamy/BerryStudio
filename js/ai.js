/* ============================================================
   AIGen — image-driven pattern generation.

   Two paths (see generate()):
   1) LOCAL  — analyse the uploaded image's silhouette in-browser
               (length, flare, waist, sleeves, dominant colour) + parse
               the text prompt, then build an editable parametric pattern
               that actually reflects the reference. Fully offline.
   2) REMOTE — POST {prompt, image, measurements, category} to a user
               configured endpoint (Settings → AI endpoint). The endpoint
               is expected to run Claude vision and return either:
                 { style: {type,lengthF,flareF,fitF,sleeveLenF,sleeveWideF,color}, summary? }
               or { pieces:[…], colors?, summary? }.
               Any failure falls back to the local path.
   ============================================================ */
const AIGen = (() => {
  const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
  const q = v => v / 4;
  const DEFAULT_COLORS = ["#6d5efc","#00c2a8","#ff5d8f","#e2a52b","#4c8dff","#c1492e"];

  const AR_TYPE = { dress:"الفستان", robe:"العباية", top:"التوب", shirt:"القميص", trousers:"البنطلون", skirt:"التنورة" };
  const EN_TYPE = { dress:"Dress", robe:"Robe", top:"Top", shirt:"Shirt", trousers:"Trousers", skirt:"Skirt" };

  // ---------- image silhouette analysis ----------
  function analyzeImage(dataURL){
    return new Promise((resolve)=>{
      if(!dataURL){ resolve(null); return; }
      const img = new Image();
      img.onload = () => {
        try {
          const W = 160, H = Math.max(1, Math.round(W * img.height / img.width));
          const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
          const ctx = cv.getContext("2d"); ctx.drawImage(img, 0, 0, W, H);
          const d = ctx.getImageData(0, 0, W, H).data;
          const px = (x,y)=>{ const i=(y*W+x)*4; return [d[i],d[i+1],d[i+2]]; };
          // background ≈ mean of the four corners
          const c = [px(0,0),px(W-1,0),px(0,H-1),px(W-1,H-1)]
            .reduce((a,v)=>[a[0]+v[0],a[1]+v[1],a[2]+v[2]],[0,0,0]).map(v=>v/4);
          const isFg = (r,g,b)=> Math.hypot(r-c[0],g-c[1],b-c[2]) > 46;
          const rowW = new Array(H).fill(0);
          let minY=H, maxY=0, cr=0,cg=0,cb=0,cnt=0;
          for(let y=0;y<H;y++){ let l=W, r=-1, w=0;
            for(let x=0;x<W;x++){ const i=(y*W+x)*4;
              if(isFg(d[i],d[i+1],d[i+2])){ w++; if(x<l)l=x; if(x>r)r=x; cr+=d[i];cg+=d[i+1];cb+=d[i+2];cnt++; } }
            rowW[y] = r>l ? r-l : 0;
            if(w > W*0.03){ if(y<minY)minY=y; if(y>maxY)maxY=y; }
          }
          const gh = Math.max(1, maxY-minY);
          const at = f => rowW[clamp(Math.round(minY+gh*f),0,H-1)] || 0;
          const maxW = Math.max(1, ...rowW.slice(minY, maxY+1));
          const shoulderW = Math.max(at(0.06), at(0.11), at(0.15));
          const chestW    = Math.max(1, at(0.24));
          const waistW    = Math.min(at(0.42), at(0.48), at(0.54)) || maxW;
          const hemW      = Math.max(at(0.90), at(0.96), at(0.99));
          const color = cnt ? `rgb(${Math.round(cr/cnt)},${Math.round(cg/cnt)},${Math.round(cb/cnt)})` : null;
          resolve({
            ok: gh > H*0.2,
            heightFrac: +(gh/H).toFixed(2),              // how much of the frame it fills → absolute length
            aspect:     +(gh/maxW).toFixed(2),           // elongation (height ÷ width)
            flare:      +(hemW/chestW).toFixed(2),       // >1.2 A-line / flared
            waistRatio: +(waistW/Math.max(1,shoulderW)).toFixed(2), // <0.85 cinched
            sleeveFactor:+(Math.max(0,(shoulderW-chestW)/chestW)).toFixed(2), // >0.2 sleeves
            color,
          });
        } catch(e){ resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = dataURL;
    });
  }

  // ---------- prompt + metrics → style parameters ----------
  function deriveStyle({ metrics, prompt, category }){
    const t = (prompt||"").toLowerCase();
    const s = { type:null, lengthF:1, flareF:1, fitF:1, sleeveLenF:1, sleeveWideF:1, color:null };

    if(/shirt|بلوز|قميص/.test(t)) s.type="shirt";
    else if(/abaya|kaftan|caftan|robe|عباية|قفطان/.test(t)) s.type="robe";
    else if(/thobe|ثوب/.test(t)) s.type="robe";
    else if(/trouser|pant|jean|بنطلون|سروال/.test(t)) s.type="trousers";
    else if(/skirt|تنورة|جيبة/.test(t)) s.type="skirt";
    else if(/dress|gown|frock|فستان/.test(t)) s.type="dress";
    else if(/top|blouse|tee|shirt|توب/.test(t)) s.type="top";
    if(!s.type && metrics && metrics.ok){
      const hf = metrics.heightFrac;
      s.type = hf!=null ? (hf<0.5 ? "top" : hf>0.82 ? "robe" : "dress")
                        : (metrics.aspect>2.4 ? "robe" : metrics.aspect>1.65 ? "dress" : "top");
    }
    if(!s.type) s.type = ({women:"dress",men:"shirt",girls:"dress",boys:"trousers"})[category] || "dress";

    // length — prompt wins; otherwise how much of the frame the garment fills
    if(/maxi|floor|full[- ]?length|ankle|long|طويل/.test(t)) s.lengthF=1.35;
    else if(/midi/.test(t)) s.lengthF=1.1;
    else if(/mini|crop|cropped|short|قصير/.test(t)) s.lengthF=0.7;
    else if(metrics && metrics.ok && metrics.heightFrac!=null){
      const hf=metrics.heightFrac;
      s.lengthF *= hf>0.85 ? 1.3 : hf>0.65 ? 1.05 : hf<0.42 ? 0.62 : hf<0.55 ? 0.8 : 1;
    } else if(metrics && metrics.ok){
      s.lengthF *= metrics.aspect>2.2 ? 1.2 : metrics.aspect<1.3 ? 0.82 : 1;
    }

    // flare
    if(/a[- ]?line|flare|flared|circle|skater|swing|كلوش|واسع/.test(t)) s.flareF=1.5;
    else if(/pencil|straight|bodycon|column|قلم|مستقيم/.test(t)) s.flareF=0.9;
    if(metrics && metrics.ok) s.flareF *= metrics.flare>1.3 ? 1.4 : metrics.flare<0.95 ? 0.85 : 1;

    // fit / waist suppression
    if(/fitted|bodycon|slim|tailored|ضيق|مخصر/.test(t)) s.fitF=0.82;
    else if(/loose|oversized|relaxed|boxy|فضفاض|واسع/.test(t)) s.fitF=1.16;
    if(metrics && metrics.ok && metrics.waistRatio < 0.85) s.fitF = Math.min(s.fitF, 0.85);

    // sleeves
    if(/sleeveless|tank|strap|halter|بدون كم/.test(t)) s.sleeveLenF=0;
    else if(/long[- ]?sleeve|full[- ]?sleeve|كم طويل/.test(t)) s.sleeveLenF=1.3;
    else if(/3\/4|three[- ]?quarter|٣\/٤/.test(t)) s.sleeveLenF=0.8;
    else if(/short[- ]?sleeve|cap[- ]?sleeve|كم قصير/.test(t)) s.sleeveLenF=0.45;
    if(/puff|balloon|bishop|bell|wide sleeve|منفوش|واسع الكم/.test(t)) s.sleeveWideF=1.6;
    if(metrics && metrics.ok){
      if(metrics.sleeveFactor > 0.28) s.sleeveWideF = Math.max(s.sleeveWideF, 1.4);
      if(metrics.sleeveFactor < 0.07 && !/sleeve|كم/.test(t) && s.sleeveLenF===1) s.sleeveLenF = 0.55;
    }

    s.color = metrics && metrics.color;
    // clamp everything to sane ranges
    s.lengthF=clamp(s.lengthF,0.55,1.6); s.flareF=clamp(s.flareF,0.82,1.9);
    s.fitF=clamp(s.fitF,0.72,1.28); s.sleeveLenF=clamp(s.sleeveLenF,0,1.5); s.sleeveWideF=clamp(s.sleeveWideF,0.8,2);
    return s;
  }

  // ---------- parametric builders ----------
  function build(style, m){
    let pieces;
    if(style.type==="trousers") pieces = buildTrousers(style,m);
    else if(style.type==="skirt") pieces = buildSkirt(style,m);
    else pieces = buildTop(style,m);
    const colors = paletteFor(style.color);
    return { pieces, colors, colorInt: style.color ? rgbToInt(style.color) : null };
  }

  function buildTop(style, m){
    const fit=style.fitF, bod=m.backLen;
    const lenBase = { top:bod+22, shirt:bod+34, dress:bod+62, robe:m.height-26 }[style.type] || bod+56;
    const total = clamp(lenBase*style.lengthF, bod+16, m.height);
    const chestW=(q(m.chest)+2)*fit, waistW=(q(m.waist)+3)*fit, hipW=(q(m.hips)+2)*fit;
    const hemW  = Math.max(hipW, hipW*style.flareF);
    const neckF = clamp(m.neck/6, 4, 9);
    const en=EN_TYPE[style.type]||"Panel", ar=AR_TYPE[style.type]||"القطعة";
    const waistDart = fit<0.92 ? [[[waistW*0.5, bod-9],[waistW*0.5-2, bod],[waistW*0.5+2, bod]]] : [];

    const front = {
      name:{en:en+" Front", ar:"مقدمة "+ar},
      desc:{en:"Generated front — length, flare and fit taken from your reference.",
            ar:"قطعة أمامية مولّدة — الطول والاتساع والضيق مأخوذة من صورتك المرجعية."},
      outline:[[0,neckF*0.9],[chestW*0.4,1],[chestW,3],[chestW+1,bod*0.5],[waistW+1,bod],
               [hipW+1,bod+(total-bod)*0.42],[hemW,total],[0,total]],
      darts:waistDart, notches:[[chestW,3],[waistW+1,bod]],
      grain:[[chestW*0.5,neckF+4],[chestW*0.5,total-6]],
    };
    const back = {
      name:{en:en+" Back", ar:"ظهر "+ar},
      desc:{en:"Generated back panel — mirrors the front block.",
            ar:"قطعة خلفية مولّدة — تقابل القطعة الأمامية."},
      outline:[[0,neckF*0.35],[chestW*0.4,1],[chestW,3.5],[chestW+1,bod*0.5],[waistW+0.5,bod],
               [hipW+0.5,bod+(total-bod)*0.42],[hemW,total],[0,total]],
      darts:waistDart.map(d=>d.map(p=>[p[0],p[1]])), notches:[[chestW,3.5]],
      grain:[[2,neckF+4],[2,total-6]],
    };
    const pieces=[front, back];
    if(style.sleeveLenF > 0.05){
      const slen=clamp(m.sleeve*style.sleeveLenF, 8, m.sleeve*1.35);
      const bic=q(m.bicep)*style.sleeveWideF, cap=6*style.sleeveWideF;
      pieces.push({
        name:{en:"Sleeve", ar:"كم"},
        desc:{en:"Generated sleeve — length and width from the reference.",
              ar:"كم مولّد — الطول والاتساع من الصورة المرجعية."},
        outline:[[0,0],[bic,-cap],[bic*2,0],[bic*2-1,slen],[1,slen]],
        darts:[], notches:[[bic,-cap]],
        grain:[[bic,4],[bic,slen-4]],
      });
    }
    return pieces;
  }

  function buildTrousers(style, m){
    const fit=style.fitF;
    const w=(q(m.hips)+2)*fit;
    const len=clamp(m.inseam*style.lengthF, 24, m.inseam+22)+18;
    const hem=clamp(w*style.flareF*0.72, w*0.4, w*1.3)+4;
    const front={ name:{en:"Front Leg", ar:"الساق الأمامية"},
      desc:{en:"Generated front trouser leg.", ar:"ساق أمامية مولّدة."},
      outline:[[2,0],[w,0],[w+2,11],[hem+2,len],[2,len],[-2,11]],
      grain:[[w/2,7],[w/2,len-7]] };
    const back={ name:{en:"Back Leg", ar:"الساق الخلفية"},
      desc:{en:"Generated back trouser leg.", ar:"ساق خلفية مولّدة."},
      outline:[[2,0],[w+3,0],[w+5,11],[hem+3,len],[2,len],[-4,13]],
      grain:[[w/2,7],[w/2,len-7]] };
    const band={ name:{en:"Waistband", ar:"الحزام"},
      desc:{en:"Generated waistband.", ar:"حزام مولّد."},
      outline:[[0,0],[m.waist*fit+4,0],[m.waist*fit+4,7],[0,7]], grain:[[3,2],[m.waist*fit,2]] };
    return [front, back, band];
  }

  function buildSkirt(style, m){
    const fit=style.fitF;
    const w=(q(m.hips)+2)*fit;
    const len=clamp(m.inseam*0.6*style.lengthF, 20, m.inseam);
    const hem=Math.max(w, w*style.flareF);
    const panel=(en,ar)=>({ name:{en, ar},
      desc:{en:"Generated skirt panel — flare from the reference.", ar:"بنل تنورة مولّد — الاتساع من الصورة."},
      outline:[[0,0],[w,0],[hem,len],[0,len]], grain:[[w/2,5],[w/2,len-5]] });
    const band={ name:{en:"Waistband", ar:"الحزام"},
      desc:{en:"Generated waistband.", ar:"حزام مولّد."},
      outline:[[0,0],[m.waist*fit+4,0],[m.waist*fit+4,7],[0,7]], grain:[[3,2],[m.waist*fit,2]] };
    return [panel("Front Skirt","تنورة أمامية"), panel("Back Skirt","تنورة خلفية"), band];
  }

  // ---------- summary text ----------
  function summary(style, lang){
    const en = {
      len: style.lengthF>=1.2?"long":style.lengthF<=0.82?"short":"regular-length",
      flare: style.flareF>=1.25?"A-line":style.flareF<=0.92?"fitted":"straight",
      slv: style.sleeveLenF<=0.05?"sleeveless":style.sleeveWideF>=1.4?"wide-sleeved":
           style.sleeveLenF>=1.2?"long-sleeved":style.sleeveLenF<=0.5?"short-sleeved":"sleeved",
      type: (EN_TYPE[style.type]||"garment").toLowerCase(),
    };
    const ar = {
      len: style.lengthF>=1.2?"طويل":style.lengthF<=0.82?"قصير":"بطول عادي",
      flare: style.flareF>=1.25?"واسع (A-line)":style.flareF<=0.92?"ضيّق":"مستقيم",
      slv: style.sleeveLenF<=0.05?"بدون أكمام":style.sleeveWideF>=1.4?"بأكمام واسعة":
           style.sleeveLenF>=1.2?"بأكمام طويلة":style.sleeveLenF<=0.5?"بأكمام قصيرة":"بأكمام",
      type: AR_TYPE[style.type]||"قطعة",
    };
    return lang==="ar" ? `${ar.type} ${ar.len} ${ar.flare} · ${ar.slv}`
                       : `${en.len} ${en.flare} ${en.type} · ${en.slv}`;
  }

  // ---------- colours ----------
  function rgbToInt(rgb){ const m=/(\d+)\D+(\d+)\D+(\d+)/.exec(rgb||""); if(!m) return null; return (+m[1]<<16)|(+m[2]<<8)|+m[3]; }
  function shade(rgb, delta){ const m=/(\d+)\D+(\d+)\D+(\d+)/.exec(rgb); if(!m) return rgb;
    const c=[+m[1],+m[2],+m[3]].map(v=>clamp(Math.round(v+delta),0,255)); return `rgb(${c[0]},${c[1]},${c[2]})`; }
  function paletteFor(color){ if(!color) return DEFAULT_COLORS.slice();
    return [color, shade(color,-22), shade(color,22), shade(color,-40), shade(color,40), shade(color,-60)]; }

  // ---------- remote (Claude vision via user endpoint) ----------
  async function remote(endpoint, payload){
    const ctrl = new AbortController(); const to = setTimeout(()=>ctrl.abort(), 30000);
    try {
      const res = await fetch(endpoint, {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify(payload), signal: ctrl.signal,
      });
      if(!res.ok) throw new Error("bad status "+res.status);
      return await res.json();   // { style?, pieces?, colors?, summary? }
    } finally { clearTimeout(to); }
  }

  // ---------- orchestrator ----------
  async function generate({ prompt, imageDataURL, category, measurements, endpoint, lang }){
    // 1) remote path if configured — falls back to local on any failure
    if(endpoint){
      try {
        const r = await remote(endpoint, { prompt, image:imageDataURL, category, measurements });
        if(r && Array.isArray(r.pieces) && r.pieces.length)
          return { pieces:r.pieces, colors:r.colors||DEFAULT_COLORS.slice(), colorInt:null, summary:r.summary||"", source:"remote" };
        if(r && r.style){
          const built = build({ ...deriveStyle({metrics:null,prompt,category}), ...r.style }, measurements);
          return { ...built, summary: r.summary || summary({ ...r.style }, lang), source:"remote" };
        }
      } catch(e){ /* fall through to local */ }
    }
    // 2) local silhouette analysis + prompt parsing
    const metrics = imageDataURL ? await analyzeImage(imageDataURL) : null;
    const style = deriveStyle({ metrics, prompt, category });
    const built = build(style, measurements);
    return { ...built, summary: summary(style, lang), source:"local", usedImage: !!(metrics && metrics.ok) };
  }

  return { analyzeImage, deriveStyle, build, summary, generate };
})();
