// Body scan: split every anatomy mesh into its separate muscles (connected
// pieces) and give every vertex the muscle group it belongs to (_REGION).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const NAMES = ['Pectorals','Deltoids','Trapezius','Biceps','Triceps','Forearms','Abdominals','Obliques','Latissimus','Upper back','Lower back','Glutes','Quadriceps','Hamstrings','Adductors','Calves','Tibialis'];
const ID = Object.fromEntries(NAMES.map((n, i) => [n, i])); const NONE = -1;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]);
const xf = (m, v) => [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12], m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13], m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]];
const report = {};
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const name = node.getName();
  const M = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION'), idx = prim.getIndices();
    const n = pos.getCount(); const P = new Float32Array(n * 3); const e = [];
    for (let i = 0; i < n; i++) { pos.getElement(i, e); const w = xf(M, e); P.set(w, i * 3); }
    // connected pieces (welding seams by position)
    const key = new Map(), par = new Int32Array(n).map((_, i) => i);
    const f = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    const u = (a, b) => { a = f(a); b = f(b); if (a !== b) par[a] = b; };
    for (let i = 0; i < n; i++) { const k = Math.round(P[i*3]*2000)+','+Math.round(P[i*3+1]*2000)+','+Math.round(P[i*3+2]*2000); if (key.has(k)) u(i, key.get(k)); else key.set(k, i); }
    const ia = idx.getArray(); for (let t = 0; t < ia.length; t += 3) { u(ia[t], ia[t+1]); u(ia[t+1], ia[t+2]); }
    const comp = new Map();
    for (let i = 0; i < n; i++) { const r = f(i); let c = comp.get(r); if (!c) { c = { n: 0, s: [0,0,0], big: 0 }; comp.set(r, c); } c.n++; c.s[0] += P[i*3]; c.s[1] += P[i*3+1]; c.s[2] += P[i*3+2]; }
    let biggest = null; for (const c of comp.values()) { c.c = c.s.map((v) => v / c.n); if (!biggest || c.n > biggest.n) biggest = c; }
    const region = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const c = comp.get(f(i)), cx = Math.abs(c.c[0]), cy = c.c[1], cz = c.c[2];
      const x = Math.abs(P[i*3]), y = P[i*3+1], z = P[i*3+2];
      let r = NONE;
      if (/^skin|neck_muscles|hand_muscles|foot_muscles|intercostals|iliopsoas/.test(name)) r = NONE;
      else if (/chest_muscles/.test(name)) r = ID.Pectorals;
      else if (/deltoid/.test(name)) r = ID.Deltoids;
      else if (/trapezius/.test(name)) r = ID.Trapezius;
      else if (/upper_arm_muscles/.test(name)) r = cz > -0.02 ? ID.Biceps : ID.Triceps;
      else if (/forearm_muscles/.test(name)) r = ID.Forearms;
      else if (/abdominal_muscles/.test(name)) r = (x < 0.05 && z > 0.07) ? ID.Abdominals : ID.Obliques;
      else if (/shoulder_muscles/.test(name)) r = c === biggest ? ID.Latissimus : cz > 0 ? ID.Pectorals : cy < 1.25 ? ID.Latissimus : cy > 1.44 ? ID.Trapezius : ID['Upper back'];
      else if (/rotator_cuff/.test(name)) r = ID['Upper back'];
      else if (/back_muscles/.test(name)) r = y > 1.43 ? ID.Trapezius : y > 1.12 ? ID['Upper back'] : ID['Lower back'];
      else if (/gluteal/.test(name)) r = cy < 0.8 ? ID.Quadriceps : cz > -0.01 ? NONE : ID.Glutes;
      else if (/quadriceps/.test(name)) r = ID.Quadriceps;
      else if (/hamstrings/.test(name)) r = ID.Hamstrings;
      else if (/adductors/.test(name)) r = ID.Adductors;
      else if (/calf_|shin_muscles/.test(name)) r = cz < -0.015 ? ID.Calves : ID.Tibialis;
      region[i] = r;
      const label = r === NONE ? 'none' : NAMES[r]; report[name] = report[name] || {}; report[name][label] = (report[name][label] || 0) + 1;
    }
    const acc = doc.createAccessor().setType('SCALAR').setArray(region).setBuffer(doc.getRoot().listBuffers()[0]);
    prim.setAttribute('_REGION', acc);
  }
}
for (const [k, v] of Object.entries(report)) if (!/_r$/.test(k)) console.log(k.padEnd(22), JSON.stringify(v));
await io.write(process.argv[3], doc);
