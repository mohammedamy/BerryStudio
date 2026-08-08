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

   Honesty note: the local path's DEFAULT segmentation is a lightweight
   heuristic, not real computer vision — a border-adaptive threshold +
   largest-contiguous-run-per-row (robust to background clutter that
   simple corner-sampling isn't), then neckline/hem shape read from the
   silhouette profile. It still misreads busy or low-contrast photos
   (a dark garment against a dark background, in particular, since the
   whole approach is a colour-distance-from-border test) — when it can't
   get a confident read it falls back to prompt text, then to
   deterministic (input-seeded, not random) variety so the same input
   always reproduces the same result, but different inputs actually look
   different.

   BerryStudio-Upgrade-Plan-v2.0 WP-39: `analyzeImage(dataURL, opts)`
   accepts an optional `opts.segment(imageData) -> Promise<{width,height,
   data}>` callback — a real, learned foreground/background matte (0..1
   alpha per pixel), used in place of the colour-threshold test when
   supplied. Everything downstream (per-row largest-run scan, neckline-
   gap detection, hem-shape read) is UNCHANGED either way — only which
   pixels count as "foreground" changes. No `opts`/a callback that
   returns nothing usable falls back to the exact heuristic above, byte-
   identical to before this WP (see js/app.js's `getSegmentFn()` for what
   actually supplies the callback, and js/workers/local-model-worker.js's
   own honesty notes for what the real model behind it can and can't do).
   ============================================================ */
import { computePleats, computeGatherWidth, computeTucks } from './pleats.js';
export const AIGen = (() => {
  const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
  const q = v => v / 4;
  const DEFAULT_COLORS = ["#6d5efc","#00c2a8","#ff5d8f","#e2a52b","#4c8dff","#c1492e"];
  // curated fashion palette used to add colour variety when no image colour is available
  const SEED_COLORS = ["#b5495b","#2f6d6d","#c98a3e","#5b5ea6","#7a8450","#8a4f7d","#3d6b8a","#a65b3c","#4f7d5c","#8a3d5c"];

  const AR_TYPE = { dress:"الفستان", robe:"العباية", top:"التوب", shirt:"القميص", trousers:"البنطلون", skirt:"التنورة", romper:"الأفرول", leotard:"الليوتارد" };
  const EN_TYPE = { dress:"Dress", robe:"Robe", top:"Top", shirt:"Shirt", trousers:"Trousers", skirt:"Skirt", romper:"Romper", leotard:"Leotard" };

  // deterministic string hash → used to pick "unspecified" attributes so
  // the SAME input always reproduces the SAME result, but different
  // prompts/images land on different construction choices.
  function hashStr(s){ let h=0; for(let i=0;i<s.length;i++){ h=(h*31+s.charCodeAt(i))|0; } return Math.abs(h); }
  function pick(seed, options){ return options[hashStr(seed) % options.length]; }

  // ---------- image silhouette analysis ----------
  // Nearest-neighbour lookup from a WxH working-canvas coordinate into a
  // (typically different-resolution) alpha matte's own grid — a pure,
  // independently-testable function since it's the one piece of WP-39's
  // segmentation path with real "did I map coordinates correctly" logic
  // (everything else is either the untouched pre-existing scan or a thin
  // pass-through to a real model).
  function sampleMatte(matte, W, H, x, y){
    const mx = Math.min(matte.width-1, Math.max(0, Math.floor(x / W * matte.width)));
    const my = Math.min(matte.height-1, Math.max(0, Math.floor(y / H * matte.height)));
    return matte.data[my*matte.width + mx];
  }

  // Segmentation: by default, an adaptive threshold from the border ring's
  // colour statistics (see analyzeImage's own honesty note above for when
  // this misreads); a real learned matte when `opts.segment` is supplied
  // and succeeds. Either way, per-row the LARGEST CONTIGUOUS run of
  // foreground pixels (not just min/max of any foreground pixel) — this is
  // what makes it tolerant of background clutter/noise instead of latching
  // onto an unrelated bright pixel far from the subject.
  function analyzeImage(dataURL, opts={}){
    return new Promise((resolve)=>{
      if(!dataURL){ resolve(null); return; }
      const img = new Image();
      img.onload = async () => {
        try {
          const W = 180, H = Math.max(1, Math.round(W * img.height / img.width));
          const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
          const ctx = cv.getContext("2d"); ctx.drawImage(img, 0, 0, W, H);
          const imageData = ctx.getImageData(0, 0, W, H);
          const d = imageData.data;
          const at = (x,y)=>{ const i=(y*W+x)*4; return [d[i],d[i+1],d[i+2]]; };

          let isFg, segmented=false;
          if(opts.segment){
            try {
              const matte = await opts.segment(imageData);
              if(matte && matte.data && matte.width>0 && matte.height>0){
                isFg = (x,y) => sampleMatte(matte, W, H, x, y) > 0.5;
                segmented = true;
              }
            } catch(e){ /* segmentation failed — fall through to the threshold scan below, honestly, not a hard error */ }
          }
          if(!isFg){
            // border ring statistics (mean + spread) → adaptive threshold
            const border=[];
            for(let x=0;x<W;x+=4){ border.push(at(x,0)); border.push(at(x,H-1)); }
            for(let y=0;y<H;y+=4){ border.push(at(0,y)); border.push(at(W-1,y)); }
            const mean=border.reduce((a,v)=>[a[0]+v[0],a[1]+v[1],a[2]+v[2]],[0,0,0]).map(v=>v/border.length);
            const spread=Math.sqrt(border.reduce((a,v)=>a+Math.hypot(v[0]-mean[0],v[1]-mean[1],v[2]-mean[2])**2,0)/border.length);
            const THRESH = clamp(spread*2.1, 34, 85);
            isFg=(x,y)=>{ const [r,g,b]=at(x,y); return Math.hypot(r-mean[0],g-mean[1],b-mean[2])>THRESH; };
          }

          // Full run list for a row (used once per row for the main scan, and
          // re-used on a handful of top rows to look for a NECKLINE GAP — in
          // a real worn-garment photo, a V/scoop neckline shows as a break of
          // background/skin between two separate silhouette lobes, not a
          // pointed outer edge; a crew/boat neckline shows no break at all.
          function scanRuns(y){
            const list=[]; let x=0;
            while(x<W){
              if(isFg(x,y)){ const s=x; while(x<W && isFg(x,y)) x++; list.push({l:s,r:x-1,w:x-s,cx:(s+x-1)/2}); }
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
            segmented, // WP-39: true when a real matte (not the colour-threshold heuristic) was used
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
    const s = { type:null, lengthF:1, flareF:1, fitF:1, sleeveLenF:1, sleeveWideF:1, neckline:null, hemShape:null, wrap:false, zip:false, color:null };
    const hasImg = metrics && metrics.ok;

    // romper/jumpsuit must be checked BEFORE dress/top — a one-piece
    // bodice+shorts garment would otherwise be misclassified as a plain
    // dress by the generic /dress|gown|frock/ pattern below.
    if(/romper|jumpsuit|playsuit|أفرول/.test(t)) s.type="romper";
    else if(/shirt|بلوز|قميص/.test(t)) s.type="shirt";
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
    // "regular/medium/knee length" — an explicit request for the category's
    // own standard length, not "unspecified". Previously fell through to the
    // hasImg/seeded-pick branches below like a blank prompt would, so typing
    // this literal, common phrase couldn't actually pin the length; the
    // Guided Prompt Builder's "Medium" length option relies on this too.
    else if(/regular length|medium length|knee[- ]length|طول عادي|طول متوسط/.test(tLen)) s.lengthF=1;
    else if(hasImg && metrics.heightFrac!=null){
      const hf=metrics.heightFrac;
      s.lengthF *= hf>0.85 ? 1.3 : hf>0.65 ? 1.05 : hf<0.42 ? 0.62 : hf<0.55 ? 0.8 : 1;
    } else {
      s.lengthF = pick(seed+"len",[0.85,1.0,1.1,1.25]);
    }

    // flare
    if(/a[- ]?line|flare|flared|circle|skater|swing|كلوش|واسع/.test(t)) s.flareF=1.5;
    else if(/pencil|straight|bodycon|column|قلم|مستقيم/.test(t)) s.flareF=0.9;
    // "regular silhouette" — explicit neutral, distinct from the pencil/
    // a-line bucket regexes above and from "unspecified" below. Gives the
    // Guided Prompt Builder's "Full" middle option a deterministic result
    // instead of falling to seeded pick like an unspecified prompt would.
    else if(/regular silhouette|قصة عادية/.test(t)) s.flareF=1;
    else if(hasImg) s.flareF *= metrics.flare>1.3 ? 1.4 : metrics.flare<0.95 ? 0.85 : 1;
    else s.flareF = pick(seed+"flare",[0.9,1.0,1.25,1.5]);

    // fit / waist suppression
    if(/fitted|bodycon|slim|tailored|ضيق|مخصر/.test(t)) s.fitF=0.82;
    else if(/loose|oversized|relaxed|boxy|فضفاض|واسع/.test(t)) s.fitF=1.16;
    // "regular fit" — same idea as "regular silhouette" above: an explicit
    // neutral choice, not a stand-in for "the prompt didn't say".
    else if(/regular fit|قصة معتادة/.test(t)) s.fitF=1;
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
    else if(/mock[- ]?neck|stand[- ]?collar|turtleneck|ياقة قائمة|ياقة عالية/.test(t)) s.neckline="mock";
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

    // zip closure — prompt only; a real construction detail (front zip
    // facing), not something worth guessing at when unspecified.
    s.zip = /\bzip(per)?\b|سحاب|سوستة/.test(t);

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
      case "mock": return [[0,y0+2],[half*0.45,y0-1]]; // short, close, slightly raised stand neckline
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
    else if(style.type==="romper") pieces = buildRomper(style,m);
    else if(style.type==="leotard") pieces = buildLeotard(style,m);
    else pieces = buildTop(style,m);
    const colors = paletteFor(style.color, style.colorHem);
    return { pieces, colors, colorInt: style.color ? rgbToInt(style.color) : null };
  }

  // Shared set-in sleeve builder (buildTop and buildRomper draft the
  // identical shape). WP-20: the sleeve cap's finished width normally
  // comes straight from sleeveWideF (2x the bicep-based half-width) —
  // style.sleeveGatherRatio/sleevePleatCount/sleeveTuckCount (mutually
  // exclusive; Quick Draft's UI only ever sets one) widen it using the
  // exact same added-width math js/pleats.js already established for
  // skirts, eased/folded back down to that same finished cap width — a
  // real gathered/pleated/tucked sleeve cap, not a cosmetic label. capW
  // stays exactly bic*2 (byte-identical to before this option existed)
  // when none of the three are set.
  function sleevePiece(style, m){
    const slen=clamp(m.sleeve*style.sleeveLenF, 8, m.sleeve*1.35);
    const bic=q(m.bicep)*style.sleeveWideF, cap=6*style.sleeveWideF;
    const finishedCapW = bic*2;
    let capW = finishedCapW, capMeta = null;
    if (style.sleeveGatherRatio > 1){
      capW = computeGatherWidth(finishedCapW, style.sleeveGatherRatio);
    } else if (style.sleevePleatCount){
      const { addedWidthCm, pleats } = computePleats(finishedCapW, style.sleevePleatCount, 1.5);
      capW = finishedCapW + addedWidthCm; capMeta = pleats;
    } else if (style.sleeveTuckCount){
      const { addedWidthCm, pleats } = computeTucks(finishedCapW, style.sleeveTuckCount, 1);
      capW = finishedCapW + addedWidthCm; capMeta = pleats;
    }
    const piece = {
      name:{en:"Sleeve", ar:"كم"},
      desc:{en:"Generated sleeve — length and width read from the reference.",
            ar:"كم مولّد — الطول والاتساع من المرجع."},
      outline:[[0,0],[capW/2,-cap],[capW,0],[capW-1,slen],[1,slen]],
      darts:[], notches:[[capW/2,-cap]],
      grain:[[capW/2,4],[capW/2,slen-4]],
      role:"sleeve", bilateral:true,
    };
    if (capMeta) piece.pleats = capMeta;
    return piece;
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
      // wrap styles skew the front hem's near corner off X=0 (an honest
      // asymmetric overlap, not a fold) — cutOnFold would mirror that skew
      // into a symmetric double-wide front, so wrap gets the un-folded
      // front-panel role instead of bodice-front-center.
      role: style.wrap ? "front-panel" : "bodice-front-center", cutOnFold: !style.wrap,
      // WP-24: index2 is [chestW,3] — necklinePts() always returns exactly
      // 2 points, so the chest vertex always lands there regardless of
      // neckline. Only meaningful for the cut-on-fold (non-wrap) case —
      // Ease's fold-doubling assumption doesn't hold for wrap's un-folded
      // asymmetric front, so it deliberately gets no hint.
      ...(style.wrap ? {} : { chestEdgeIndices:[2] }),
    };
    const back = {
      name:{en:en+" Back", ar:"ظهر "+ar},
      desc:{en:"Generated back panel — mirrors the front block.",
            ar:"قطعة خلفية مولّدة — تقابل القطعة الأمامية."},
      outline:[...neckBack,[chestW,3.5],[chestW+1,bod*0.5],[waistW+0.5,bod],
               [hipW+0.5,bod+(gh-bod)*0.42], ...hemBack],
      darts:waistDart, notches:[[chestW,3.5]],
      grain:[[2,9],[2,gh-6]],
      role:"bodice-back-center", cutOnFold:true, chestEdgeIndices:[2],
    };
    const pieces=[front, back];

    if(style.sleeveLenF > 0.05){
      pieces.push(sleevePiece(style, m));
    }
    if(style.neckline==="collar" && style.type==="shirt"){
      const nc = m.neck/2+3;
      pieces.push({
        name:{en:"Collar & Stand", ar:"الياقة والقاعدة"},
        desc:{en:"Two-piece collar for the button-front neckline.", ar:"ياقة من قطعتين لفتحة الأزرار الأمامية."},
        outline:[[0,0],[nc,0],[nc,7],[0,8]], darts:[], notches:[],
        grain:[[2,2],[nc-2,2]],
        role:"collar",
      });
    }
    if(style.wrap){
      pieces.push({
        name:{en:"Tie Sash", ar:"حزام ربط"},
        desc:{en:"Self-fabric sash for the wrap closure.", ar:"حزام من نفس القماش لإغلاق الفستان الملفوف."},
        outline:[[0,0],[8,0],[8,110],[0,110]], darts:[], notches:[],
        grain:[[4,10],[4,100]],
        role:"wrap-tie",
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
      outline:[[0,0],[m.waist*fit+4,0],[m.waist*fit+4,7],[0,7]], grain:[[3,2],[m.waist*fit,2]],
      role:"waistband" };
    // front/back trouser legs get no declared role: cloth-lab's WP-6 role
    // vocabulary (roles.js) covers tops/dresses/skirts, not trouser legs —
    // there's no placement heuristic for them, so leaving role undeclared
    // (rather than forcing a wrong torso/hip placement) matches the
    // existing, already-honest "skip what we don't understand" behavior.
    return [front, back, band];
  }

  function buildSkirt(style, m){
    const fit=style.fitF;
    const w=(q(m.hips)+2)*fit;
    const gh=clamp(m.inseam*0.6*style.lengthF, 20, m.inseam);
    const hem=Math.max(w, w*style.flareF);
    const wrapCut = style.wrap ? w*0.4 : 0;
    // WP-14: knife pleats add fabric at the waist edge beyond the plain
    // panel width `w` — the panel's own waist corner widens to panelW
    // while the waistband (below) still measures the body's actual
    // waist, since the extra panel width is what gets folded/pleated
    // INTO that band, not added to it. pleatCount=0 (the default before
    // this option existed) makes panelW===w — byte-identical output.
    // WP-20: gather and tuck are the same "extra waist-edge width" idea,
    // just different real techniques — gatherRatio uses computeGatherWidth
    // (a continuous ease ratio, no discrete fold positions); tuckCount
    // reuses computeTucks (shallower, stitched-shut pleats). Quick Draft's
    // UI only ever sets one of the three, but they're handled as a
    // priority chain here regardless, gather first, so nothing silently
    // combines two techniques into one waist edge.
    const pleatCount = style.pleatCount || 0;
    const tuckCount = style.tuckCount || 0;
    const gatherRatio = style.gatherRatio || 1;
    let panelW = w, waistMeta = null;
    if (gatherRatio > 1){
      panelW = computeGatherWidth(w, gatherRatio);
    } else if (pleatCount){
      const { addedWidthCm, pleats } = computePleats(w, pleatCount, 3);
      panelW = w + addedWidthCm; waistMeta = pleats;
    } else if (tuckCount){
      const { addedWidthCm, pleats } = computeTucks(w, tuckCount, 1.5);
      panelW = w + addedWidthCm; waistMeta = pleats;
    }
    // front/back panels get no declared role here: they're genuinely
    // half-width fold pieces whenever !style.wrap (like buildTop's front/
    // back), but roles.js's hip-panel-front/hip-panel-back have no
    // cutOnFold default (unlike the bodice-*-center roles) and the wrap
    // case skews the front hem off-fold the same way buildTop's does — so,
    // unlike buildTop, there's no single role name that's correct in both
    // cases. Leaving role undeclared here routes through classifyLegacy,
    // whose geometric isFoldPiece() check already handles both shapes
    // correctly (these pieces are literally named "Front Skirt"/"Back
    // Skirt", which classify() already recognizes as skirt-front/skirt-back).
    const panel=(en,ar,side)=>{
      const hemLine = hemPts(style, side==="front"?-wrapCut:0, hem, gh, gh, side);
      const piece = { name:{en, ar},
        desc:{en:"Generated skirt panel — flare and hem read from the reference.", ar:"بنل تنورة مولّد — الاتساع والحاشية من المرجع."},
        outline:[[0,0],[panelW,0],...hemLine], grain:[[panelW/2,5],[panelW/2,gh-5]] };
      if (waistMeta) piece.pleats = waistMeta;
      return piece;
    };
    const band={ name:{en:"Waistband", ar:"الحزام"},
      desc:{en:"Generated waistband.", ar:"حزام مولّد."},
      outline:[[0,0],[m.waist*fit+4,0],[m.waist*fit+4,7],[0,7]], grain:[[3,2],[m.waist*fit,2]],
      role:"waistband" };
    const pieces=[panel("Front Skirt","تنورة أمامية","front"), panel("Back Skirt","تنورة خلفية","back"), band];
    if(style.wrap) pieces.push({ name:{en:"Tie Sash", ar:"حزام ربط"}, desc:{en:"Self-fabric sash for the wrap closure.", ar:"حزام من نفس القماش لإغلاق التنورة الملفوفة."},
      outline:[[0,0],[7,0],[7,90],[0,90]], grain:[[3.5,8],[3.5,82]],
      role:"wrap-tie" });
    return pieces;
  }

  // A fitted romper/jumpsuit: waist-length bodice (front+back) joined at a
  // real waist seam to a pair of above-knee shorts legs — reusing buildTop's
  // neckline/dart construction for the bodice half and a trouser-panel-style
  // crotch curve (scaled down to shorts length) for the legs, since neither
  // buildTop nor buildTrousers alone produces a one-piece bodice+shorts
  // garment. Sleeveless is the common case for this silhouette, so a
  // sleeveless bodice gets an armhole binding strip instead of a facing;
  // a zip closure (prompt-detected or spec-declared) gets a center-front
  // facing strip stabilizing the opening.
  function shortsPanel(en, ar, w, len, hem, crotchDrop){
    return {
      name:{en, ar},
      desc:{en:"Generated romper shorts panel — joins the bodice at the waist seam.",
            ar:"لوحة شورت الأفرول المولّدة — تُوصل بالصدرية عند خط الخصر."},
      outline:[[2,0],[w,0],[w+2,crotchDrop],[hem+2,len],[2,len],[-2,crotchDrop]],
      darts:[], notches:[[w,0]],
      grain:[[w/2,len*0.35],[w/2,len-3]],
      // no declared role: cloth-lab's WP-6 placement vocabulary has no
      // "shorts front/back" entry (only full-length trouser/skirt panels) —
      // matches buildTrousers' own "skip what we don't understand" convention
      // (see its comment above) rather than forcing a wrong hip-panel placement.
    };
  }
  function buildRomper(style, m){
    const fit=style.fitF, bodiceLen=m.backLen;
    const chestW=(q(m.chest)+2)*fit, waistW=(q(m.waist)+3)*fit, hipW=(q(m.hips)+2)*fit;
    const waistDart = (fit<0.92) ? [[[waistW*0.5, bodiceLen-8],[waistW*0.5-2, bodiceLen],[waistW*0.5+2, bodiceLen]]] : [];

    const neckFront = necklinePts(style, chestW*0.42, 1);
    const neckBack  = necklinePts({ ...style, neckline: style.neckline==="v"?"round":style.neckline }, chestW*0.3, 1.5);

    const front = {
      name:{en:"Romper Front Bodice", ar:"مقدمة صدرية الأفرول"},
      desc:{en:"Fitted front bodice ending at the natural waist, joined to the shorts below.",
            ar:"صدرية أمامية ضيقة تنتهي عند الخصر الطبيعي، تُوصل بالشورت أسفلها."},
      outline:[...neckFront,[chestW,3],[chestW+1,bodiceLen*0.55],[waistW+1,bodiceLen],[0,bodiceLen]],
      darts:waistDart, notches:[[chestW,3],[waistW+1,bodiceLen]],
      grain:[[chestW*0.5,6],[chestW*0.5,bodiceLen-6]],
      role:"bodice-front-center", cutOnFold:true, chestEdgeIndices:[2], // WP-24
    };
    const back = {
      name:{en:"Romper Back Bodice", ar:"ظهر صدرية الأفرول"},
      desc:{en:"Fitted back bodice, mirrors the front block.", ar:"ظهر صدرية ضيق يقابل القطعة الأمامية."},
      outline:[...neckBack,[chestW,3.5],[chestW+1,bodiceLen*0.55],[waistW+0.5,bodiceLen],[0,bodiceLen]],
      darts:waistDart, notches:[[chestW,3.5]],
      grain:[[2,6],[2,bodiceLen-6]],
      role:"bodice-back-center", cutOnFold:true, chestEdgeIndices:[2],
    };
    const pieces=[front, back];

    if(style.sleeveLenF > 0.05){
      pieces.push(sleevePiece(style, m));
    } else {
      const armholeCirc = m.bicep + 6;
      pieces.push({
        name:{en:"Armhole Binding", ar:"شريط تحبيك حلقة الكم"},
        desc:{en:"Bias binding strip finishing the armhole edge on a sleeveless bodice.",
              ar:"شريط مائل يُنهي حافة حلقة الكم في الصدرية بلا أكمام."},
        outline:[[0,0],[armholeCirc,0],[armholeCirc,3],[0,3]],
        darts:[], notches:[],
        grain:[[armholeCirc*0.5,0.5],[armholeCirc*0.5,2.5]],
        role:"other", bilateral:true,
      });
    }

    if(style.neckline==="mock"){
      const nc = m.neck/2+2;
      pieces.push({
        name:{en:"Mock Neck Stand", ar:"قاعدة الياقة القائمة"},
        desc:{en:"Short standing band finishing the mock neckline.", ar:"شريط قائم قصير يُنهي فتحة الرقبة القائمة."},
        outline:[[0,0],[nc,0],[nc,4.5],[0,5]],
        darts:[], notches:[],
        grain:[[2,1],[nc-2,1]],
        role:"collar-stand",
      });
    }

    if(style.zip){
      pieces.push({
        name:{en:"Zip Facing", ar:"بطانة السحاب"},
        desc:{en:"Narrow facing strip stabilizing the center-front zip opening.",
              ar:"شريط بطانة ضيق يُثبّت فتحة السحاب الأمامية."},
        outline:[[0,0],[4,0],[4,bodiceLen],[0,bodiceLen]],
        darts:[], notches:[],
        grain:[[2,4],[2,bodiceLen-4]],
        role:"placket-facing",
      });
    }

    const shortW = hipW, shortHem = clamp(shortW*0.85*style.flareF, shortW*0.7, shortW*1.3);
    const shortLen = clamp(m.inseam*0.16*style.lengthF, 8, 30);
    pieces.push(shortsPanel("Romper Front Shorts","شورت الأفرول الأمامي", shortW, shortLen, shortHem, 9));
    pieces.push(shortsPanel("Romper Back Shorts","شورت الأفرول الخلفي", shortW+2, shortLen, shortHem+2, 10));
    return pieces;
  }

  // ---------- LEOTARD builder (fitted gymnastics/dance leotard) ----------
  // Structurally distinct from buildTop/buildRomper: a leotard's body is ONE
  // continuous front panel and one continuous back panel running from the
  // neckline straight down through the waist (no waist seam — real leotard
  // construction) to a high-cut leg opening, closed at the crotch by a
  // separate lined gusset. style.legHeight controls how high that leg
  // opening sits; style.backStyle swaps the back's top edge between a full
  // back, a racerback/cross-back strap, or a deep low-scoop; style.colorBlock
  // splits the front (or adds a back mesh insert / side panels) into real,
  // separately-cut pieces for genuine construction variety — not a recolor.
  // style.skirt adds an attached gathered ballet skirt at the hip seam.
  const LEOTARD_LEG = {
    // rise = how far above the natural waist the leg's highest side point
    // sits; legWFactor = how much narrower than the hip that point is
    // (smaller = a higher, more cut-in leg line); crotch = vertical drop
    // from that side point down to the center-front/back gusset point.
    classic: { rise: 12, legWFactor: 0.94, crotch: 5.5, gusset: 3.2 },
    highcut: { rise: 17, legWFactor: 0.72, crotch: 4.0, gusset: 2.6 },
  };
  // Split fractions (of backLen) for the two colour-block front variants
  // that divide the front into a yoke + body: "yoke" splits level all the
  // way across (y1===y2); "diagonal" slopes the split, which — because the
  // front is drafted as a cutOnFold RIGHT HALF — mirrors into a symmetric
  // V at centre front once folded, i.e. a real diagonal/sweetheart-style
  // colour-block dip, not an asymmetric (un-mirrorable) diagonal seam.
  const LEOTARD_SPLIT = { yoke: { y1: 0.40, y2: 0.40 }, diagonal: { y1: 0.26, y2: 0.55 } };

  function leotardFrontPts(style, chestW, waistW, hipW, bod) {
    const leg = LEOTARD_LEG[style.legHeight] || LEOTARD_LEG.classic;
    const hipDrop = 9, legY = bod + hipDrop + leg.rise, legW = hipW * leg.legWFactor, crotchY = legY + leg.crotch;
    return {
      neck: necklinePts(style, chestW * 0.4, 1),
      shoulder: [chestW, 3], waistIn: [chestW * 0.92, bod * 0.58], waist: [waistW, bod],
      hip: [hipW, bod + hipDrop], leg: [legW, legY], gusset: [leg.gusset, crotchY], fold: [0, crotchY],
    };
  }
  // Split line the front's colour-block yoke uses — also reused by the back
  // (see leotardSplitY below) so a wrap-around yoke seam sits at the SAME
  // height on both pieces, not two independently-floored heights that
  // happen to differ whenever the front's neckline and the back's top edge
  // have different natural depths (e.g. a halter front vs. a crossback back).
  function leotardFrontSplitFloor(p) {
    return Math.max(...p.neck.map((pt) => pt[1]), p.shoulder[1]) + 4;
  }
  function leotardBackSplitFloor(top, armhole) {
    return Math.max(...top.map((pt) => pt[1]), armhole[1]) + 4;
  }
  // Shared y1/y2 for the front+back yoke split — floored by BOTH sides'
  // deepest point so the seam clears whichever neckline/back shape is
  // deeper, and identical on both pieces so they're a real matching seam.
  function leotardSplitY(style, chestW, bod, frontPts, backTop, backArmhole) {
    const split = LEOTARD_SPLIT[style.colorBlock];
    if (!split) return null;
    const floor = Math.max(leotardFrontSplitFloor(frontPts), leotardBackSplitFloor(backTop, backArmhole));
    return { y1: Math.max(bod * split.y1, floor), y2: Math.max(bod * split.y2, floor) };
  }
  function leotardFrontPieces(style, chestW, waistW, hipW, bod, splitY) {
    const p = leotardFrontPts(style, chestW, waistW, hipW, bod);
    const gLen = p.fold[1];
    if (!splitY) {
      return [{
        name: { en: "Front Body", ar: "مقدمة الجسم" },
        desc: { en: "Continuous front panel from the neckline straight through to the high-cut leg opening — no waist seam, matching real leotard construction.",
                ar: "لوحة أمامية متصلة من فتحة الرقبة حتى فتحة الساق العالية — بدون خط خصر، كما في تفصيل الليوتارد الحقيقي." },
        outline: [...p.neck, p.shoulder, p.waistIn, p.waist, p.hip, p.leg, p.gusset, p.fold],
        role: "bodice-front-center", cutOnFold: true,
        grain: [[chestW * 0.4, 8], [chestW * 0.4, gLen - 8]],
      }];
    }
    const { y1, y2 } = splitY;
    const diag = style.colorBlock === "diagonal";
    return [
      { name: { en: diag ? "Diagonal Colour-Block Yoke" : "Front Colour-Block Yoke",
                ar: diag ? "كوة صدر بقصة مائلة متباينة اللون" : "كوة صدر متباينة اللون" },
        desc: { en: "Contrast-colour chest yoke, seamed to the body panel below.", ar: "كوة صدر بلون متباين، متصلة بلوحة الجسم أسفلها بخياطة." },
        outline: [...p.neck, p.shoulder, [chestW * 0.85, y2], [0, y1]],
        role: "yoke", cutOnFold: true,
        grain: [[chestW * 0.35, 3], [chestW * 0.35, Math.max(y1, y2) - 3]] },
      { name: { en: "Front Body", ar: "مقدمة الجسم" },
        desc: { en: "Lower front panel seamed to the yoke, continuing straight to the high-cut leg opening.", ar: "لوحة أمامية سفلية متصلة بالكوة، تمتد حتى فتحة الساق العالية." },
        outline: [[0, y1], [chestW * 0.85, y2], p.waistIn, p.waist, p.hip, p.leg, p.gusset, p.fold],
        role: "bodice-front-center", cutOnFold: true,
        grain: [[chestW * 0.4, Math.min(y1, y2) + 6], [chestW * 0.4, gLen - 8]] },
    ];
  }
  function leotardBackTopPts(style, chestW, bod) {
    const half = chestW * 0.32;
    switch (style.backStyle) {
      // Strap-tip points kept close to y≈0–1 (not driven sharply negative) —
      // a narrow strap only needs to narrow in X, not rise far above every
      // front neckline's own highest point (offshoulder in particular never
      // goes negative), or the front/back top-to-bottom extents mismatch
      // for reasons that have nothing to do with the actual style pairing.
      case "racerback": return [[0, 3], [half * 0.30, 0.5], [half * 0.98, 4.5]];
      case "crossback": return [[0, 2], [half * 0.5, 0.3], [half * 0.98, 4]];
      case "lowscoop": return [[0, bod * 0.34], [half * 1.05, 1]];
      default: return necklinePts({ ...style, neckline: style.neckline === "v" ? "round" : style.neckline }, half, 1.5); // full / keyhole
    }
  }
  // Back panel mirrors the front's own colour-block split (when present) —
  // besides matching real colour-block leotards (the yoke usually wraps
  // front-to-back), splitting BOTH pieces symmetrically keeps each piece's
  // own top-to-bottom extent comparable between front and back, which is
  // exactly what the validator's seamLengthParity heuristic checks; splitting
  // only the front (leaving a full-height back) was a real mismatch, not a
  // heuristic false-positive — a colour-blocked front is genuinely shorter
  // top-to-bottom than a full, unsplit back would be.
  function leotardBackPieces(style, chestW, waistW, hipW, bod, splitY) {
    const leg = LEOTARD_LEG[style.legHeight] || LEOTARD_LEG.classic;
    const hipDrop = 9.5, legY = bod + hipDrop + leg.rise, legW = hipW * leg.legWFactor + 1, crotchY = legY + leg.crotch + 1;
    const top = leotardBackTopPts(style, chestW, bod);
    const armhole = [chestW + 1, 3.5], waistIn = [chestW * 0.94, bod * 0.58], waist = [waistW + 0.5, bod];
    const hip = [hipW + 0.5, bod + hipDrop], legPt = [legW, legY], gusset = [leg.gusset + 0.4, crotchY], fold = [0, crotchY];
    const pieces = [];
    if (!splitY) {
      pieces.push({
        name: { en: "Back Body", ar: "خلفية الجسم" },
        desc: { en: "Continuous back panel, mirrors the front's waistless construction.", ar: "لوحة خلفية متصلة تقابل تفصيل المقدمة بدون خط خصر." },
        outline: [...top, armhole, waistIn, waist, hip, legPt, gusset, fold],
        role: "bodice-back-center", cutOnFold: true,
        grain: [[2, 8], [2, crotchY - 8]],
      });
    } else {
      const { y1, y2 } = splitY;
      const diag = style.colorBlock === "diagonal";
      pieces.push(
        { name: { en: diag ? "Diagonal Colour-Block Back Yoke" : "Back Colour-Block Yoke",
                  ar: diag ? "كوة ظهر بقصة مائلة متباينة اللون" : "كوة ظهر متباينة اللون" },
          desc: { en: "Contrast-colour back yoke, seamed to the back body below — wraps around from the front yoke.", ar: "كوة ظهر بلون متباين، متصلة بخلفية الجسم أسفلها — تلتف من كوة المقدمة." },
          outline: [...top, armhole, [chestW * 0.87, y2], [0, y1]],
          role: "yoke", cutOnFold: true,
          grain: [[chestW * 0.35, 3], [chestW * 0.35, Math.max(y1, y2) - 3]] },
        { name: { en: "Back Body", ar: "خلفية الجسم" },
          desc: { en: "Lower back panel seamed to the back yoke, continuing straight to the high-cut leg opening.", ar: "لوحة خلفية سفلية متصلة بكوة الظهر، تمتد حتى فتحة الساق العالية." },
          outline: [[0, y1], [chestW * 0.87, y2], waistIn, waist, hip, legPt, gusset, fold],
          role: "bodice-back-center", cutOnFold: true,
          grain: [[2, Math.min(y1, y2) + 6], [2, crotchY - 8]] },
      );
    }
    if (style.backStyle === "crossback") {
      pieces.push({ name: { en: "Cross-Back Strap", ar: "حزام الظهر المتقاطع" },
        desc: { en: "Narrow strap crossing over the open back.", ar: "حزام رفيع يتقاطع فوق فتحة الظهر." },
        role: "other", bilateral: true,
        outline: [[0, 0], [2.2, 0], [2.2, 24], [0, 24]], grain: [[1.1, 3], [1.1, 20]] });
    }
    if (style.backStyle === "keyhole") {
      pieces.push({ name: { en: "Keyhole Binding", ar: "تحبيك فتحة القفل" },
        desc: { en: "Small bound trim finishing a keyhole opening at the back neckline.", ar: "شريط تحبيك صغير يُنهي فتحة قفل صغيرة عند خط الرقبة الخلفي." },
        role: "other",
        outline: [[0, 0], [3.4, 0], [3.4, 2.2], [1.7, 3.4], [0, 2.2]], grain: [[1.7, 0.6], [1.7, 2.4]] });
    }
    if (style.colorBlock === "mesh") {
      pieces.push({ name: { en: "Mesh Back Panel", ar: "لوحة شبك خلفية" },
        desc: { en: "Sheer power-mesh insert set into the upper back.", ar: "إدراج شبك شفاف مرن في أعلى الظهر." },
        role: "other",
        outline: [[0, 0], [chestW * 0.7, 3], [chestW * 0.62, 14], [0, 15]], grain: [[chestW * 0.3, 3], [chestW * 0.3, 11]] });
    }
    return pieces;
  }
  function buildLeotard(style, m) {
    const fit = 0.90; // stretch performance fabric — drafted with negative ease
    const chestW = (q(m.chest) + 1) * fit, waistW = (q(m.waist) + 1.5) * fit, hipW = (q(m.hips) + 1) * fit;
    const bod = m.backLen;
    const frontPts = leotardFrontPts(style, chestW, waistW, hipW, bod);
    const backTop = leotardBackTopPts(style, chestW, bod), backArmhole = [chestW + 1, 3.5];
    const splitY = leotardSplitY(style, chestW, bod, frontPts, backTop, backArmhole);
    const pieces = [...leotardFrontPieces(style, chestW, waistW, hipW, bod, splitY), ...leotardBackPieces(style, chestW, waistW, hipW, bod, splitY)];

    if (style.colorBlock === "sideInsert") {
      pieces.push({ name: { en: "Side Mesh Insert", ar: "إدراج شبك جانبي" },
        desc: { en: "Contrast side panel set into the side seam from the armhole down to the leg opening.", ar: "لوحة جانبية متباينة تُدرج في الخط الجانبي من الإبط حتى فتحة الساق." },
        role: "other", bilateral: true,
        outline: [[0, 0], [3.2, 4], [2.6, bod + 18], [0, bod + 14]], grain: [[1.6, 4], [1.6, bod + 10]] });
    }

    if (style.sleeveLenF > 0.05) {
      const slen = clamp(m.sleeve * style.sleeveLenF, 6, m.sleeve * 1.1);
      const bic = q(m.bicep) * style.sleeveWideF * 0.88, cap = 5.5 * style.sleeveWideF;
      pieces.push({ name: { en: "Sleeve", ar: "كم" },
        desc: { en: "Fitted stretch sleeve — length and width read from the style.", ar: "كم مرن ضيق — الطول والاتساع حسب التصميم." },
        outline: [[0, 0], [bic, -cap], [bic * 2, 0], [bic * 2 - 1, slen], [1, slen]],
        notches: [[bic, -cap]], grain: [[bic, 4], [bic, slen - 4]],
        role: "sleeve", bilateral: true });
    } else {
      pieces.push({ name: { en: "Armhole Binding", ar: "تحبيك حلقة الكم" },
        desc: { en: "Bias binding strip finishing the sleeveless armhole edge.", ar: "شريط مائل يُنهي حافة حلقة الكم بلا أكمام." },
        role: "other", bilateral: true,
        outline: [[0, 0], [m.bicep + 5, 0], [m.bicep + 5, 2.6], [0, 2.6]], grain: [[(m.bicep + 5) * 0.5, 0.6], [(m.bicep + 5) * 0.5, 2]] });
    }

    if (style.neckline === "mock") {
      const nc = m.neck / 2 + 2;
      pieces.push({ name: { en: "Mock Neck Stand", ar: "قاعدة الياقة القائمة" },
        desc: { en: "Short standing band finishing the mock/high neckline.", ar: "شريط قائم قصير يُنهي فتحة الرقبة العالية." },
        outline: [[0, 0], [nc, 0], [nc, 4.5], [0, 5]], grain: [[2, 1], [nc - 2, 1]],
        role: "collar-stand" });
    } else {
      const neckCirc = m.neck * 0.95;
      pieces.push({ name: { en: "Neckline Binding", ar: "تحبيك فتحة الرقبة" },
        desc: { en: "Elastic binding strip finishing the neckline edge.", ar: "شريط أستك يُنهي حافة فتحة الرقبة." },
        role: "other",
        outline: [[0, 0], [neckCirc, 0], [neckCirc, 1.8], [0, 1.8]], grain: [[neckCirc * 0.5, 0.4], [neckCirc * 0.5, 1.4]] });
    }

    const legCirc = hipW * 1.7;
    pieces.push({ name: { en: "Leg Opening Binding", ar: "تحبيك فتحة الساق" },
      desc: { en: "Elastic binding strip finishing each high-cut leg opening.", ar: "شريط أستك يُنهي حافة فتحة الساق العالية من الجانبين." },
      role: "other", bilateral: true,
      outline: [[0, 0], [legCirc, 0], [legCirc, 1.6], [0, 1.6]], grain: [[legCirc * 0.5, 0.4], [legCirc * 0.5, 1.2]] });

    pieces.push(
      { name: { en: "Crotch Gusset", ar: "دكة الجسم" },
        desc: { en: "Diamond gusset seamed into the crotch for stretch and coverage.", ar: "دكة ماسية تُخاط عند خط الجسم للمرونة والتغطية." },
        role: "other",
        outline: [[0, 0], [3.6, 4.5], [0, 9], [-3.6, 4.5]], grain: [[0, 2], [0, 7]] },
      { name: { en: "Gusset Lining", ar: "بطانة الدكة" },
        desc: { en: "Second gusset layer for opacity and comfort.", ar: "طبقة ثانية للدكة لمزيد من التغطية والراحة." },
        role: "lining",
        outline: [[0, 0], [3.6, 4.5], [0, 9], [-3.6, 4.5]], grain: [[0, 2], [0, 7]] },
    );

    if (style.skirt) {
      const skirtLen = 13, waistCirc = m.waist * 0.62, hemCirc = waistCirc * 1.9;
      const skPanel = (en, ar, role) => ({
        name: { en, ar },
        desc: { en: "Gathered ballet skirt panel attached at the hip seam.", ar: "لوحة تنورة باليه مكشكشة تُخاط عند خط الورك." },
        outline: [[0, 0], [waistCirc / 2, 0], [hemCirc / 2, skirtLen], [0, skirtLen]],
        grain: [[waistCirc / 4, 3], [waistCirc / 4, skirtLen - 3]],
        role,
      });
      pieces.push(skPanel("Ballet Skirt Front", "تنورة باليه أمامية", "hip-panel-front"));
      pieces.push(skPanel("Ballet Skirt Back", "تنورة باليه خلفية", "hip-panel-back"));
    }

    return pieces;
  }

  // ---------- measured-piece builder (vision-read tech-pack pieces) ----------
  // A worn-garment photo only ever supports a relative style factor (this
  // silhouette is "about 1.3x longer than usual") — a technical flat-sketch/
  // tech-pack image is different: it has its OWN printed piece diagrams and
  // dimensions, and a vision-capable provider can read them directly. When a
  // spec's pieces carry `outlineCm` (schema/pattern-spec.v1.json), this
  // builds real geometry straight from those traced coordinates instead of
  // guessing via style factors — a front placket, a curved hem, a
  // drawstring tunnel end up looking like the actual reference piece, not a
  // generic robe/top silhouette. Non-uniform 2-axis scaling (width by
  // chest/waist/hip ratio, length by height/backLen ratio) regrades the
  // traced piece from the spec's own `garment.referenceMeasurementsCm` (the
  // tech-pack's own body-measurement table, if given) to the wearer's
  // actual measurements; without a reference table, coordinates are used
  // exactly as traced — an honest "this fits the reference size" result,
  // not a silently-wrong rescale.
  const ROLE_LABEL = {
    "bodice-front":{en:"Front Bodice",ar:"صدرية أمامية"}, "bodice-back":{en:"Back Bodice",ar:"صدرية خلفية"},
    "front-panel":{en:"Front Panel",ar:"لوحة أمامية"}, "back-panel":{en:"Back Panel",ar:"لوحة خلفية"},
    "skirt-front":{en:"Skirt Front",ar:"تنورة أمامية"}, "skirt-back":{en:"Skirt Back",ar:"تنورة خلفية"},
    "shorts-front":{en:"Shorts Front",ar:"شورت أمامي"}, "shorts-back":{en:"Shorts Back",ar:"شورت خلفي"},
    sleeve:{en:"Sleeve",ar:"كم"}, "sleeve-upper":{en:"Sleeve Upper",ar:"الكم العلوي"}, "sleeve-under":{en:"Sleeve Under",ar:"الكم السفلي"},
    collar:{en:"Collar",ar:"ياقة"}, undercollar:{en:"Undercollar",ar:"تحت الياقة"}, "collar-stand":{en:"Collar Stand",ar:"قاعدة الياقة"},
    facing:{en:"Facing",ar:"بطانة"}, "placket-facing":{en:"Placket",ar:"باتة"}, "lapel-facing":{en:"Lapel Facing",ar:"بطانة الصدر"},
    yoke:{en:"Yoke",ar:"كتافة"}, pocket:{en:"Pocket",ar:"جيب"}, waistband:{en:"Waistband",ar:"حزام"},
    cuff:{en:"Cuff",ar:"أسورة"}, "rib-cuff":{en:"Rib Cuff",ar:"أسورة مضلعة"}, "hem-band":{en:"Hem Band",ar:"شريط الحاشية"},
    belt:{en:"Belt",ar:"حزام"}, sash:{en:"Sash",ar:"حزام ربط"}, "wrap-tie":{en:"Tie",ar:"رباط"}, lining:{en:"Lining",ar:"بطانة"},
    hood:{en:"Hood",ar:"قبعة"}, other:{en:"Piece",ar:"قطعة"},
  };
  function labelFor(piece){
    if(piece.label && piece.label.en && piece.label.ar) return piece.label;
    return ROLE_LABEL[piece.role] || { en: piece.id, ar: piece.id };
  }
  function scaleFactors(ref, m){
    if(!ref) return { sx:1, sy:1 };
    const widthRef = ref.chest || ref.waist || ref.hips;
    const widthNow = m.chest || m.waist || m.hips;
    const lenRef = ref.backLen || ref.height;
    const lenNow = m.backLen || m.height;
    const sx = (widthRef && widthNow) ? widthNow/widthRef : 1;
    const sy = (lenRef && lenNow) ? lenNow/lenRef : 1;
    return { sx: clamp(sx,0.6,1.7), sy: clamp(sy,0.6,1.7) };
  }
  function buildFromMeasuredPieces(spec, m){
    const { sx, sy } = scaleFactors(spec.garment && spec.garment.referenceMeasurementsCm, m);
    return (spec.pieces||[]).filter(p=>Array.isArray(p.outlineCm) && p.outlineCm.length>=3).map(p=>{
      const outline = p.outlineCm.map(([x,y])=>[+(x*sx).toFixed(2), +(y*sy).toFixed(2)]);
      const xs = outline.map(pt=>pt[0]), ys = outline.map(pt=>pt[1]);
      const cx = (Math.min(...xs)+Math.max(...xs))/2, minY=Math.min(...ys), maxY=Math.max(...ys);
      const pad = Math.max(1, (maxY-minY)*0.08);
      return {
        name: labelFor(p),
        desc:{ en:"Traced from a reference tech-pack image — real measurements, not a style-factor guess.",
               ar:"مُستخرجة من صورة كراسة قياسات مرجعية — قياسات حقيقية وليست تخمينًا نسبيًا." },
        outline, darts:[], notches:[],
        grain:[[cx, minY+pad], [cx, maxY-pad]],
        role: p.role, cutOnFold: !!p.cutOnFold,
      };
    });
  }

  // ---------- thinking-stage summary text ----------
  const NECK_LABEL = { v:{en:"V-neck",ar:"فتحة V"}, round:{en:"round neck",ar:"فتحة دائرية"}, boat:{en:"boat neck",ar:"فتحة قارب"},
    offshoulder:{en:"off-shoulder",ar:"كتف مكشوف"}, halter:{en:"halter",ar:"حمالة رقبة"}, collar:{en:"collared",ar:"بياقة"},
    mock:{en:"mock neck",ar:"ياقة قائمة"} };
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
    const hasNeck = ["dress","top","shirt","robe","romper","leotard"].includes(style.type) && NECK_LABEL[style.neckline];
    const neck = hasNeck ? NECK_LABEL[style.neckline][lang==="ar"?"ar":"en"] : null;
    const hem = HEM_LABEL[style.hemShape] ? HEM_LABEL[style.hemShape][lang==="ar"?"ar":"en"] : null;
    const wrapTxt = style.wrap ? (lang==="ar"?"ملفوف":"wrap") : null;
    const zipTxt = style.zip ? (lang==="ar"?"بسحاب":"zip-front") : null;
    if(lang==="ar"){
      const bits=[ar.type, ar.len, ar.flare, wrapTxt, zipTxt, neck, hem, ar.slv].filter(Boolean);
      return bits.join(" · ");
    }
    const bits=[en.len, wrapTxt, zipTxt, en.flare, en.type, neck, hem, en.slv].filter(Boolean);
    return bits.join(" · ");
  }
  // structured attribute chips for the "detected" panel in the UI.
  // `provenance` (WP-3/WP-4, optional) is either an array of
  // {field,source,confidence} (a PatternSpecV1 provenance list) or a plain
  // {field:{source,confidence}} map — when a chip's `k` matches a `field`,
  // the chip gets tagged with where that value actually came from. Callers
  // that don't pass it (today's local/remote path) get exactly today's
  // shape back — this is additive, not a breaking change.
  function attributes(style, lang, provenance){
    const ar = lang==="ar";
    const out = [];
    out.push({ k:"type", label: ar?"النوع":"Type", value: ar?(AR_TYPE[style.type]||"—"):(EN_TYPE[style.type]||"—") });
    out.push({ k:"length", label: ar?"الطول":"Length", value: style.lengthF>=1.2?(ar?"طويل":"Long"):style.lengthF<=0.82?(ar?"قصير":"Short"):(ar?"متوسط":"Regular") });
    out.push({ k:"flare", label: ar?"الاتساع":"Flare", value: style.flareF>=1.25?(ar?"واسع":"Flared"):style.flareF<=0.92?(ar?"ضيق":"Fitted"):(ar?"مستقيم":"Straight") });
    if(["dress","top","shirt","robe","romper","leotard"].includes(style.type)){
      out.push({ k:"sleeve", label: ar?"الكم":"Sleeve", value: style.sleeveLenF<=0.05?(ar?"بدون كم":"Sleeveless"):style.sleeveWideF>=1.4?(ar?"واسع":"Wide"):style.sleeveLenF>=1.2?(ar?"طويل":"Long"):style.sleeveLenF<=0.5?(ar?"قصير":"Short"):(ar?"عادي":"Regular") });
      if(NECK_LABEL[style.neckline]) out.push({ k:"neckline", label: ar?"فتحة الرقبة":"Neckline", value: NECK_LABEL[style.neckline][ar?"ar":"en"] });
    }
    if(HEM_LABEL[style.hemShape]) out.push({ k:"hem", label: ar?"الحاشية":"Hem", value: HEM_LABEL[style.hemShape][ar?"ar":"en"] });
    if(style.wrap) out.push({ k:"closure", label: ar?"الإغلاق":"Closure", value: ar?"ملفوف":"Wrap" });
    else if(style.zip) out.push({ k:"closure", label: ar?"الإغلاق":"Closure", value: ar?"سحاب":"Zip" });
    out.push({ k:"color", label: ar?"اللون":"Colour", value: style.color, swatch:true });
    if(provenance){
      const byField = Array.isArray(provenance) ? Object.fromEntries(provenance.map(p=>[p.field,p])) : provenance;
      out.forEach(row=>{ const p=byField[row.k]; if(p){ row.source=p.source; if(p.confidence!=null) row.confidence=p.confidence; } });
    }
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
  async function generate({ prompt, imageDataURL, category, measurements, endpoint, lang, onStage, segment }){
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
    const metrics = imageDataURL ? await analyzeImage(imageDataURL, { segment }) : null;
    await wait(STAGE_MS);

    stage("silhouette");
    await wait(STAGE_MS);
    const style = deriveStyle({ metrics, prompt, category, imageDataURL });

    stage("drafting");
    await wait(STAGE_MS);
    const built = build(style, measurements);

    stage("done");
    // `imageSupplied` vs `usedImage`: both are false when no photo was
    // given at all (nothing to say), but ONLY imageSupplied is true when a
    // photo WAS given yet analyzeImage() couldn't read a clear silhouette
    // from it (too little contrast, no clear edge run — see analyzeImage's
    // own rowsFound threshold) — the caller uses that distinction to tell
    // "you didn't attach a photo" apart from "your photo couldn't be read",
    // which used to look identical (silently used prompt/defaults either way).
    return { ...built, summary: summary(style, lang), style, attributes: attributes(style, lang),
             source:"local", usedImage: !!(metrics && metrics.ok), imageSupplied: !!imageDataURL };
  }

  // hashStr/pick exported so js/ai-spec-pipeline.js and js/app.js's Guided
  // Prompt Builder can reuse the SAME seeded-variety convention this file
  // already relies on (same input -> same output, different input -> real
  // variety) instead of a second, drifting reimplementation.
  return { analyzeImage, deriveStyle, build, buildFromMeasuredPieces, summary, attributes, generate, sampleMatte, hashStr, pick };
})();
// TEMP compat alias for one release — see BerryStudio-Upgrade-Plan WP-0.1.
if (typeof window !== 'undefined') window.AIGen = AIGen;
