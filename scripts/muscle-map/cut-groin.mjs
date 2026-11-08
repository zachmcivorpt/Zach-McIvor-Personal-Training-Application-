// Removes the genitals from the ghost skin (#205): skin triangles in the
// groin box in front of the body. Muscles untouched.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]);
const xf = (m, v) => [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12], m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13], m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]];
for (const node of doc.getRoot().listNodes()) {
  if (node.getName() !== 'skin' || !node.getMesh()) continue;
  const M = node.getWorldMatrix();
  for (const prim of node.getMesh().listPrimitives()) {
    const pos = prim.getAttribute('POSITION'); const idx = prim.getIndices(); const ia = idx.getArray(); const e = [];
    const P = []; for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, e); P.push(xf(M, e)); }
    const inBox = ([x, y, z]) => Math.abs(x) < 0.042 && y > 0.70 && y < 0.865 && z > 0.025;
    const keep = [];
    let cut = 0;
    for (let t = 0; t < ia.length; t += 3) {
      const c = [0, 1, 2].map((k) => (P[ia[t]][k] + P[ia[t + 1]][k] + P[ia[t + 2]][k]) / 3);
      if (inBox(c)) { cut++; continue; }
      keep.push(ia[t], ia[t + 1], ia[t + 2]);
    }
    idx.setArray(new (ia.constructor)(keep));
    console.log('skin triangles removed:', cut, 'kept:', keep.length / 3);
  }
}
await doc.transform(prune());
await io.write(process.argv[3], doc);
