/* ============================================================
   3D Preview — parametric body avatar with Three.js.
   Avatar shape reacts to category + live measurements.
   360° rotation, walk-cycle bob, simple fabric drape overlay.
   Degrades gracefully if Three.js is unavailable (offline).
   ============================================================ */
const View3D = (() => {
  let THREE, renderer, scene, camera, raf = null;
  let group, garment;
  let ready = false, spinning = true, walking = true, t = 0;
  let host;

  async function ensureThree() {
    if (window.THREE) return window.THREE;
    try {
      const mod = await import("https://unpkg.com/three@0.160.0/build/three.module.js");
      window.THREE = mod; return mod;
    } catch (e) { return null; }
  }

  async function init(canvas) {
    host = canvas;
    THREE = await ensureThree();
    if (!THREE) { fallback(); return; }
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, -0.05, 4.8);
    camera.lookAt(0, -0.15, 0);
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 1.0); key.position.set(3, 6, 5); scene.add(key);
    const rim = new THREE.DirectionalLight(0x88aaff, 0.4); rim.position.set(-4, 2, -3); scene.add(rim);
    // floor disc
    const floor = new THREE.Mesh(new THREE.CircleGeometry(2.4, 48), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.06 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -1.15; scene.add(floor);
    group = new THREE.Group(); scene.add(group);
    ready = true;
    bind();
    resize();
    loop();
  }

  const col = k => { const t=document.createElement("canvas").getContext("2d"); t.fillStyle=getComputedStyle(document.body).getPropertyValue(k).trim(); return parseInt(t.fillStyle.slice(1),16); };

  // Build a stylised body from measurements (metres, roughly).
  function build(category, m, themeGarment) {
    if (!ready) return;
    group.clear();
    const scale = 0.01; // cm -> m
    const skin = new THREE.MeshStandardMaterial({ color: 0xd9b28c, roughness: 0.7, metalness: 0 });
    const female = category === "women" || category === "girls";
    const kid = category === "girls" || category === "boys";
    const H = m.height * scale;                 // total height
    const shoulderW = m.shoulder * scale * 1.05;
    const chestR = m.chest * scale / (2 * Math.PI);
    const waistR = m.waist * scale / (2 * Math.PI);
    const hipR = m.hips * scale / (2 * Math.PI);

    const y0 = -1.05; // feet
    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(H*0.075, 24, 20), skin);
    head.position.y = y0 + H*0.93; group.add(head);
    // Neck
    add(cyl(H*0.03, H*0.03, H*0.06, skin), 0, y0 + H*0.86);
    // Torso (lathe-like via stacked spheres/cylinders)
    const torso = cyl(chestR, waistR, H*0.28, skin);
    add(torso, 0, y0 + H*0.68);
    const hips = cyl(waistR, hipR, H*0.14, skin);
    add(hips, 0, y0 + H*0.50);
    // Arms
    [-1,1].forEach(s=>{
      const arm = cyl(m.bicep*scale/(2*Math.PI), H*0.022, H*0.42, skin);
      arm.position.set(s*shoulderW, y0 + H*0.60, 0);
      arm.rotation.z = s*0.14; group.add(arm);
    });
    // Legs
    [-1,1].forEach(s=>{
      const leg = cyl(m.thigh*scale/(2*Math.PI), H*0.03, H*0.48, skin);
      leg.position.set(s*hipR*0.6, y0 + H*0.24, 0); group.add(leg);
      leg.name = "leg"+s;
    });

    // Garment shell (fabric drape) over torso+hips
    const gcol = themeGarment ?? col("--brand");
    const fab = new THREE.MeshStandardMaterial({ color: gcol, roughness: 0.55, metalness: 0.05, transparent: true, opacity: 0.92, side: THREE.DoubleSide });
    const gLen = (category==="women") ? 0.62 : (category==="men"?0.5:0.5);
    garment = cyl(chestR*1.12, hipR* (female?1.35:1.15), H*gLen, fab);
    garment.position.y = y0 + H*(0.66 - gLen*0.15);
    group.add(garment);
    if (female && category==="women") {
      // flared skirt
      const skirt = cyl(hipR*1.2, hipR*1.9, H*0.34, fab);
      skirt.position.y = y0 + H*0.30; group.add(skirt);
    }
    // Sleeves
    [-1,1].forEach(s=>{
      const sl = cyl(m.bicep*scale/(2*Math.PI)*1.2, H*0.03, H*0.4, fab);
      sl.position.set(s*shoulderW, y0 + H*0.60, 0); sl.rotation.z = s*0.14; group.add(sl);
    });
  }
  function cyl(rt, rb, h, mat){ return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 28, 1, false), mat); }
  function add(mesh,x,y){ mesh.position.set(x,y,0); group.add(mesh); }

  function loop(){
    raf = requestAnimationFrame(loop);
    if (!ready) return;
    t += 0.016;
    if (spinning) group.rotation.y += 0.006;
    if (walking) {
      group.position.y = Math.sin(t*4)*0.01;
      group.children.forEach(c=>{ if(c.name==="leg1") c.rotation.x=Math.sin(t*4)*0.18; if(c.name==="leg-1") c.rotation.x=-Math.sin(t*4)*0.18; });
    }
    renderer.render(scene, camera);
  }

  function bind(){
    let down=false,px=0;
    host.addEventListener("pointerdown",e=>{down=true;px=e.offsetX;spinning=false;});
    window.addEventListener("pointerup",()=>down=false);
    host.addEventListener("pointermove",e=>{ if(down){ group.rotation.y+=(e.offsetX-px)*0.01; px=e.offsetX; }});
    host.addEventListener("wheel",e=>{ e.preventDefault(); camera.position.z=Math.min(7,Math.max(2.6,camera.position.z+e.deltaY*0.002)); camera.lookAt(0,-0.15,0); },{passive:false});
  }

  function resize(){ if(!ready)return; const r=host.getBoundingClientRect(); renderer.setPixelRatio(Math.min(2,devicePixelRatio)); renderer.setSize(r.width,r.height,false); camera.aspect=r.width/r.height; camera.updateProjectionMatrix(); }
  function fallback(){ const c=host.getContext("2d"); if(!c)return; host.width=host.clientWidth; host.height=host.clientHeight; c.fillStyle="#888"; c.font="14px Inter"; c.textAlign="center"; c.fillText("3D preview needs a connection on first load.", host.width/2, host.height/2); }

  return {
    init, build, resize,
    setSpin:v=>spinning=v, setWalk:v=>walking=v, isReady:()=>ready,
  };
})();
