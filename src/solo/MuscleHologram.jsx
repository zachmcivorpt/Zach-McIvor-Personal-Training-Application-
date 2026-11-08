import React, { useEffect, useRef, useState } from "react";
import { MUSCLES } from "./muscleMap";
import { READY_BLUE } from "./MuscleBody";

// Recovering (trained in the last 72 h) glows white, brighter with sets (#195).
export const RECOVERING_WHITE = "#FFFFFF";

// The 3D muscle map (#194): a real anatomical body (BodyParts3D, CC BY 4.0,
// via open-anatomy-3d — credit shown on the card) drawn as a blue hologram.
// Swipe sideways to turn it, tap a muscle to pick it. Trained muscles glow
// white (RECOVERING_WHITE, brighter with sets — #195), ready ones READY_BLUE, untracked ones
// (neck, hands, feet, adductors, tibialis) stay a faint neutral.
//
// The model (public/models/muscle-map.glb) carries a body-scan region per
// vertex (_REGION, 0..16 below), made offline by splitting every anatomy
// mesh into its separate muscles. three.js and the model load only when
// this card mounts (never on the launch path). No WebGL → `onUnavailable`
// and the card shows the 2D MuscleBody instead.

// Model region → the map's muscle key (null = not tracked).
export const REGION_KEYS = [
  "chest", "shoulders", "traps", "biceps", "triceps", "forearms", "abs", "obliques",
  "lats", "traps", "lowerBack", "glutes", "quads", "hamstrings", null, "calves", null,
];

export const MODEL_URL = "/models/muscle-map.glb";

export function webglAvailable() {
  if (typeof window === "undefined" || typeof window.WebGLRenderingContext === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

let libPromise = null;
function loadLibs() {
  if (!libPromise) {
    libPromise = Promise.all([
      import("three"),
      import("three/examples/jsm/loaders/GLTFLoader.js"),
      import("three/examples/jsm/controls/OrbitControls.js"),
    ]).then(([THREE, { GLTFLoader }, { OrbitControls }]) => ({ THREE, GLTFLoader, OrbitControls }));
  }
  return libPromise;
}

let modelPromise = null;
function loadModel(libs) {
  if (!modelPromise) {
    modelPromise = new Promise((resolve, reject) => new libs.GLTFLoader().load(MODEL_URL, resolve, undefined, reject));
    modelPromise.catch(() => {
      modelPromise = null;
    });
  }
  return modelPromise;
}

const hexToVec = (THREE, hex) => new THREE.Color(hex);

export default function MuscleHologram({ view = "front", levels = {}, selected = null, onSelect, onUnavailable, spin = false, onUserTurn, light = false, height = 520 }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const apiRef = useRef(null);
  const [state, setState] = useState("loading"); // loading | ready | failed

  // Set up once.
  useEffect(() => {
    if (!webglAvailable()) {
      setState("failed");
      onUnavailable?.();
      return undefined;
    }
    let disposed = false;
    let cleanup = () => {};
    loadLibs()
      .then((libs) => loadModel(libs).then((gltf) => ({ libs, gltf })))
      .then(({ libs, gltf }) => {
        if (disposed) return;
        cleanup = buildScene(libs, gltf, canvasRef.current, wrapRef.current, apiRef, (key) => onSelectRef.current?.(key), () => onUserTurnRef.current?.(), light);
        setState("ready");
      })
      .catch(() => {
        if (disposed) return;
        setState("failed");
        onUnavailable?.();
      });
    return () => {
      disposed = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    apiRef.current?.setLevels(levels);
  }, [levels, state]);
  useEffect(() => {
    apiRef.current?.setSelected(selected);
  }, [selected, state]);
  useEffect(() => {
    apiRef.current?.turnTo(view === "back" ? Math.PI : 0);
  }, [view, state]);
  useEffect(() => {
    apiRef.current?.setSpin(spin);
  }, [spin, state]);
  const onUserTurnRef = useRef(onUserTurn);
  onUserTurnRef.current = onUserTurn;

  return (
    <div ref={wrapRef} data-testid="muscle-hologram" className="relative w-full" style={{ height }}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" aria-label="3D muscle map. Swipe sideways to turn the body, tap a muscle for details." />
      {state === "loading" && (
        <div data-apex-loading className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold tracking-[0.12em] uppercase" style={{ color: "rgba(160,210,255,0.75)" }}>
          Loading body…
        </div>
      )}
    </div>
  );
}

// light (#198): the same body for Train Solo's light mode — drawn normally
// (not as added light) in blue on the light panel; recovering muscles in ink.
function buildScene(libs, gltf, canvas, wrap, apiRef, onPick, onUserTurn, light = false) {
  const { THREE, OrbitControls } = libs;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  camera.position.set(0, 0.95, 3.6);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0.93, 0);
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.minPolarAngle = controls.maxPolarAngle = Math.PI / 2 - 0.02; // sideways turning only
  controls.rotateSpeed = 0.9;
  // Vertical swipes still scroll the page; sideways ones turn the body.
  canvas.style.touchAction = "pan-y";

  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const levelArr = new Array(MUSCLES.length).fill(0);
  const uniforms = {
    uTime: { value: 0 },
    uSel: { value: -1 },
    uScanY: { value: -1 },
    uLevels: { value: levelArr },
    uRed: { value: hexToVec(THREE, RECOVERING_WHITE) },
    uBlue: { value: hexToVec(THREE, READY_BLUE) },
  };
  const N = MUSCLES.length;
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      attribute float aKey;
      varying vec3 vN; varying vec3 vV; varying vec3 vP; varying float vKey;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vP = position; vKey = aKey; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `
      uniform float uTime; uniform float uSel; uniform float uScanY; uniform float uLevels[${N}];
      uniform vec3 uRed; uniform vec3 uBlue;
      varying vec3 vN; varying vec3 vV; varying vec3 vP; varying float vKey;
      void main(){
        float f = pow(1.0 - abs(dot(vN, vV)), 1.8);
        float level = 0.0;
        for (int i = 0; i < ${N}; i++) { if (abs(float(i) - vKey) < 0.5) level = uLevels[i]; }
        vec3 ice = vec3(0.62, 0.84, 1.0);
        vec3 c = vKey < -0.5 ? ice * 0.5 : (level > 0.0 ? mix(ice, uRed, 0.4 + 0.6 * level) : uBlue);
        float fibre = 0.5 + 0.5 * sin(vP.y * 260.0 + vP.x * 90.0 + vP.z * 40.0);
        float a = 0.12 + f * 0.9 + (vKey > -0.5 ? fibre * 0.08 + level * 0.18 : 0.0);
        float sel = (uSel > -0.5 && abs(vKey - uSel) < 0.5) ? 1.0 : 0.0;
        float pulse = 0.85 + 0.15 * sin(uTime * 3.0);
        if (sel > 0.5) { c = mix(c, vec3(1.0), 0.55); a = 0.45 + f * 0.55 + fibre * 0.12; }
        else if (uSel > -0.5) { a *= 0.7; }
        float scan = smoothstep(0.035, 0.0, abs(vP.y - uScanY));
        a += scan * 0.45; c = mix(c, vec3(1.0), scan * 0.6);
        float lift = sel > 0.5 ? 1.6 * pulse : 1.0;
        gl_FragColor = vec4(c * (0.6 + f * 0.9) * lift, clamp(a, 0.0, 1.0));
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  // Light mode: ink for recovering, blue for ready, the tapped one solid.
  const lightMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: material.vertexShader,
    fragmentShader: `
      uniform float uTime; uniform float uSel; uniform float uScanY; uniform float uLevels[${N}];
      uniform vec3 uBlue;
      varying vec3 vN; varying vec3 vV; varying vec3 vP; varying float vKey;
      void main(){
        float f = pow(1.0 - abs(dot(vN, vV)), 1.6);
        float level = 0.0;
        for (int i = 0; i < ${N}; i++) { if (abs(float(i) - vKey) < 0.5) level = uLevels[i]; }
        vec3 ink = vec3(0.04, 0.05, 0.08);
        vec3 c = vKey < -0.5 ? vec3(0.62, 0.68, 0.78) : (level > 0.0 ? mix(uBlue, ink, 0.45 + 0.55 * level) : uBlue);
        float fibre = 0.5 + 0.5 * sin(vP.y * 260.0 + vP.x * 90.0 + vP.z * 40.0);
        float a = (vKey < -0.5 ? 0.18 : 0.38) + f * 0.45 + (vKey > -0.5 ? fibre * 0.06 : 0.0);
        float sel = (uSel > -0.5 && abs(vKey - uSel) < 0.5) ? 1.0 : 0.0;
        if (sel > 0.5) { c = mix(c, ink, 0.35); a = 0.82 + fibre * 0.1; }
        else if (uSel > -0.5) { a *= 0.6; }
        float scan = smoothstep(0.035, 0.0, abs(vP.y - uScanY));
        c = mix(c, uBlue, scan * 0.8); a += scan * 0.3;
        gl_FragColor = vec4(c * (0.85 + f * 0.25), clamp(a, 0.0, 1.0));
      }`,
    transparent: true,
    depthWrite: false,
  });
  const ghostMat = new THREE.ShaderMaterial({
    vertexShader: "varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
    fragmentShader: "varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 3.0); gl_FragColor = vec4(vec3(0.35,0.65,1.0) * f, f * 0.35); }",
    transparent: true,
    depthWrite: false,
    blending: light ? THREE.NormalBlending : THREE.AdditiveBlending,
  });
  const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false });

  // World-space copies, scaled to 1.8 m and standing on the floor.
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const parts = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = new THREE.BufferGeometry();
    const src = o.geometry.attributes.position;
    const pos = new Float32Array(src.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < src.count; i++) {
      v.fromBufferAttribute(src, i); // denormalises quantised data
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    if (o.geometry.index) g.setIndex(o.geometry.index.clone());
    g.applyMatrix4(o.matrixWorld);
    g.computeBoundingBox();
    parts.push({ o, g });
  });
  const box = new THREE.Box3();
  parts.forEach(({ g }) => box.union(g.boundingBox));
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = 1.8 / Math.max(size.x, size.y, size.z);
  const minY = (box.min.y - center.y) * scale;

  const body = new THREE.Group();
  scene.add(body);
  const pickables = [];
  let skinMesh = null;
  const disposables = [material, lightMaterial, ghostMat, depthOnly];
  for (const { o, g } of parts) {
    g.translate(-center.x, -center.y, -center.z);
    g.scale(scale, scale, scale);
    g.translate(0, -minY, 0);
    g.computeVertexNormals();
    disposables.push(g);
    const name = o.name || o.parent?.name || "";
    if (/^skin/.test(name)) {
      skinMesh = new THREE.Mesh(g, ghostMat);
      body.add(skinMesh);
      continue;
    }
    const reg = o.geometry.attributes._region;
    const count = g.attributes.position.count;
    const keys = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = reg ? Math.round(reg.getX(i)) : -1;
      const key = r >= 0 ? REGION_KEYS[r] : null;
      keys[i] = key ? MUSCLES.indexOf(key) : -1;
    }
    g.setAttribute("aKey", new THREE.BufferAttribute(keys, 1));
    // Depth pass first, so only the side facing you shows.
    const occluder = new THREE.Mesh(g, depthOnly);
    occluder.renderOrder = 0;
    body.add(occluder);
    const m = new THREE.Mesh(g, light ? lightMaterial : material);
    m.renderOrder = 1;
    m.userData.keys = keys;
    body.add(m);
    pickables.push(m);
  }

  // Floor rings.
  const ringGeo = [];
  [[0.38, 0.395, 0.5], [0.52, 0.528, 0.36], [0.66, 0.665, 0.22]].forEach(([r1, r2, op]) => {
    const geo = new THREE.RingGeometry(r1, r2, 96);
    const mat = new THREE.MeshBasicMaterial({ color: 0x2f8fff, transparent: true, opacity: op, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.005;
    scene.add(ring);
    ringGeo.push(geo, mat);
  });
  disposables.push(...ringGeo);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.7, 64), new THREE.MeshBasicMaterial({ color: 0x2f8fff, transparent: true, opacity: 0.08 }));
  disc.rotation.x = -Math.PI / 2;
  scene.add(disc);
  disposables.push(disc.geometry, disc.material);
  // Floating particles.
  const pg = new THREE.BufferGeometry();
  const pts = new Float32Array(220 * 3);
  for (let i = 0; i < 220; i++) {
    pts[i * 3] = (Math.random() - 0.5) * 2.4;
    pts[i * 3 + 1] = Math.random() * 2.1;
    pts[i * 3 + 2] = (Math.random() - 0.5) * 1.6;
  }
  pg.setAttribute("position", new THREE.BufferAttribute(pts, 3));
  const particles = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0x7cc4ff, size: 0.01, transparent: true, opacity: 0.55 }));
  scene.add(particles);
  disposables.push(pg, particles.material);

  // Tap → muscle (only the surface tapped; nothing seen through a gap >5 cm under the skin).
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let downAt = null;
  const onDown = (e) => {
    downAt = { x: e.clientX, y: e.clientY };
  };
  const onUp = (e) => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    downAt = null;
    if (moved > 8) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const h = ray.intersectObjects(pickables, false)[0];
    if (!h) return;
    const skin = skinMesh && ray.intersectObject(skinMesh, false)[0];
    if (skin && h.distance > skin.distance + 0.05) return;
    const k = h.object.userData.keys[h.face.a];
    if (k >= 0) onPick(MUSCLES[k]);
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerup", onUp);

  // Turning to a side: ease the camera round the body.
  let turnTarget = null;
  const angleNow = () => Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
  apiRef.current = {
    setLevels(levels) {
      MUSCLES.forEach((m, i) => {
        levelArr[i] = Number(levels?.[m]) || 0;
      });
      wake();
    },
    setSelected(key) {
      uniforms.uSel.value = key ? MUSCLES.indexOf(key) : -1;
      wake();
    },
    turnTo(angle) {
      turnTarget = angle;
      wake();
    },
    setSpin(on) {
      controls.autoRotate = !!on && !reduceMotion;
      controls.autoRotateSpeed = 1.6;
      wake();
    },
  };

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { resize(); wake(); }) : null;
  ro?.observe(wrap);
  resize();

  // Draw only while on screen (battery): the loop sleeps when the card is
  // scrolled away or the app is in the background.
  let visible = true;
  const io = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(([e]) => { visible = e.isIntersecting; wake(); }) : null;
  io?.observe(wrap);
  let raf = 0;
  const start = performance.now();
  function frame() {
    raf = 0;
    if (!visible || document.visibilityState === "hidden") return;
    const t = (performance.now() - start) / 1000;
    uniforms.uTime.value = t;
    uniforms.uScanY.value = reduceMotion ? -1 : (Math.sin(t * 0.8) * 0.5 + 0.5) * 1.85;
    if (!reduceMotion) particles.rotation.y = t * 0.05;
    if (turnTarget != null) {
      const a = angleNow();
      let d = turnTarget - a;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const step = Math.abs(d) < 0.01 ? d : d * (reduceMotion ? 1 : 0.18);
      const rr = Math.hypot(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
      const na = a + step;
      camera.position.set(controls.target.x + Math.sin(na) * rr, camera.position.y, controls.target.z + Math.cos(na) * rr);
      if (Math.abs(d) < 0.01) turnTarget = null;
    }
    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  function wake() {
    if (!raf) raf = requestAnimationFrame(frame);
  }
  const onVis = () => wake();
  document.addEventListener("visibilitychange", onVis);
  controls.addEventListener("start", () => {
    turnTarget = null;
    if (controls.autoRotate) onUserTurn?.();
    wake();
  });
  wake();

  return () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    visible = false;
    ro?.disconnect();
    io?.disconnect();
    document.removeEventListener("visibilitychange", onVis);
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointerup", onUp);
    controls.dispose();
    disposables.forEach((d) => d.dispose?.());
    renderer.dispose();
    apiRef.current = null;
  };
}
