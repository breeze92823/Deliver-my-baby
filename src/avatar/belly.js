// The player's pregnant belly, built INTO the avatar's own torso rather than stuck on as a ball:
// the torso mesh's front is subdivided and pushed forward into a rounded bump, so the player's
// Bloxity shirt / skin texture wraps over it, it bends with the spine and widens with
// torsoScaleX. Works on any body that hangs off the shared rig's Spine1 / Spine2:
//   - player.glb's default_torso (a 24-vertex box) and equipped torso parts (any shape, skinned
//     to the same skeleton; loader.js swaps them into default_torso),
//   - the procedural stand-in (avatar/character.js, a rigid box parented to Spine1).
// The torso is found by BONE, not by mesh name: a vertex counts as torso by its skin weight on
// Spine1 / Spine2 (rigid meshes: parented straight to one of them). Its bump is sized from that
// torso's own measured box (BELLY in config.js), so slim, wide, short and tall torsos all fit.
//
// The bulge is a pure function of rest position, so vertices duplicated along UV seams move
// identically and the mesh never cracks; edges are split by a position-only rule for the same
// reason. Deformed geometry is cached per source geometry, so every mom wearing the default
// torso shares one copy; only breathing (the local player) takes a private clone.
//
// A torso that can't be bulged (no torso vertices, a flat or degenerate box, morph targets)
// falls back to a sphere on Spine1 tinted with the torso texture's average colour, so every
// player still gets a belly. Nothing here throws outward.
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Matrix3,
  Matrix4,
  Mesh,
  SphereGeometry,
  Uint16BufferAttribute,
  Uint32BufferAttribute,
  Vector3,
} from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { BELLY } from '../config.js'
import { bellyMaterial } from '../characters.js'

const TORSO_BONES = new Set(['Spine1', 'Spine2'])
const EDGE_KEY = 2 ** 21 // vertex-pair key: a * EDGE_KEY + b stays exact well past any torso's count

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))

// --- Finding the torso --------------------------------------------------------------------------

// Every mesh in the avatar that carries torso: skinned meshes with weight on Spine1/Spine2, rigid
// meshes parented directly to one (accessories are OBJ groups, so their meshes never are).
function torsoTargets(root) {
  const out = []
  root.traverse((o) => {
    if (!o.isMesh || o.userData.bellyFx || !o.geometry?.attributes?.position) return
    if (o.isSkinnedMesh) {
      const ids = new Set()
      ;(o.skeleton?.bones || []).forEach((b, i) => TORSO_BONES.has(b.name) && ids.add(i))
      const skinned = !!o.geometry.attributes.skinIndex && !!o.geometry.attributes.skinWeight
      // A part GLB with no skin data lands in default_torso as plain geometry: all torso.
      if (skinned && ids.size) out.push({ mesh: o, ids })
      else if (!skinned && /torso/i.test(o.name)) out.push({ mesh: o, ids: null })
    } else if (TORSO_BONES.has(o.parent?.name)) out.push({ mesh: o, ids: null })
  })
  return out
}

// Mesh-local -> character (root) space at rest. A SkinnedMesh's rest pose is its local space under
// mesh.matrixWorld whatever the bones are doing; a rigid part is authored axis-aligned on its bone
// (character.js), so its own local frame already faces +Z.
function restFrame(root, mesh) {
  if (!mesh.isSkinnedMesh) return new Matrix4()
  root.updateMatrixWorld(true)
  return root.matrixWorld.clone().invert().multiply(mesh.matrixWorld)
}

function torsoWeights(geometry, ids) {
  const n = geometry.attributes.position.count
  const w = new Float32Array(n)
  if (!ids) return w.fill(1)
  const si = geometry.attributes.skinIndex
  const sw = geometry.attributes.skinWeight
  for (let i = 0; i < n; i++) {
    let t = 0
    for (let k = 0; k < 4; k++) if (ids.has(si.getComponent(i, k))) t += sw.getComponent(i, k)
    w[i] = Math.min(1, t)
  }
  return w
}

// The bump for one torso, in character space: centre, half-axes, the front surface and depth.
function measure(rootPos, weights, size) {
  const lo = new Vector3(Infinity, Infinity, Infinity)
  const hi = new Vector3(-Infinity, -Infinity, -Infinity)
  let count = 0
  const p = new Vector3()
  for (let i = 0; i < weights.length; i++) {
    if (weights[i] < 0.5) continue
    p.fromArray(rootPos, i * 3)
    lo.min(p)
    hi.max(p)
    count++
  }
  if (count < BELLY.minTorsoVerts) return null
  const w = hi.x - lo.x
  const h = hi.y - lo.y
  const d = hi.z - lo.z
  if (!(w > 1e-3 && h > 1e-3 && d > 1e-3)) return null
  const s = BELLY[size]
  return {
    cx: (lo.x + hi.x) / 2,
    cy: lo.y + BELLY.centerY * h,
    cz: (lo.z + hi.z) / 2,
    front: hi.z,
    rx: s.width * w,
    ry: s.height * h,
    depth: s.depth * Math.min(w, h),
  }
}

// 0..1 dome over the front face (sqrt of a smoothstep: round on top, soft at the rim).
function dome(B, x, y) {
  const dx = (x - B.cx) / B.rx
  const dy = (y - B.cy) / B.ry
  const s = 1 - dx * dx - dy * dy
  return s <= 0 ? 0 : Math.sqrt(smooth(s))
}
// Full bulge on the front surface, fading to none at the torso's mid-depth plane.
const bulge = (B, x, y, z) => dome(B, x, y) * smooth((z - B.cz) / (B.front - B.cz))

// --- Subdividing ------------------------------------------------------------------------------

// Plain arrays of every vertex attribute, so the subdivider can grow them.
function readAttributes(geometry) {
  const out = {}
  for (const name in geometry.attributes) {
    const a = geometry.attributes[name]
    if (a.isInterleavedBufferAttribute) return null
    const data = new Array(a.count * a.itemSize)
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) data[i * a.itemSize + k] = a.getComponent(i, k)
    out[name] = { size: a.itemSize, data, normalized: a.normalized, ctor: a.array.constructor }
  }
  return out
}

// Midpoint skin binding: both ends' (bone, weight) pairs merged, the strongest four kept.
function mergeSkin(attrs, a, b, out) {
  const si = attrs.skinIndex.data
  const sw = attrs.skinWeight.data
  const sum = new Map()
  for (const v of [a, b]) for (let k = 0; k < 4; k++) {
    const wt = sw[v * 4 + k] * 0.5
    if (wt > 0) sum.set(si[v * 4 + k], (sum.get(si[v * 4 + k]) || 0) + wt)
  }
  const top = [...sum].sort((x, y) => y[1] - x[1]).slice(0, 4)
  const total = top.reduce((t, e) => t + e[1], 0) || 1
  for (let k = 0; k < 4; k++) {
    out.skinIndex.push(top[k] ? top[k][0] : 0)
    out.skinWeight.push(top[k] ? top[k][1] / total : 0)
  }
}

// Splits every long edge that reaches into the bump's box until none is left, red-green style
// (a triangle with 1 / 2 / 3 split edges becomes 2 / 3 / 4), so no T-junction ever opens.
// `rootPos` (character-space positions) and `weights` grow alongside the attributes.
function subdivide(attrs, tris, rootPos, weights, B) {
  const target = BELLY.edge * Math.min(B.rx, B.ry)
  const target2 = target * target
  const box = { x0: B.cx - B.rx, x1: B.cx + B.rx, y0: B.cy - B.ry, y1: B.cy + B.ry, z0: B.cz }
  const skinned = !!(attrs.skinIndex && attrs.skinWeight)
  const others = Object.keys(attrs).filter((n) => !(skinned && (n === 'skinIndex' || n === 'skinWeight')))

  const wantSplit = (a, b) => {
    const ax = rootPos[a * 3], ay = rootPos[a * 3 + 1], az = rootPos[a * 3 + 2]
    const bx = rootPos[b * 3], by = rootPos[b * 3 + 1], bz = rootPos[b * 3 + 2]
    const len2 = (ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2
    if (len2 <= target2) return false
    return Math.max(ax, bx) >= box.x0 && Math.min(ax, bx) <= box.x1 && Math.max(ay, by) >= box.y0 && Math.min(ay, by) <= box.y1 && Math.max(az, bz) >= box.z0
  }
  const addMid = (a, b) => {
    const m = weights.length
    for (const name of others) {
      const { size, data } = attrs[name]
      for (let k = 0; k < size; k++) data.push((data[a * size + k] + data[b * size + k]) / 2)
    }
    if (skinned) mergeSkin(attrs, a, b, { skinIndex: attrs.skinIndex.data, skinWeight: attrs.skinWeight.data })
    for (let k = 0; k < 3; k++) rootPos.push((rootPos[a * 3 + k] + rootPos[b * 3 + k]) / 2)
    weights.push((weights[a] + weights[b]) / 2)
    return m
  }

  for (let pass = 0; pass < BELLY.maxPasses; pass++) {
    const mids = new Map()
    const mid = (a, b) => {
      const key = a < b ? a * EDGE_KEY + b : b * EDGE_KEY + a
      let m = mids.get(key)
      if (m === undefined) {
        m = wantSplit(a, b) ? addMid(a, b) : -1
        mids.set(key, m)
      }
      return m
    }
    const next = []
    let changed = false
    for (const [a, b, c, g] of tris) {
      const m0 = mid(a, b)
      const m1 = mid(b, c)
      const m2 = mid(c, a)
      const n = (m0 >= 0) + (m1 >= 0) + (m2 >= 0)
      if (n === 0) {
        next.push([a, b, c, g])
        continue
      }
      changed = true
      if (n === 3) {
        next.push([a, m0, m2, g], [m0, b, m1, g], [m2, m1, c, g], [m0, m1, m2, g])
      } else if (n === 1) {
        if (m0 >= 0) next.push([a, m0, c, g], [m0, b, c, g])
        else if (m1 >= 0) next.push([b, m1, a, g], [m1, c, a, g])
        else next.push([c, m2, b, g], [m2, a, b, g])
      } else {
        // Rotate so the two split edges are A-B (M0) and B-C (M1); C-A stays whole.
        let A, Bv, C, M0, M1
        if (m0 >= 0 && m1 >= 0) [A, Bv, C, M0, M1] = [a, b, c, m0, m1]
        else if (m1 >= 0 && m2 >= 0) [A, Bv, C, M0, M1] = [b, c, a, m1, m2]
        else [A, Bv, C, M0, M1] = [c, a, b, m2, m0]
        next.push([M0, Bv, M1, g], [A, M0, M1, g], [A, M1, C, g])
      }
    }
    tris = next
    if (!changed) break
  }
  return tris
}

// --- Building the bulged torso ----------------------------------------------------------------

const cache = new WeakMap() // source geometry -> Map(key -> result | null)

// Returns { geometry, rest, offset, B } (rest = the subdivided positions before the bulge,
// offset = the bulge per vertex, both mesh-local) or null when this torso can't take one.
function bulgedGeometry(source, ids, frame, size) {
  const key = `${size}|${ids ? [...ids].join(',') : 'rigid'}|${frame.elements.map((e) => e.toFixed(4)).join(',')}`
  let perGeometry = cache.get(source)
  if (!perGeometry) cache.set(source, (perGeometry = new Map()))
  if (perGeometry.has(key)) return perGeometry.get(key)
  let result = null
  try {
    result = buildBulged(source, ids, frame, size)
  } catch (err) {
    console.warn('[belly] torso bulge failed; using the sphere', err)
  }
  perGeometry.set(key, result)
  return result
}

function buildBulged(source, ids, frame, size) {
  if (source.morphAttributes && Object.keys(source.morphAttributes).length) return null
  // Non-indexed parts get welded first, so neighbouring triangles share their split edges.
  const geometry = source.index ? source : mergeVertices(source.clone())
  const attrs = readAttributes(geometry)
  if (!attrs?.position) return null

  const n = geometry.attributes.position.count
  const weights = Array.from(torsoWeights(geometry, ids))
  const rootPos = new Array(n * 3)
  const v = new Vector3()
  for (let i = 0; i < n; i++) {
    v.fromArray(attrs.position.data, i * 3).applyMatrix4(frame)
    rootPos[i * 3] = v.x
    rootPos[i * 3 + 1] = v.y
    rootPos[i * 3 + 2] = v.z
  }
  const B = measure(rootPos, weights, size)
  if (!B) return null

  // Triangles, each remembering its draw group (multi-material parts keep their materials).
  const index = geometry.index.array
  const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: index.length, materialIndex: 0 }]
  let tris = []
  groups.forEach((grp, gi) => {
    for (let t = grp.start; t + 2 < grp.start + grp.count; t += 3) tris.push([index[t], index[t + 1], index[t + 2], gi])
  })
  tris = subdivide(attrs, tris, rootPos, weights, B)
  const inverse = new Matrix3().setFromMatrix4(frame.clone().invert())

  // The bulge, in character space (+Z), carried back into the mesh's own space.
  const count = weights.length
  const offset = new Float32Array(count * 3)
  const d = new Vector3()
  let bulged = 0
  for (let i = 0; i < count; i++) {
    const f = bulge(B, rootPos[i * 3], rootPos[i * 3 + 1], rootPos[i * 3 + 2]) * weights[i]
    if (f <= 1e-4) continue
    bulged++
    d.set(0, 0, B.depth * f).applyMatrix3(inverse)
    offset[i * 3] = d.x
    offset[i * 3 + 1] = d.y
    offset[i * 3 + 2] = d.z
  }
  if (!bulged) return null

  const out = new BufferGeometry()
  for (const name in attrs) {
    const { size: s, data, normalized, ctor } = attrs[name]
    if (name === 'skinIndex') out.setAttribute(name, new Uint16BufferAttribute(data.map(Math.round), s))
    else if (name === 'skinWeight' || ctor === Float32Array || normalized) out.setAttribute(name, new Float32BufferAttribute(data, s))
    else out.setAttribute(name, new BufferAttribute(new ctor(data), s, normalized))
  }
  const rest = out.attributes.position.array.slice()
  const pos = out.attributes.position.array
  for (let i = 0; i < pos.length; i++) pos[i] += offset[i]

  // Sort triangles back into their groups.
  tris.sort((x, y) => x[3] - y[3])
  const IndexArray = count > 65535 ? Uint32BufferAttribute : Uint16BufferAttribute
  out.setIndex(new IndexArray(tris.flatMap((t) => [t[0], t[1], t[2]]), 1))
  if (geometry.groups.length) {
    let start = 0
    groups.forEach((grp, gi) => {
      const c = tris.filter((t) => t[3] === gi).length * 3
      if (c) out.addGroup(start, c, grp.materialIndex)
      start += c
    })
  }

  // Fresh normals only where the surface moved; everywhere else keeps the part's own shading.
  if (out.attributes.normal) {
    const authored = out.attributes.normal.array.slice()
    out.computeVertexNormals()
    const nrm = out.attributes.normal.array
    for (let i = 0; i < count; i++) {
      if (offset[i * 3] || offset[i * 3 + 1] || offset[i * 3 + 2]) continue
      nrm[i * 3] = authored[i * 3]
      nrm[i * 3 + 1] = authored[i * 3 + 1]
      nrm[i * 3 + 2] = authored[i * 3 + 2]
    }
  }
  out.computeBoundingBox()
  out.computeBoundingSphere()
  out.name = `${source.name || 'torso'}_belly_${size}`
  return { geometry: out, rest, offset, B, bulged }
}

// --- Accessories ------------------------------------------------------------------------------

// Chest / waist cosmetics (tagged by loader.js) ride forward on the bump instead of sinking into it.
// Back items sit behind the torso's mid-plane and stay put.
const _box = { min: new Vector3(), max: new Vector3() }
function nudgeAccessories(root, B, moved) {
  const toRoot = root.matrixWorld.clone().invert()
  const linear = new Matrix3().setFromMatrix4(root.matrixWorld)
  root.traverse((o) => {
    if (!o.userData.avatarSlot || !o.parent) return
    let any = false
    _box.min.set(Infinity, Infinity, Infinity)
    _box.max.set(-Infinity, -Infinity, -Infinity)
    o.updateMatrixWorld(true)
    o.traverse((m) => {
      if (!m.isMesh || !m.geometry) return
      m.geometry.boundingBox || m.geometry.computeBoundingBox()
      const bb = m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld).applyMatrix4(toRoot)
      _box.min.min(bb.min)
      _box.max.max(bb.max)
      any = true
    })
    if (!any) return
    const c = _box.min.clone().add(_box.max).multiplyScalar(0.5)
    if (c.z <= B.cz + 0.1 * (B.front - B.cz)) return // behind / around the waist: leave it
    const f = dome(B, c.x, c.y)
    if (f <= 1e-3) return
    const world = o.getWorldPosition(new Vector3())
    const push = new Vector3(0, 0, B.depth * f).applyMatrix3(linear)
    moved.push({ object: o, position: o.position.clone() })
    o.position.copy(o.parent.worldToLocal(world.add(push)))
  })
}

// --- Fallback sphere --------------------------------------------------------------------------

const sphereGeometry = new SphereGeometry(1, 16, 12)
const colorCache = new WeakMap()

// The average colour of the torso's texture over its front-facing UVs (times the material colour),
// so the fallback ball at least wears the player's shirt colour.
function torsoColor(root) {
  try {
    const targets = torsoTargets(root)
    const mesh = (targets.find((t) => /torso/i.test(t.mesh.name)) || targets[0])?.mesh
    const material = Array.isArray(mesh?.material) ? mesh.material[0] : mesh?.material
    const base = material?.color ? material.color.clone() : new Color(1, 1, 1)
    const image = material?.map?.image
    if (!image?.width) return material?.color ? base : new Color(BELLY.color)
    let avg = colorCache.get(image)
    if (!avg) {
      const g = mesh.geometry
      const uv = g.attributes.uv
      const nrm = g.attributes.normal
      let u0 = 1, v0 = 1, u1 = 0, v1 = 0
      for (let i = 0; uv && i < uv.count; i++) {
        if (nrm && nrm.getZ(i) < 0.5) continue
        u0 = Math.min(u0, uv.getX(i)); u1 = Math.max(u1, uv.getX(i))
        v0 = Math.min(v0, uv.getY(i)); v1 = Math.max(v1, uv.getY(i))
      }
      if (!(u1 > u0 && v1 > v0)) [u0, v0, u1, v1] = [0, 0, 1, 1]
      const flip = material.map.flipY
      const sx = u0 * image.width
      const sy = (flip ? 1 - v1 : v0) * image.height
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 8
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(image, sx, sy, Math.max(1, (u1 - u0) * image.width), Math.max(1, (v1 - v0) * image.height), 0, 0, 8, 8)
      const px = ctx.getImageData(0, 0, 8, 8).data
      let r = 0, gr = 0, b = 0, a = 0
      for (let i = 0; i < px.length; i += 4) {
        const w = px[i + 3] / 255
        r += px[i] * w; gr += px[i + 1] * w; b += px[i + 2] * w; a += w
      }
      if (!a) return new Color(BELLY.color)
      avg = new Color().setRGB(r / a / 255, gr / a / 255, b / a / 255, 'srgb')
      colorCache.set(image, avg)
    }
    return avg.clone().multiply(base)
  } catch {
    return new Color(BELLY.color) // tainted canvas, odd image type...
  }
}

function attachSphere(root, size) {
  const spine = root.nodes?.Spine1
  if (!spine) return null
  root.updateMatrixWorld(true)
  const radius = BELLY.sphere[size]
  const b = new Mesh(sphereGeometry, bellyMaterial(torsoColor(root)))
  b.castShadow = true
  b.name = 'belly'
  b.userData.bellyFx = true
  const v = new Vector3(0, 3.45, 0.55 + radius * 0.5)
  root.localToWorld(v)
  spine.worldToLocal(v)
  b.position.copy(v)
  const rootScale = root.getWorldScale(new Vector3()).x
  const spineScale = spine.getWorldScale(new Vector3()).x
  b.scale.set(radius * 1.04, radius, radius).multiplyScalar(rootScale / spineScale)
  b.userData.base = b.scale.clone()
  spine.add(b)
  return b
}

// --- Public API -------------------------------------------------------------------------------

// Gives `root` (any avatar from character.js / loader.js) a belly; `twins` makes it bigger.
// Replaces any belly it already has. Call after loader.js has swapped in the equipped parts.
export function attachBelly(root, { twins = false } = {}) {
  if (!root) return null
  removeBelly(root)
  const size = twins ? 'twins' : 'one'
  const state = { size, swaps: [], moved: [], sphere: null, breath: 0 }
  try {
    for (const { mesh, ids } of torsoTargets(root)) {
      const built = bulgedGeometry(mesh.geometry, ids, restFrame(root, mesh), size)
      if (!built) continue
      state.swaps.push({ mesh, original: mesh.geometry, built, own: null })
      mesh.geometry = built.geometry
    }
    if (state.swaps.length) {
      const skinned = state.swaps.find((s) => s.mesh.isSkinnedMesh)
      if (skinned) nudgeAccessories(root, skinned.built.B, state.moved)
    } else state.sphere = attachSphere(root, size)
  } catch (err) {
    console.warn('[belly] attach failed', err)
    restore(state)
    state.swaps.length = 0
    state.sphere = attachSphere(root, size)
  }
  root.userData.belly = state
  return state
}

function restore(state) {
  for (const s of state.swaps) {
    s.mesh.geometry = s.original
    s.own?.dispose()
  }
  for (const m of state.moved) m.object.position.copy(m.position)
  state.sphere?.parent?.remove(state.sphere)
}

export function removeBelly(root) {
  const state = root?.userData?.belly
  if (!state) return
  try {
    restore(state)
  } catch (err) {
    console.warn('[belly] remove failed', err)
  }
  root.userData.belly = null
}

// The belly swelling with a breath: `amount` 0 = resting, 0.05 = 5% bigger. Takes a private copy of
// the shared bulged geometry the first time, so only this avatar breathes.
export function breatheBelly(root, amount) {
  const state = root?.userData?.belly
  if (!state || state.breath === amount) return
  state.breath = amount
  if (state.sphere) {
    state.sphere.scale.copy(state.sphere.userData.base).multiplyScalar(1 + amount)
    return
  }
  for (const s of state.swaps) {
    if (!s.own) {
      s.own = s.built.geometry.clone()
      s.mesh.geometry = s.own
    }
    const pos = s.own.attributes.position
    const { rest, offset } = s.built
    // A breath pushes the dome out further (its offset scaled); the rest of the torso stays put.
    const k = 1 + amount * 3
    for (let i = 0; i < pos.array.length; i++) pos.array[i] = rest[i] + offset[i] * k
    pos.needsUpdate = true
  }
}

export const hasBelly = (root) => !!root?.userData?.belly
