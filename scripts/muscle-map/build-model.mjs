// Builds public/models/muscle-map.glb from Z-Anatomy (via @authorod/svitylo-3d-anatomy-data,
// CC BY-SA 4.0): every muscle separate, each vertex tagged with its muscle group (_REGION).
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { quantize, reorder } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const REL = process.argv[2];
const OUT = process.argv[3];
const manifest = JSON.parse(fs.readFileSync(path.join(REL, 'manifest.json'), 'utf8'));
const meshToStruct = new Map();
// The most specific structure owning each mesh (parents list their children's meshes too).
const owner = new Map();
for (const s of manifest.structures) for (const m of s.meshes || []) { const cur = owner.get(m); if (!cur || (s.meshes.length < cur.n)) owner.set(m, { id: s.id, n: s.meshes.length }); }
for (const [m, o] of owner) meshToStruct.set(m, o.id);

const NAMES = ['Pectorals','Deltoids','Trapezius','Biceps','Triceps','Forearms','Abdominals','Obliques','Latissimus','Upper back','Lower back','Glutes','Quadriceps','Hamstrings','Adductors','Calves','Tibialis'];
const ID = Object.fromEntries(NAMES.map((n, i) => [n, i]));
const DROP = /bursa|sheath|ligament|retinacul|fascia|tendon|aponeur|septum|membrane|capsule|tract|perine|bulbospong|ischiocaver|cremaster|sphincter|levator_ani|coccyge|penis|scrot|genital|pubic|anal|urogenital|hair|eyelash|diaphragm|intercostal|transversus|subcostal|levatores_costarum/;
const RULES = [
  [/pectoralis_(major|minor)/, 'Pectorals'],
  [/deltoid/, 'Deltoids'],
  [/trapezius|rhomboid|levator_scapulae|infraspinatus|supraspinatus|teres_(major|minor)|serratus_posterior_superior/, 'Upper back'],
  [/latissimus/, 'Latissimus'],
  [/biceps_brachii|brachialis|coracobrachialis/, 'Biceps'],
  [/triceps|anconeus/, 'Triceps'],
  [/brachioradialis|carpi|digitorum_superficialis|digitorum_profundus|pronator|supinator|palmaris_longus|pollicis_longus|extensor_digitorum_muscle|extensor_digiti_minimi|extensor_indicis|extensor_pollicis_brevis/, 'Forearms'],
  [/rectus_abdominis|pyramidalis/, 'Abdominals'],
  [/abdominal_oblique|serratus_anterior/, 'Obliques'],
  [/iliocostalis|longissimus|spinalis|multifidus|quadratus_lumborum|serratus_posterior_inferior|erector/, 'Lower back'],
  [/gluteus|tensor_fasciae_latae/, 'Glutes'],
  [/rectus_femoris|vastus/, 'Quadriceps'],
  [/biceps_femoris|semitendinosus|semimembranosus/, 'Hamstrings'],
  [/adductor_(longus|brevis|magnus|minimus)|gracilis|pectineus/, 'Adductors'],
  [/gastrocnemius|soleus|plantaris/, 'Calves'],
  [/tibialis_anterior|extensor_digitorum_longus|extensor_hallucis_longus|fibularis|peroneus/, 'Tibialis'],
];
const groupOf = (sid) => { for (const [re, g] of RULES) if (re.test(sid)) return ID[g]; return -1; };

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const out = new Document();
const buf = out.createBuffer();
const scene = out.createScene();
const xf = (m, v) => [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12], m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13], m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]];
const xn = (m, v) => { const r = [m[0]*v[0]+m[4]*v[1]+m[8]*v[2], m[1]*v[0]+m[5]*v[1]+m[9]*v[2], m[2]*v[0]+m[6]*v[1]+m[10]*v[2]]; const l = Math.hypot(...r) || 1; return r.map((x) => x / l); };
const stats = {};
const chunks = manifest.chunks.filter((c) => c.system === 'muscular' || c.id === 'regions.root');
for (const c of chunks) {
  if (/fasciae|external_intercostal/.test(c.id)) continue;
  const skin = c.system === 'regions';
  const doc = await io.read(path.join(REL, c.files[process.argv[4] || "economy"].path));
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    const M = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), I = prim.getAttribute('_ID'), ix = prim.getIndices().getArray();
      const e = [], keepV = new Int32Array(P.getCount()).fill(-1), pos = [], nor = [], reg = [], idx = [];
      const vOK = (i) => { I.getElement(i, e); const sid = meshToStruct.get(Math.round(e[0])) || ''; if (DROP.test(sid)) return null; return skin ? -1 : groupOf(sid); };
      const vReg = new Float32Array(P.getCount()); const vKeep = new Uint8Array(P.getCount());
      for (let i = 0; i < P.getCount(); i++) {
        const g = vOK(i); if (g === null) continue;
        // The oblique meshes carry their aponeurosis across the front of the
        // abdomen, over rectus abdominis: keep only the fleshy side part.
        if (g === ID.Obliques) { P.getElement(i, e); const w = xf(M, e); if (Math.abs(w[0]) < 0.085 && w[2] > 0.03) continue; }
        vKeep[i] = 1; vReg[i] = g;
      }
      for (let t = 0; t < ix.length; t += 3) {
        const a = ix[t], b = ix[t+1], d = ix[t+2];
        if (!vKeep[a] || !vKeep[b] || !vKeep[d]) continue;
        for (const v of [a, b, d]) {
          if (keepV[v] < 0) {
            keepV[v] = pos.length / 3;
            P.getElement(v, e); pos.push(...xf(M, e));
            N.getElement(v, e); nor.push(...xn(M, e));
            reg.push(vReg[v]);
            const name = skin ? 'skin' : NAMES[vReg[v]] || 'none'; stats[name] = (stats[name] || 0) + 1;
          }
          idx.push(keepV[v]);
        }
      }
      if (!idx.length) continue;
      const np = out.createPrimitive()
        .setAttribute('POSITION', out.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buf))
        .setAttribute('NORMAL', out.createAccessor().setType('VEC3').setArray(new Float32Array(nor)).setBuffer(buf))
        .setIndices(out.createAccessor().setType('SCALAR').setArray(new Uint32Array(idx)).setBuffer(buf));
      if (!skin) np.setAttribute('_REGION', out.createAccessor().setType('SCALAR').setArray(new Float32Array(reg)).setBuffer(buf));
      const name = skin ? 'skin' : 'muscles.' + c.id.replace('muscular.', '');
      scene.addChild(out.createNode(name).setMesh(out.createMesh(name).addPrimitive(np)));
    }
  }
}
console.log(stats);
await out.transform(reorder({ encoder: MeshoptEncoder }), quantize({ quantizeNormal: 8, quantizePosition: 14 }));
out.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await io.write(OUT, out);
console.log('bytes', fs.statSync(OUT).size);
