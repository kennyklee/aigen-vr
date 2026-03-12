#!/usr/bin/env node
// Convert STEP file to GLB using occt-import-js
import fs from 'fs';
import path from 'path';
import occtImportJs from 'occt-import-js';

const inputPath = process.argv[2];
if (!inputPath) { console.error('Usage: node step-to-glb.mjs <file.step>'); process.exit(1); }

const outputPath = inputPath.replace(/\.step$/i, '.glb');

console.log(`Reading ${inputPath}...`);
const fileBuffer = fs.readFileSync(inputPath);

console.log('Initializing OpenCascade WASM...');
const occt = await occtImportJs();

console.log('Parsing STEP file...');
const result = occt.ReadStepFile(new Uint8Array(fileBuffer), null);

console.log(`Parsed: ${result.meshes.length} meshes`);

// Build a minimal GLB from the parsed meshes
// GLB = JSON chunk + BIN chunk
const meshes = result.meshes;
const accessors = [];
const bufferViews = [];
const gltfMeshes = [];
const nodes = [];
const binParts = [];
let byteOffset = 0;

for (let i = 0; i < meshes.length; i++) {
  const mesh = meshes[i];
  const positions = new Float32Array(mesh.attributes.position.array);
  const normals = mesh.attributes.normal ? new Float32Array(mesh.attributes.normal.array) : null;
  const indices = new Uint32Array(mesh.index.array);

  // Compute bounding box for positions
  let minPos = [Infinity, Infinity, Infinity];
  let maxPos = [-Infinity, -Infinity, -Infinity];
  for (let j = 0; j < positions.length; j += 3) {
    for (let k = 0; k < 3; k++) {
      if (positions[j + k] < minPos[k]) minPos[k] = positions[j + k];
      if (positions[j + k] > maxPos[k]) maxPos[k] = positions[j + k];
    }
  }

  const primitiveAttributes = {};

  // Position buffer view + accessor
  const posBuf = Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength);
  bufferViews.push({ buffer: 0, byteOffset, byteLength: posBuf.byteLength, target: 34962 });
  accessors.push({ bufferView: bufferViews.length - 1, componentType: 5126, count: positions.length / 3, type: 'VEC3', min: minPos, max: maxPos });
  primitiveAttributes.POSITION = accessors.length - 1;
  binParts.push(posBuf);
  byteOffset += posBuf.byteLength;
  // Pad to 4 bytes
  const posPad = (4 - (posBuf.byteLength % 4)) % 4;
  if (posPad) { binParts.push(Buffer.alloc(posPad)); byteOffset += posPad; }

  // Normal buffer view + accessor
  if (normals) {
    const normBuf = Buffer.from(normals.buffer, normals.byteOffset, normals.byteLength);
    bufferViews.push({ buffer: 0, byteOffset, byteLength: normBuf.byteLength, target: 34962 });
    accessors.push({ bufferView: bufferViews.length - 1, componentType: 5126, count: normals.length / 3, type: 'VEC3' });
    primitiveAttributes.NORMAL = accessors.length - 1;
    binParts.push(normBuf);
    byteOffset += normBuf.byteLength;
    const normPad = (4 - (normBuf.byteLength % 4)) % 4;
    if (normPad) { binParts.push(Buffer.alloc(normPad)); byteOffset += normPad; }
  }

  // Index buffer view + accessor
  const idxBuf = Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength);
  bufferViews.push({ buffer: 0, byteOffset, byteLength: idxBuf.byteLength, target: 34963 });
  accessors.push({ bufferView: bufferViews.length - 1, componentType: 5125, count: indices.length, type: 'SCALAR' });
  const indicesAccessor = accessors.length - 1;
  binParts.push(idxBuf);
  byteOffset += idxBuf.byteLength;
  const idxPad = (4 - (idxBuf.byteLength % 4)) % 4;
  if (idxPad) { binParts.push(Buffer.alloc(idxPad)); byteOffset += idxPad; }

  // Mesh color from face
  let material = undefined;
  if (mesh.color) {
    // We'll add a simple material per mesh
    material = i; // will create materials array after
  }

  gltfMeshes.push({
    primitives: [{ attributes: primitiveAttributes, indices: indicesAccessor, ...(material !== undefined ? { material } : {}) }]
  });
  nodes.push({ mesh: i, name: mesh.name || `part_${i}` });
}

// Create materials from mesh colors
const materials = meshes.map((mesh, i) => {
  const c = mesh.color || [0.6, 0.6, 0.6];
  return {
    pbrMetallicRoughness: {
      baseColorFactor: [c[0], c[1], c[2], 1.0],
      metallicFactor: 0.3,
      roughnessFactor: 0.7,
    },
    name: `material_${i}`
  };
});

const gltf = {
  asset: { version: '2.0', generator: 'step-to-glb' },
  scene: 0,
  scenes: [{ nodes: nodes.map((_, i) => i) }],
  nodes,
  meshes: gltfMeshes,
  materials,
  accessors,
  bufferViews,
  buffers: [{ byteLength: byteOffset }],
};

const jsonStr = JSON.stringify(gltf);
const jsonBuf = Buffer.from(jsonStr);
// Pad JSON to 4 bytes with spaces
const jsonPad = (4 - (jsonBuf.byteLength % 4)) % 4;
const jsonChunk = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);
const jsonChunkLen = jsonChunk.byteLength;

const binChunk = Buffer.concat(binParts);
const binChunkLen = binChunk.byteLength;

// GLB header: magic + version + length
// JSON chunk: length + type + data
// BIN chunk: length + type + data
const totalLength = 12 + 8 + jsonChunkLen + 8 + binChunkLen;
const glb = Buffer.alloc(totalLength);
let off = 0;

// Header
glb.writeUInt32LE(0x46546C67, off); off += 4; // magic "glTF"
glb.writeUInt32LE(2, off); off += 4;           // version
glb.writeUInt32LE(totalLength, off); off += 4;

// JSON chunk
glb.writeUInt32LE(jsonChunkLen, off); off += 4;
glb.writeUInt32LE(0x4E4F534A, off); off += 4; // "JSON"
jsonChunk.copy(glb, off); off += jsonChunkLen;

// BIN chunk
glb.writeUInt32LE(binChunkLen, off); off += 4;
glb.writeUInt32LE(0x004E4942, off); off += 4; // "BIN\0"
binChunk.copy(glb, off);

fs.writeFileSync(outputPath, glb);
console.log(`Wrote ${outputPath} (${(totalLength / 1024 / 1024).toFixed(1)} MB)`);
