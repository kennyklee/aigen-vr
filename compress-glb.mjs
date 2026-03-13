#!/usr/bin/env node
// Compress robot-model.glb for Quest 3: dedup → simplify → quantize → draco
import { readFileSync, writeFileSync } from 'fs';
import { Document, NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { dedup, quantize, prune, weld, simplify as simplifyMesh } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptSimplifier } from 'meshoptimizer';

const INPUT = process.argv[2] || 'robot-model.glb';
const OUTPUT = process.argv[3] || 'robot-model-compressed.glb';
const SIMPLIFY_RATIO = parseFloat(process.argv[4] || '0.5'); // keep 50% of vertices

async function main() {
  console.log(`Reading ${INPUT}...`);

  const io = new NodeIO()
    .registerExtensions([KHRDracoMeshCompression, KHRMeshQuantization])
    .registerDependencies({
      'draco3d.encoder': await draco3d.createEncoderModule(),
      'draco3d.decoder': await draco3d.createDecoderModule(),
    });

  const doc = await io.read(INPUT);

  // Stats before
  let vertsBefore = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (pos) vertsBefore += pos.getCount();
    }
  }
  console.log(`Before: ${doc.getRoot().listMeshes().length} meshes, ${vertsBefore.toLocaleString()} vertices`);

  // 1. Dedup — merge identical accessors and materials
  console.log('Deduplicating...');
  await doc.transform(dedup());

  // 2. Weld — merge nearby vertices (tolerance in world units)
  console.log('Welding vertices...');
  await doc.transform(weld({ tolerance: 0.001 }));

  // 3. Simplify — reduce per-mesh vertex count
  console.log(`Simplifying (keeping ${(SIMPLIFY_RATIO * 100).toFixed(0)}% of vertices)...`);
  await MeshoptSimplifier.ready;
  await doc.transform(
    simplifyMesh({ simplifier: MeshoptSimplifier, ratio: SIMPLIFY_RATIO, error: 0.001 })
  );

  // 4. Quantize — float32 → int16 positions/normals
  console.log('Quantizing...');
  await doc.transform(quantize({ quantizePosition: 14, quantizeNormal: 8 }));

  // 5. Prune — remove unused resources
  console.log('Pruning...');
  await doc.transform(prune());

  // 6. Draco compress
  console.log('Draco compressing...');
  doc.createExtension(KHRDracoMeshCompression).setRequired(true).setEncoderOptions({
    method: KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER,
    encodeSpeed: 5,
    decodeSpeed: 5,
  });

  // Stats after
  let vertsAfter = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (pos) vertsAfter += pos.getCount();
    }
  }
  console.log(`After: ${doc.getRoot().listMeshes().length} meshes, ${vertsAfter.toLocaleString()} vertices`);
  console.log(`Vertex reduction: ${((1 - vertsAfter / vertsBefore) * 100).toFixed(1)}%`);

  // Write
  console.log(`Writing ${OUTPUT}...`);
  await io.write(OUTPUT, doc);

  const sizeBefore = readFileSync(INPUT).length;
  const sizeAfter = readFileSync(OUTPUT).length;
  console.log(`Size: ${(sizeBefore / 1024 / 1024).toFixed(1)} MB → ${(sizeAfter / 1024 / 1024).toFixed(1)} MB (${((1 - sizeAfter / sizeBefore) * 100).toFixed(1)}% reduction)`);
}

main().catch(err => { console.error(err); process.exit(1); });
