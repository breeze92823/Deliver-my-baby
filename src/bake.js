import { Group, Matrix4, Mesh } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// --- Baking: one mesh per material ------------------------------------------------
// Props are built from many small meshes (a bed is ~40); merging the ones
// that share a look keeps a set piece to a handful of draw calls (mobile).
// Meshes are grouped by material AND shadow flags, so walls that must not
// cast (rooms lit through the ceiling) stay non-casting after the merge.
const matKey = (m) =>
  [
    m.type, m.color?.getHexString(), m.emissive?.getHexString(), m.emissiveIntensity, m.vertexColors, m.side, m.flatShading,
    m.transparent, m.opacity, m.blending, m.depthWrite, m.alphaTest, m.polygonOffset, m.polygonOffsetFactor,
    m.map?.uuid, m.normalMap?.uuid, m.emissiveMap?.uuid, m.bumpMap?.uuid, m.roughness, m.metalness, m.userData.k,
  ].join('|')
const rel = new Matrix4()
// castShadow: 'keep' (each part's own flag), true or false (force all).
export function bake(root, castShadow = 'keep') {
  root.updateMatrixWorld(true)
  const inv = root.matrixWorld.clone().invert()
  const groups = new Map() // key -> { mat, geos, cast, receive }
  const out = new Group()
  root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh) return
    rel.multiplyMatrices(inv, o.matrixWorld)
    const cast = castShadow === 'keep' ? o.castShadow : castShadow
    if (Array.isArray(o.material)) {
      const m = new Mesh(o.geometry.clone().applyMatrix4(rel), o.material) // multi-material: kept as is
      m.castShadow = cast
      m.receiveShadow = o.receiveShadow
      out.add(m)
      return
    }
    const key = matKey(o.material) + (cast ? '|c' : '|n') + (o.receiveShadow ? 'r' : '')
    let e = groups.get(key)
    if (!e) groups.set(key, (e = { mat: o.material, geos: [], cast, receive: o.receiveShadow }))
    e.geos.push((o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(rel))
  })
  for (const { mat, geos, cast, receive } of groups.values()) {
    const names = Object.keys(geos[0].attributes).filter((n) => geos.every((g) => g.attributes[n]))
    for (const g of geos) {
      for (const n of Object.keys(g.attributes)) if (!names.includes(n)) g.deleteAttribute(n)
      g.morphAttributes = {}
      g.clearGroups()
    }
    const merged = mergeGeometries(geos)
    for (const g of geos) g.dispose()
    if (!merged) continue
    const m = new Mesh(merged, mat)
    m.castShadow = cast
    m.receiveShadow = receive
    out.add(m)
  }
  return out
}
