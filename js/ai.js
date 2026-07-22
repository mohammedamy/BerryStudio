/* ============================================================
   AIGen — image-driven pattern generation.

   Two paths (see generate()):
   1) LOCAL  — analyse the uploaded image's silhouette in-browser
               (contiguous-run silhouette scan → length, flare, waist,
               sleeves, NECKLINE shape, HEM shape, dominant colour) +
               parse the text prompt, run a visible multi-stage
               "thinking" sequence, then build an editable parametric
               pattern with real construction variety (neckline cut,
               hem shape, wrap closure) — not just a resized template.
               Fully offline.
   2) REMOTE — POST {prompt, image, measurements, category} to a user
               configured endpoint (Settings → AI endpoint). The endpoint
               is expected to run Claude vision and return either:
                 { style: {...}, summary? }
               or { pieces:[…], colors?, summary? }.
               Any failure falls back to the local path.

   Honesty note: the local path is a lightweight heuristic, not real
   computer vision. It segments the garment via a border-adaptive
   threshold + largest-contiguous-run-per-row (robust to background
   clutter that simple corner-sampling isn't), then reads neckline/hem
   shape from the silhouette profile. It will still misread busy or
   low-contrast photos — when it can't get a confident read it falls
   back to prompt text, then to deterministic (input-seeded, not
   random) variety so the same input always reproduces the same
   result, but different inputs actually look different.
   ============================================================ */
const AIGen = (() => {
  const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
  const q = v => v / 4;
  const DEFAULT_COLORS = ["#6d5efc","#00c2a8","#ff5d8f","#e2a52b","#4c8dff","#c1492e"];
  // curated fashion palette used to add colour variety when no image colour is available
  const SEED_COLORS = ["#b5495b","#2f6d6d","#c98a3e","#5b5ea6","#7a8450","#8a4f7d","#3d6b8a","#a65b3c","#4f7d5c","#8a3d5c"];

  const AR_TYPE = { dress:"الفستان", robe:"العباية", top:"التوب", shirt:"القميص", trousers:"البنطلون", skirt:"التنورة" };
  const EN_TYPE = { dress:"Dress", robe:"Robe", top:"Top", shirt:"Shirt", trousers:"Trousers", skirt:"Skirt" };

  // deterministic string hash → used to pick "unspecified" attributes so
  // the SAME input always reproduces the SAME result, but different
  // prompts/images land on different construction choices.
  function hashStr(s){ let h=0; for(let i=0;i<s.length;i++){ h=(h*31+s.charCodeAt(i))|0; } return Math.abs(h); }
  function pick(seed, options){ return options[hashStr(seed) % options.length]; }

  // ---------- image silhouette analysis ----------
  // Segmentation: adaptive threshold from the border ring's colour
  // statistics, then per-row the LARGEST CONTIGUOUS run of foreground
  // pixels (not just min/max of any foreground pixel) — this is what
  // makes it tolerant of background clutter/noise instead of latching
  // onto an unrelated bright pixel far from the subject.
  function analyzeImage(dataURL){
    return new Promise((resolve)=>{
      if(!dataURL){ resolve(null); return; }
      const img = new Image();
      img.onload = () => {
        try {
          const W = 180, H = Math.max(1, Math.round(W * img.height / img.width));
          const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
          const ctx = cv.getContext("2d"); ctx.drawImage(img, 0, 0, W, H);
          const d = ctx.getImageData(0, 0, W, H).data;
          const at = (x,y)=>{ const i=(y*W+x)*4; return [d[i],d[i+1],d[i+2]]; };

          // border ring statistics (mean + spread) → adaptive threshold
          const border=[];
          for(let x=0;x<W;x+=4){ border.push(at(x,0)); border.push(at(x,H-1)); }
          for(let y=0;y<H;y+=4){ border.push(at(0,y)); border.push(at(W-1,y)); }
          const mean=border.reduce((a,v)=>[a[0]+v[0],a[1]+v[1],a[2]+v[2]],[0,0,0]).map(v=>v/border.length);
          const spread=Math.sqrt(border.reduce((a,v)=>a+Math.hypot(v[0]-mean[0],v[1]-mean[1],v[2]-mean[2])**2,0)/border.length);
          const THRESH = clamp(spread*2.1, 34, 85);
          const isFg=(r,g,b)=>Math.hypot(r-mean[0],g-mean[1],b-mean[2])>THRESH;

          // Full run list for a row (used once per row for the main scan, and
          // re-used on a handful of top rows to look for a NECKLINE GAP — in
          // a real worn-garment photo, a V/scoop neckline shows as a break of
          // background/skin between two separate silhouette lobes, not a
          // pointed outer edge; a crew/boat neckline shows no break at all.
          function scanRuns(y){
            const list=[]; let x=0;
            while(x<W){
              if(isFg(...at(x,y))){ const s=x; while(x<W && isFg(...at(x,y))) x++; list.push({l:s,r:x-1,w:x-s,cx:(s+x-1)/2}); }
              else x++;
            }
            return list;
          }
          // per-row largest contiguous run, biased toward vertical continuity
          const runs = new Array(H).fill(null);           // {l,r,w,cx}
          let centerEst = W/2;
          for(let y=0;y<H;y++){
            const list=scanRuns(y); let best=null;
            list.forEach(r=>{ const score=r.w-Math.abs(r.cx-centerEst)*0.15; if(!best||score>best.score) best={...r,score}; });
            if(best){ runs[y]=best; centerEst = centerEst*0.75 + best.cx*0.25; }
          }
          const widthAt = y => runs[y] ? runs[y].w : 0;
          let minY=H, maxY=0, rowsFound=0;
          for(let y=0;y<H;y++) if(runs[y] && runs[y].w > W*0.035){ rowsFound++; if(y<minY)minY=y; if(y>maxY)maxY=y; }
          if(rowsFound < H*0.12){ resolve({ ok:false }); return; }

          const gh = Math.max(1, maxY-minY);
          const atF = f => widthAt(clamp(Math.round(minY+gh*f),0,H-1));
          const runAtF = f => runs[clamp(Math.round(minY+gh*f),0,H-1)];
          const maxW = Math.max(1, ...Array.from({length:maxY-minY+1},(_,i)=>widthAt(minY+i)));
          const shoulderW = Math.max(atF(0.09), atF(0.14), atF(0.18));

          // gap scan: look for 2+ runs (a break) near the centre on rows
          // through the top ~22% of the garment
          const gapFracs = [0.03,0.06,0.09,0.13,0.17,0.21];
          let firstGapFrac = null;
          for(const f of gapFracs){
            const y = clamp(Math.round(minY+gh*f),0,H-1);
            const wide = scanRuns(y).filter(r=>r.w > shoulderW*0.10);
            const hasBreak = wide.some((r,i)=> i>0 && (r.l - wide[i-1].r) > shoulderW*0.07
              && Math.abs(((wide[i-1].r+r.l)/2) - centerEst) < shoulderW*0.6);
            if(hasBreak){ firstGapFrac = f; break; }
          }
          const w0 = atF(0.02)||1;
          const topGrowth = w0/Math.max(1,shoulderW);   // ~1 → solid coverage right to the top edge
          let neckline;
          if(firstGapFrac!=null && firstGapFrac<=0.06) neckline = "v";
          else if(firstGapFrac!=null) neckline = "round";
          else if(topGrowth > 0.92 && w0/Math.max(1,maxW) > 0.85) neckline = "offshoulder";
          else if(topGrowth > 0.75) neckline = "boat";
          else neckline = "round";

          // hem read: compare left/right extents + a middle dip/rise near the hem
          const hemRow = runAtF(0.97), aboveHemRow = runAtF(0.88);
          let hemShape = "straight";
          if(hemRow && aboveHemRow){
            const leftDrift = hemRow.l - aboveHemRow.l, rightDrift = aboveHemRow.r - hemRow.r;
            if(Math.abs(leftDrift-rightDrift) > gh*0.05) hemShape = "asymmetric";
            else if(Math.max(leftDrift,rightDrift) > gh*0.06) hemShape = "curved";
          }

          const chestW = Math.max(1, atF(0.26));
          const waistW = Math.min(atF(0.44), atF(0.50), atF(0.56)) || maxW;
          const hemW = Math.max(atF(0.90), atF(0.96), atF(0.99));

          // colour: sample small patches at the torso centre and near the hem
          // (patch sampling, not a global average) — far less "muddy" than
          // averaging every foreground pixel including shadow/highlight noise.
          const patch=(fy)=>{ const row=runAtF(fy); if(!row) return null;
            const cx=Math.round(row.cx), cy=clamp(Math.round(minY+gh*fy),0,H-1);
            let r=0,g=0,b=0,n=0;
            for(let dy=-2;dy<=2;dy++) for(let dx=-4;dx<=4;dx++){
              const x=cx+dx,y=cy+dy; if(x<0||x>=W||y<0||y>=H) continue;
              const p=at(x,y); r+=p[0];g+=p[1];b+=p[2];n++;
            }
            return n ? `rgb(${Math.round(r/n)},${Math.round(g/n)},${Math.round(b/n)})` : null;
          };
          const color = patch(0.40) || patch(0.6);
          const colorHem = patch(0.92);

          resolve({
            ok: true,
            heightFrac: +(gh/H).toFixed(2),
            aspect: +(gh/maxW).toFixed(2),
            flare: +(hemW/chestW).toFixed(2),
            waistRatio: +(waistW/Math.max(1,shoulderW)).toFixed(2),
            sleeveFactor: +(Math.max(0,(shoulderW-chestW)/chestW).toFixed(2)),
            neckline, hemShape, color, colorHem,
            twoTone: !!(color && colorHem && colorDist(color,colorHem) > 60),
          });
        } catch(e){ resolve({ ok:false }); }
      };
      img.onerror = () => resolve({ ok:false });
      img.src = dataURL;
    });
  }
  function colorDist(a,b){ const pa=/(\d+)\D+(\d+)\D+(\d+)/.exec(a), pb=/(\d+)\D+(\d+)\D+(\d+)/.exec(b);
    if(!pa||!pb) return 0; return Math.hypot(pa[1]-pb[1],pa[2]-pb[2],pa[3]-pb[3]); }

  // ---------- prompt + metrics → style parameters ----------
  function deriveStyle({ metrics, prompt, category, imageDataURL }){
    const t = (prompt||"").toLowerCase();
    // "long sleeve" / "كم طويل" should never register as a GARMENT-length
    // signal — mask sleeve-adjacent long/short mentions before reading length,
    // so "short dress with long sleeves" doesn't get read as a long dress.
    const tLen = t
      .replace(/\b(long|short)([- ]?sleeve)/g, "$2")
      .replace(/(كم|أكمام)\s*(طويل[ةه]?|قصير[ةه]?)/g, "$1")
      .replace(/(طويل[ةه]?|قصير[ةه]?)\s*(كم|أكمام)/g, "$2");
    const seed = `${prompt||""}|${category}|${imageDataURL?imageDataURL.length:0}`;
    const s = { type:null, lengthF:1, flareF:1, fitF:1, sleeveLenF:1, sleeveWideF:1, neckline:null, hemShape:null, wrap:false, color:null };
    const hasImg = metrics && metrics.ok;

    if(/shirt|بلوز|قميص/.test(t)) s.type="shirt";
    else if(/abaya|kaftan|caftan|robe|عباية|قفطان/.test(t)) s.type="robe";
    else if(/thobe|ثوب/.test(t)) s.type="robe";
    else if(/trouser|pant|jean|بنطلون|سروال/.test(t)) s.type="trousers";
    else if(/skirt|تنورة|جيبة/.test(t)) s.type="skirt";
    else if(/dress|gown|frock|فستان/.test(t)) s.type="dress";
    else if(/top|blouse|tee|توب/.test(t)) s.type="top";
    if(!s.type && hasImg){
      const hf = metrics.heightFrac;
      s.type = hf<0.5 ? "top" : hf>0.82 ? "robe" : "dress";
    }
    if(!s.type){
      // no prompt keyword, no usable image: vary by category + seed instead
      // of always the same default, so blank/vague requests aren't identical.
      const byCat = { women:["dress","top","skirt"], men:["shirt","trousers","robe"], girls:["dress","skirt","top"], boys:["shirt","trousers"] };
      s.type = pick(seed, byCat[category] || ["dress"]);
    }

    // length — prompt wins (sleeve-adjacent long/short already masked out of tLen);
    // otherwise image fill-fraction; otherwise seeded variety
    if(/maxi|floor|full[- ]?length|ankle|long|طويل/.test(tLen)) s.lengthF=1.35;
    else if(/midi/.test(tLen)) s.lengthF=1.1;
    else if(/mini|crop|cropped|short|قصير/.test(tLen)) s.lengthF=0.7;
    else if(hasImg && metrics.heightFrac!=null){
      const hf=metrics.heightFrac;
      s.lengthF *= hf>0.85 ? 1.3 : hf>0.65 ? 1.05 : hf<0.42 ? 0.62 : hf<0.55 ? 0.8 : 1;
    } else {
      s.lengthF = pick(seed+"len",[0.85,1.0,1.1,1.25]);
    }

    // flare
    if(/a[- ]?line|flare|flared|circle|skater|swing|كلوش|واسع/.test(t)) s.flareF=1.5;
    else if(/pencil|straight|bodycon|column|قلم|مستقيم/.test(t)) s.flareF=0.9;
    else if(hasImg) s.flareF *= metrics.flare>1.3 ? 1.4 : metrics.flare<0.95 ? 0.85 : 1;
    else s.flareF = pick(seed+"flare",[0.9,1.0,1.25,1.5]);

    // fit / waist suppression
    if(/fitted|bodycon|slim|tailored|ضيق|مخصر/.test(t)) s.fitF=0.82;
    else if(/loose|oversized|relaxed|boxy|فضفاض|واسع/.test(t)) s.fitF=1.16;
    else if(hasImg && metrics.waistRatio < 0.85) s.fitF = 0.85;
    else if(!hasImg) s.fitF = pick(seed+"fit",[0.88,1.0,1.12]);

    // sleeves
    if(/sleeveless|tank|strap|بدون\s*(كم|أكمام)|بلا\s*(كم|أكمام)/.test(t)) s.sleeveLenF=0;
    else if(/long[- ]?sleeve|full[- ]?sleeve|(كم|أكمام)\s*طويل[ةه]?/.test(t)) s.sleeveLenF=1.3;
    else if(/3\/4|three[- ]?quarter|٣\/٤|ثلاثة\s*أرباع/.test(t)) s.sleeveLenF=0.8;
    else if(/short[- ]?sleeve|cap[- ]?sleeve|(كم|أكمام)\s*قصير[ةه]?/.test(t)) s.sleeveLenF=0.45;
    else if(hasImg){
      if(metrics.sleeveFactor > 0.28) s.sleeveLenF = Math.max(s.sleeveLenF, 1.0);
      else if(metrics.sleeveFactor < 0.07) s.sleeveLenF = 0.55;
    } else if(!/halter/.test(t)) {
      s.sleeveLenF = pick(seed+"slv",[0,0.45,0.8,1.0,1.3]);
    }
    if(/puff|balloon|bishop|bell|wide sleeve|منفوش|واسع الكم/.test(t)) s.sleeveWideF=1.6;
    else if(hasImg && metrics.sleeveFactor > 0.28) s.sleeveWideF = 1.4;
    else if(!hasImg && s.sleeveLenF>0.05) s.sleeveWideF = pick(seed+"slvw",[1.0,1.0,1.15,1.5]);

    // neckline — prompt > image > seeded variety (only for garments with a neckline)
    if(/halter/.test(t)) s.neckline="halter";
    else if(/off[- ]?shoulder/.test(t)) s.neckline="offshoulder";
    else if(/v[- ]?neck|فتحة V/.test(t)) s.neckline="v";
    else if(/boat neck|square neck/.test(t)) s.neckline="boat";
    else if(/round neck|crew neck/.test(t)) s.neckline="round";
    else if(/collar|ياقة/.test(t)) s.neckline="collar";
    else if(hasImg && metrics.neckline) s.neckline = metrics.neckline;
    else {
      const opts = (s.type==="shirt") ? ["collar","round","v"] : ["v","round","boat","offshoulder","halter"];
      s.neckline = pick(seed+"neck", opts);
    }

    // hem shape — prompt > image > seeded variety
    if(/high[- ]?low|asymmetric hem/.test(t)) s.hemShape="highlow";
    else if(/curved hem|round(ed)? hem/.test(t)) s.hemShape="curved";
    else if(/straight hem/.test(t)) s.hemShape="straight";
    else if(hasImg && metrics.hemShape) s.hemShape = metrics.hemShape;
    else s.hemShape = pick(seed+"hem", ["straight","straight","curved","highlow"]);

    // wrap closure — prompt > seeded variety (dresses/tops/robes/skirts only)
    if(/wrap/.test(t)) s.wrap = true;
    else if(!/button|zip|collar/.test(t) && ["dress","top","robe","skirt"].includes(s.type)) s.wrap = pick(seed+"wrap",[false,false,false,true]);

    s.color = (hasImg && metrics.color) || null;
    if(!s.color) s.color = pick(seed+"color", SEED_COLORS);
    s.twoTone = hasImg && metrics.twoTone;
    s.colorHem = hasImg ? metrics.colorHem : null;

    s.lengthF=clamp(s.lengthF,0.55,1.6); s.flareF=clamp(s.flareF,0.82,1.9);
    s.fitF=clamp(s.fitF,0.72,1.28); s.sleeveLenF=clamp(s.sleeveLenF,0,1.5); s.sleeveWideF=clamp(s.sleeveWideF,0.8,2);
    return s;
  }

  // ---------- geometry helpers for construction variety ----------
  // Neckline points replacing the fixed corner at the garment's top-centre.
  // `half` = half chest width at the neckline row; returns an array of
  // [x,y] points to splice in place of a single flat corner.
  function necklinePts(style, half, y0){
    switch(style.neckline){
      case "v": return [[0,y0+half*0.9],[half*0.55,y0]];
      case "boat": return [[0,y0+2],[half*0.85,y0]];
      case "offshoulder": return [[0,y0+half*0.6],[half*1.05,y0+half*0.35]];
      case "halter": return [[0,y0+half*1.1],[half*0.3,y0-2]];
      case "collar": return [[0,y0+3],[half*0.65,y0]];
      default: return [[0,y0+half*0.55],[half*0.7,y0]]; // round
    }
  }
  // Hem edge between the two outer hem corners (front/back share the call
  // with a `side` flip so front+back stay mirrored/coherent).
  function hemPts(style, xL, xR, y, gh, side){
    const dip = gh*0.05;
    switch(style.hemShape){
      case "curved": return [[xR,y-dip],[  (xL+xR)/2, y+dip*0.6],[xL,y-dip]];
      case "highlow": return side==="front" ? [[xR,y-gh*0.10],[xL,y-gh*0.10]] : [[xR,y+gh*0.06],[xL,y+gh*0.06]];
      case "asymmetric": return [[xR,y-gh*0.09],[xL,y+gh*0.03]];
      default: return [[xR,y],[xL,y]];
    }
  }

  // ---------- parametric builders ----------
  function build(style, m){
    let pieces;
    if(style.type==="trousers") pieces = buildTrousers(style,m);
    else if(style.type==="skirt") pieces = buildSkirt(style,m);
    else pieces = buildTop(style,m);
    const colors = paletteFor(style.color, style.colorHem);
    return { pieces, colors, colorInt: style.color ? rgbToInt(style.color) : null };
  }

  function buildTop(style, m){
    const fit=style.fitF, bod=m.backLen;
    const lenBase = { top:bod+22, shirt:bod+34, dress:bod+62, robe:m.height-26 }[style.type] || bod+56;
    const gh = clamp(lenBase*style.lengthF, bod+16, m.height);
    const chestW=(q(m.chest)+2)*fit, waistW=(q(m.waist)+3)*fit, hipW=(q(m.hips)+2)*fit;
    const hemW  = Math.max(hipW, hipW*style.flareF);
    const en=EN_TYPE[style.type]||"Panel", ar=AR_TYPE[style.type]||"القطعة";
    const waistDart = (fit<0.92 && !style.wrap) ? [[[waistW*0.5, bod-9],[waistW*0.5-2, bod],[waistW*0.5+2, bod]]] : [];
    const wrapCut = style.wrap ? hemW*0.32 : 0;   // front overlap skew for wrap styles

    const neckFront = necklinePts(style, chestW*0.42, 1);
    const neckBack  = necklinePts({ ...style, neckline: style.neckline==="v"?"round":style.neckline }, chestW*0.3, 1.5);
    const hemFront  = hemPts(style, 0-wrapCut, hemW, gh, gh, "front");
    const hemBack   = hemPts(style, 0, hemW, gh, gh, "back");

    const front = {
      name:{en:en+" Front", ar:"مقدمة "+ar},
      desc:{en:"Generated front — neckline, hem and fit read from the reference.",
            ar:"قطعة أمامية مولّدة — فتحة الرقبة والحاشية والقصّة من المرجع."},
      outline:[...neckFront,[chestW,3],[chestW+1,bod*0.5],[waistW+1,bod],
               [hipW+1,bod+(gh-bod)*0.42], ...hemFront],
      darts:waistDart, notches:[[chestW,3],[waistW+1,bod]],
      grain:[[chestW*0.5,9],[chestW*0.5,gh-6]],
    };
    const back = {
      name:{en:en+" Back", ar:"ظهر "+ar},
      desc:{en:"Generated back panel — mirrors the front block.",
            ar:"قطعة خلفية مولّدة — تقابل القطعة الأمامية."},
      outline:[...neckBack,[chestW,3.5],[chestW+1,bod*0.5],[waistW+0.5,bod],
               [hipW+0.5,bod+(gh-bod)*0.42], ...hemBack],
      darts:waistDart, notches:[[chestW,3.5]],
      grain:[[2,9],[2,gh-6]],
    };
    const pieces=[front, back];

    if(style.sleeveLenF > 0.05){
      const slen=clamp(m.sleeve*style.sleeveLenF, 8, m.sleeve*1.35);
      const bic=q(m.bicep)*style.sleeveWideF, cap=6*style.sleeveWideF;
      pieces.push({
        name:{en:"Sleeve", ar:"كم"},
        desc:{en:"Generated sleeve — length and width read from the reference.",
              ar:"كم مولّد — الطول والاتساع من المرجع."},
        outline:[[0,0],[bic,-cap],[bic*2,0],[bic*2-1,slen],[1,slen]],
        darts:[], notches:[[bic,-cap]],
        grain:[[bic,4],[bic,slen-4]],
      });
    }
    if(style.neckline==="collar" && style.type==="shirt"){
      const nc = m.neck/2+3;
      pieces.push({
        name:{en:"Collar & Stand", ar:"الياقة والقاعدة"},
        desc:{en:"Two-piece collar for the button-front neckline.", ar:"ياقة من قطعتين لفتحة الأزرار الأمامية."},
        outline:[[0,0],[nc,0],[nc,7],[0,8]], darts:[], notches:[],
        grain:[[2,2],[nc-2,2]],
      });
    }
    if(style.wrap){
      pieces.push({
        name:{en:"Tie Sash", ar:"حزام ربط"},
        desc:{en:"Self-fabric sash for the wrap closure.", ar:"حزام من نفس القماش لإغلاق الفستان الملفوف."},
        outline:[[0,0],[8,0],[8,110],[0,110]], darts:[], notches:[],
        grain:[[4,10],[4,100]],
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
    const gh=clamp(m.inseam*0.6*style.lengthF, 20, m.inseam);
    const hem=Math.max(w, w*style.flareF);
    const wrapCut = style.wrap ? w*0.4 : 0;
    const panel=(en,ar,side)=>{
      const hemLine = hemPts(style, side==="front"?-wrapCut:0, hem, gh, gh, side);
      return { name:{en, ar},
        desc:{en:"Generated skirt panel — flare and hem read from the reference.", ar:"بنل تنورة مولّد — الاتساع والحاشية من المرجع."},
        outline:[[0,0],[w,0],...hemLine], grain:[[w/2,5],[w/2,gh-5]] };
    };
    const band={ name:{en:"Waistband", ar:"الحزام"},
      desc:{en:"Generated waistband.", ar:"حزام مولّد."},
      outline:[[0,0],[m.waist*fit+4,0],[m.waist*fit+4,7],[0,7]], grain:[[3,2],[m.waist*fit,2]] };
    const pieces=[panel("Front Skirt","تنورة أمامية","front"), panel("Back Skirt","تنورة خلفية","back"), band];
    if(style.wrap) pieces.push({ name:{en:"Tie Sash", ar:"حزام ربط"}, desc:{en:"Self-fabric sash for the wrap closure.", ar:"حزام من نفس القماش لإغلاق التنورة الملفوفة."},
      outline:[[0,0],[7,0],[7,90],[0,90]], grain:[[3.5,8],[3.5,82]] });
    return pieces;
  }

  // ---------- thinking-stage summary text ----------
  const NECK_LABEL = { v:{en:"V-neck",ar:"فتحة V"}, round:{en:"round neck",ar:"فتحة دائرية"}, boat:{en:"boat neck",ar:"فتحة قارب"},
    offshoulder:{en:"off-shoulder",ar:"كتف مكشوف"}, halter:{en:"halter",ar:"حمالة رقبة"}, collar:{en:"collared",ar:"بياقة"} };
  const HEM_LABEL = { straight:{en:"straight hem",ar:"حاشية مستقيمة"}, curved:{en:"curved hem",ar:"حاشية منحنية"},
    highlow:{en:"high-low hem",ar:"حاشية متدرجة"}, asymmetric:{en:"asymmetric hem",ar:"حاشية غير متماثلة"} };

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
    const hasNeck = ["dress","top","shirt","robe"].includes(style.type) && NECK_LABEL[style.neckline];
    const neck = hasNeck ? NECK_LABEL[style.neckline][lang==="ar"?"ar":"en"] : null;
    const hem = HEM_LABEL[style.hemShape] ? HEM_LABEL[style.hemShape][lang==="ar"?"ar":"en"] : null;
    const wrapTxt = style.wrap ? (lang==="ar"?"ملفوف":"wrap") : null;
    if(lang==="ar"){
      const bits=[ar.type, ar.len, ar.flare, wrapTxt, neck, hem, ar.slv].filter(Boolean);
      return bits.join(" · ");
    }
    const bits=[en.len, wrapTxt, en.flare, en.type, neck, hem, en.slv].filter(Boolean);
    return bits.join(" · ");
  }
  // structured attribute chips for the "detected" panel in the UI
  function attributes(style, lang){
    const ar = lang==="ar";
    const out = [];
    out.push({ k:"type", label: ar?"النوع":"Type", value: ar?(AR_TYPE[style.type]||"—"):(EN_TYPE[style.type]||"—") });
    out.push({ k:"length", label: ar?"الطول":"Length", value: style.lengthF>=1.2?(ar?"طويل":"Long"):style.lengthF<=0.82?(ar?"قصير":"Short"):(ar?"متوسط":"Regular") });
    out.push({ k:"flare", label: ar?"الاتساع":"Flare", value: style.flareF>=1.25?(ar?"واسع":"Flared"):style.flareF<=0.92?(ar?"ضيق":"Fitted"):(ar?"مستقيم":"Straight") });
    if(["dress","top","shirt","robe"].includes(style.type)){
      out.push({ k:"sleeve", label: ar?"الكم":"Sleeve", value: style.sleeveLenF<=0.05?(ar?"بدون كم":"Sleeveless"):style.sleeveWideF>=1.4?(ar?"واسع":"Wide"):style.sleeveLenF>=1.2?(ar?"طويل":"Long"):style.sleeveLenF<=0.5?(ar?"قصير":"Short"):(ar?"عادي":"Regular") });
      if(NECK_LABEL[style.neckline]) out.push({ k:"neckline", label: ar?"فتحة الرقبة":"Neckline", value: NECK_LABEL[style.neckline][ar?"ar":"en"] });
    }
    if(HEM_LABEL[style.hemShape]) out.push({ k:"hem", label: ar?"الحاشية":"Hem", value: HEM_LABEL[style.hemShape][ar?"ar":"en"] });
    if(style.wrap) out.push({ k:"closure", label: ar?"الإغلاق":"Closure", value: ar?"ملفوف":"Wrap" });
    out.push({ k:"color", label: ar?"اللون":"Colour", value: style.color, swatch:true });
    return out;
  }

  // ---------- colours ----------
  function rgbToInt(rgb){ const m=/(\d+)\D+(\d+)\D+(\d+)/.exec(rgb||""); if(!m) return null; return (+m[1]<<16)|(+m[2]<<8)|+m[3]; }
  function shade(rgb, delta){ const m=/(\d+)\D+(\d+)\D+(\d+)/.exec(rgb); if(!m) return rgb;
    const c=[+m[1],+m[2],+m[3]].map(v=>clamp(Math.round(v+delta),0,255)); return `rgb(${c[0]},${c[1]},${c[2]})`; }
  function paletteFor(color, colorHem){ if(!color) return DEFAULT_COLORS.slice();
    const base=[color, shade(color,-22), shade(color,22), shade(color,-40), shade(color,40), shade(color,-60)];
    if(colorHem) base[2]=colorHem;
    return base; }

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

  // ---------- orchestrator (with a visible "thinking" stage sequence) ----------
  const STAGE_MS = 380;
  const wait = (ms) => new Promise(r=>setTimeout(r,ms));
  async function generate({ prompt, imageDataURL, category, measurements, endpoint, lang, onStage }){
    const stage = (key) => { if(onStage) onStage(key); };

    // 1) remote path if configured — falls back to local on any failure
    if(endpoint){
      stage("analyzing");
      try {
        const r = await remote(endpoint, { prompt, image:imageDataURL, category, measurements });
        if(r && Array.isArray(r.pieces) && r.pieces.length){
          stage("done");
          return { pieces:r.pieces, colors:r.colors||DEFAULT_COLORS.slice(), colorInt:null, summary:r.summary||"", source:"remote" };
        }
        if(r && r.style){
          const style = { ...deriveStyle({metrics:null,prompt,category,imageDataURL}), ...r.style };
          const built = build(style, measurements);
          stage("done");
          return { ...built, summary: r.summary || summary(style, lang), style, source:"remote", attributes: attributes(style, lang) };
        }
      } catch(e){ /* fall through to local */ }
    }

    // 2) local: visible multi-stage silhouette analysis + drafting
    stage("analyzing");
    const metrics = imageDataURL ? await analyzeImage(imageDataURL) : null;
    await wait(STAGE_MS);

    stage("silhouette");
    await wait(STAGE_MS);
    const style = deriveStyle({ metrics, prompt, category, imageDataURL });

    stage("drafting");
    await wait(STAGE_MS);
    const built = build(style, measurements);

    stage("done");
    return { ...built, summary: summary(style, lang), style, attributes: attributes(style, lang),
             source:"local", usedImage: !!(metrics && metrics.ok) };
  }

  return { analyzeImage, deriveStyle, build, summary, attributes, generate };
})();
