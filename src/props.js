// Prop kit for this game. A Builder places meshes in an axis-aligned group at a
// world offset and registers matching fixed colliders (so physics matches what
// is drawn). Low-poly plants/trees use flat-shaded icosahedra; signs and posters
// are canvas textures.
import {
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  BoxGeometry,
  Vector3,
  CatmullRomCurve3,
  TubeGeometry,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { RAPIER, addFixed } from './physics.js'
import { mulberry32 } from './textures.js'
import { signTex, tex } from './paint.js'

const mats = new Map()
export function M(color, rough = 0.7, extra = {}) {
  const key = color + '|' + rough + '|' + Object.entries(extra).map(([k, v]) => k + ':' + (v?.uuid ?? v)).join(',')
  if (!mats.has(key)) mats.set(key, new MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }))
  return mats.get(key)
}
export const flat = (color, rough = 0.8) => M(color, rough, { flatShading: true })

const BOX = new BoxGeometry(1, 1, 1)
const CYL = new CylinderGeometry(1, 1, 1, 20)
const SPH = new SphereGeometry(1, 24, 16)
const ICO1 = new IcosahedronGeometry(1, 1)
const ICO0 = new IcosahedronGeometry(1, 0)
const PLANE = new PlaneGeometry(1, 1)
const RBOX = new Map()
function rbox(r) {
  if (!RBOX.has(r)) RBOX.set(r, new RoundedBoxGeometry(1, 1, 1, 2, r))
  return RBOX.get(r)
}

export class Builder {
  constructor(parent, ox = 0, oy = 0, oz = 0) {
    this.group = new Group()
    this.group.position.set(ox, oy, oz)
    parent.add(this.group)
    this.o = new Vector3(ox, oy, oz)
    this.castDefault = true
    this.colliders = true // false: visuals only (treadmill scenery)
  }
  mesh(geo, mat, x, y, z, { cast = this.castDefault, receive = true, parent = this.group } = {}) {
    const m = new Mesh(geo, mat)
    m.position.set(x, y, z)
    m.castShadow = cast
    m.receiveShadow = receive
    parent.add(m)
    return m
  }
  // Box by its centre and size; solid adds a collider.
  box(w, h, d, mat, x, y, z, { solid = false, round = 0, rotY = 0, cast, parent } = {}) {
    const m = this.mesh(round ? rbox(round) : BOX, mat, x, y, z, { cast, parent })
    m.scale.set(w, h, d)
    m.rotation.y = rotY
    if (solid) this.solid(w / 2, h / 2, d / 2, x, y, z, rotY)
    return m
  }
  // Box by its min corner on the floor (x0..x1, y0..y1, z0..z1).
  span(x0, y0, z0, x1, y1, z1, mat, opts) {
    return this.box(x1 - x0, y1 - y0, z1 - z0, mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, opts)
  }
  solid(hx, hy, hz, x, y, z, rotY = 0) {
    if (!this.colliders) return
    addFixed(RAPIER.ColliderDesc.cuboid(hx, hy, hz), { x: this.o.x + x, y: this.o.y + y, z: this.o.z + z }, { x: 0, y: Math.sin(rotY / 2), z: 0, w: Math.cos(rotY / 2) })
  }
  cyl(r, h, mat, x, y, z, { solid = false, segments = 0, rTop = null, cast, parent } = {}) {
    const geo = segments || rTop !== null ? new CylinderGeometry(rTop ?? r, r, h, segments || 20) : CYL
    const m = this.mesh(geo, mat, x, y, z, { cast, parent })
    if (geo === CYL) m.scale.set(r, h, r)
    if (solid && this.colliders) addFixed(RAPIER.ColliderDesc.cylinder(h / 2, r), { x: this.o.x + x, y: this.o.y + y, z: this.o.z + z })
    return m
  }
  sphere(r, mat, x, y, z, opts) {
    const m = this.mesh(SPH, mat, x, y, z, opts)
    m.scale.setScalar(r)
    return m
  }
  blob(r, mat, x, y, z, { detail = 1, sx = 1, sy = 1, sz = 1, rot = 0, cast } = {}) {
    const m = this.mesh(detail ? ICO1 : ICO0, mat, x, y, z, { cast })
    m.scale.set(r * sx, r * sy, r * sz)
    m.rotation.set(rot, rot * 1.7, rot * 0.6)
    return m
  }
  // A flat picture (poster, sign) facing `face` ('+z', '-z', '+x', '-x'), slightly off the wall.
  picture(texture, w, h, x, y, z, face = '+z', { emissive = false, cast = false, transparent = true } = {}) {
    const mat = emissive
      ? new MeshStandardMaterial({ map: texture, emissive: '#ffffff', emissiveMap: texture, emissiveIntensity: 0.9, roughness: 0.6, transparent })
      : new MeshStandardMaterial({ map: texture, roughness: 0.8, transparent, alphaTest: transparent ? 0.02 : 0 })
    // decal: always wins against the wall/floor it sits on
    mat.polygonOffset = true
    mat.polygonOffsetFactor = -2
    mat.polygonOffsetUnits = -4
    const m = this.mesh(PLANE, mat, x, y, z, { cast, receive: false })
    m.scale.set(w, h, 1)
    m.rotation.y = { '+z': 0, '-z': Math.PI, '+x': Math.PI / 2, '-x': -Math.PI / 2 }[face]
    return m
  }
  sign(text, w, h, x, y, z, face, signOpts, picOpts) {
    const aspect = w / h
    const ph = 256
    const pw = Math.min(2048, Math.round(ph * aspect))
    return this.picture(signTex(text, { w: pw, h: ph, ...signOpts }), w, h, x, y, z, face, picOpts)
  }
}

// --- Plants -------------------------------------------------------------------------------
export function pottedPlant(b, x, z, { scale = 1, pot = '#c96a3c', leaves = '#3cbf4a', y = 0, round = false } = {}) {
  const s = scale
  b.cyl(0.32 * s, 0.6 * s, M(pot, 0.8), x, y + 0.3 * s, z, { segments: 8, rTop: 0.42 * s })
  b.cyl(0.38 * s, 0.05 * s, M('#4a2e1a', 1), x, y + 0.58 * s, z, { segments: 8 })
  if (round) {
    b.blob(0.55 * s, M(leaves, 0.95), x, y + 1.25 * s, z, { sy: 1.1 })
    b.blob(0.45 * s, M(leaves, 0.95), x, y + 1.85 * s, z, { sy: 1 })
  } else {
    b.cyl(0.05 * s, 0.6 * s, M('#5a8a3a', 0.9), x, y + 0.9 * s, z, { segments: 6 })
    b.blob(0.72 * s, flat(leaves, 0.85), x, y + 1.6 * s, z, { detail: 1, sy: 1.05, rot: 0.4 })
    b.blob(0.58 * s, flat(shade(leaves, 1.12), 0.85), x + 0.3 * s, y + 2.15 * s, z - 0.1 * s, { detail: 1, rot: 1.1 })
    b.blob(0.45 * s, flat(shade(leaves, 0.9), 0.85), x - 0.35 * s, y + 2.0 * s, z + 0.15 * s, { detail: 1, rot: 2.1 })
  }
}

// Round topiary shrub on a white planter (hospital interiors).
export function topiary(b, x, z, { color = '#3e8f5a', planter = '#ffffff', ring = null, scale = 1 } = {}) {
  const s = scale
  b.cyl(0.36 * s, 0.7 * s, M(planter, 0.5), x, 0.35 * s, z, { segments: 20, rTop: 0.44 * s })
  b.cyl(0.47 * s, 0.08 * s, M(planter, 0.4), x, 0.72 * s, z, { segments: 20 }) // rim
  if (ring) b.cyl(0.41 * s, 0.1 * s, M(ring, 0.5), x, 0.42 * s, z, { segments: 20 })
  b.cyl(0.42 * s, 0.04 * s, M('#5a3a22', 1), x, 0.74 * s, z, { segments: 16 }) // soil
  b.cyl(0.06 * s, 0.5 * s, M('#6a4a2a', 0.9), x, 0.95 * s, z, { segments: 6 }) // trunk
  const dark = shade(color, 0.85)
  const light = shade(color, 1.12)
  b.blob(0.62 * s, M(color, 1), x, 1.35 * s, z, { sy: 0.95 })
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    b.blob(0.3 * s, M(i % 2 ? dark : light, 1), x + Math.cos(a) * 0.42 * s, 1.35 * s + Math.sin(i * 2.1) * 0.15 * s, z + Math.sin(a) * 0.42 * s)
  }
  b.blob(0.46 * s, M(light, 1), x, 2.0 * s, z)
  b.blob(0.22 * s, M(color, 1), x + 0.18 * s, 2.3 * s, z - 0.1 * s)
}

// Low-poly tree: flared trunk with two branches and a layered canopy of faceted clusters.
export function tree(b, x, z, rand = Math.random, scale = 1) {
  const s = scale * (0.85 + rand() * 0.35)
  const bark = M('#7a4a2a', 0.9)
  b.cyl(0.28 * s, 2.7 * s, bark, x, 1.35 * s, z, { segments: 7, rTop: 0.18 * s, solid: true })
  b.cyl(0.45 * s, 0.35 * s, bark, x, 0.17 * s, z, { segments: 7, rTop: 0.28 * s }) // root flare
  for (const a of [rand() * 6, rand() * 6 + 2]) {
    const br = b.cyl(0.08 * s, 1.1 * s, bark, x + Math.cos(a) * 0.35 * s, 2.5 * s, z + Math.sin(a) * 0.35 * s, { segments: 5 })
    br.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7)
  }
  const greens = ['#4fcf5b', '#5ad866', '#43be52', '#6be276', '#3fb54c']
  const g = (i) => flat(greens[(i + Math.floor(rand() * 5)) % 5], 0.9)
  b.blob(1.45 * s, g(0), x, 3.2 * s, z, { detail: 0, rot: rand() * 3, sy: 0.8 })
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rand()
    b.blob((0.85 + rand() * 0.2) * s, g(i + 1), x + Math.cos(a) * 0.95 * s, (3.3 + rand() * 0.5) * s, z + Math.sin(a) * 0.95 * s, { detail: 0, rot: rand() * 3, sy: 0.8 })
  }
  b.blob(1.0 * s, g(3), x + (rand() - 0.5) * 0.4 * s, 4.35 * s, z + (rand() - 0.5) * 0.4 * s, { detail: 0, rot: rand() * 3, sy: 0.85 })
}

export function bushWithFlowers(b, x, z, { len = 2, rand = Math.random, colors = ['#59b8ff', '#ffd84a', '#ff7fc4', '#ffffff', '#c58bff'], y = 0 } = {}) {
  const n = Math.max(1, Math.round(len / 0.8))
  for (let i = 0; i < n; i++) {
    const px = x + (i - (n - 1) / 2) * 0.8
    b.blob(0.55, flat('#3fbf52', 0.9), px, y + 0.4, z + (rand() - 0.5) * 0.2, { detail: 0, sy: 0.8, rot: rand() * 3 })
    b.blob(0.32, M(colors[Math.floor(rand() * colors.length)], 0.6), px + (rand() - 0.5) * 0.3, y + 0.85, z, { detail: 1, sy: 0.7 })
  }
}

// White planter box with soil and flower clumps (hospital front).
export function planter(b, x, z, w, d, rand = Math.random) {
  b.box(w, 0.9, d, M('#f7f7fb', 0.6), x, 0.45, z, { solid: true, round: 0.06 })
  b.box(w + 0.16, 0.12, d + 0.16, M('#ffffff', 0.5), x, 0.93, z, { round: 0.05 }) // rim cap
  b.box(w + 0.1, 0.1, d + 0.1, M('#e6e3ee', 0.7), x, 0.06, z) // plinth
  b.box(w - 0.3, 0.1, d - 0.3, M('#7a4a2a', 1), x, 0.97, z)
  bushWithFlowers(b, x, z, { len: w - 0.6, rand, y: 0.8 })
  for (let i = 0; i < Math.round(w * 1.5); i++) {
    const px = x - w / 2 + 0.4 + rand() * (w - 0.8)
    const pz = z + (rand() - 0.5) * (d - 0.6)
    b.cyl(0.02, 0.45, M('#3f9a48', 0.8), px, 1.2, pz, { segments: 4 })
    b.blob(0.11, M(['#ff7fc4', '#ffd84a', '#ffffff', '#c58bff', '#59b8ff'][i % 5], 0.6), px, 1.45, pz, { detail: 0 })
  }
}

// --- Indoor / outdoor fittings ----------------------------------------------------------
const FACE_ROT = { '+z': 0, '-z': Math.PI, '+x': Math.PI / 2, '-x': -Math.PI / 2 }
export function wallClock(b, x, y, z, face = '+z', rim = '#2bd8ff') {
  const g = new Group()
  g.position.set(x, y, z)
  g.rotation.y = FACE_ROT[face]
  b.group.add(g)
  const add = (geo, mat, px, py, pz, rz = 0) => {
    const m = new Mesh(geo, mat)
    m.position.set(px, py, pz)
    m.rotation.set(Math.PI / 2, 0, rz)
    g.add(m)
    return m
  }
  add(new CylinderGeometry(0.5, 0.5, 0.08, 28), M('#ffffff', 0.4), 0, 0, 0.04)
  add(new TorusGeometry(0.5, 0.06, 8, 28), M(rim, 0.4), 0, 0, 0.06).rotation.set(0, 0, 0)
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2
    const t = new Mesh(new BoxGeometry(0.03, k % 3 ? 0.06 : 0.12, 0.02), M('#2a2a3a', 0.5))
    t.position.set(Math.sin(a) * 0.4, Math.cos(a) * 0.4, 0.09)
    t.rotation.z = -a
    g.add(t)
  }
  const hand = (len, rot, w) => {
    const h = new Mesh(new BoxGeometry(w, len, 0.02), M('#2a2a3a', 0.5))
    h.geometry.translate(0, len / 2, 0)
    h.position.set(0, 0, 0.1)
    h.rotation.z = rot
    g.add(h)
  }
  hand(0.26, -1.1, 0.05)
  hand(0.36, 2.2, 0.03)
  return g
}
export function waterCooler(b, x, z) {
  b.box(0.6, 1.1, 0.55, M('#f2f4f8', 0.4), x, 0.55, z, { round: 0.05, solid: true })
  b.box(0.3, 0.12, 0.08, M('#3a6bff', 0.4), x - 0.1, 0.85, z + 0.3)
  b.box(0.12, 0.12, 0.08, M('#e0182d', 0.4), x + 0.15, 0.85, z + 0.3)
  b.box(0.4, 0.04, 0.2, M('#9aa6bb', 0.4), x, 0.62, z + 0.3)
  b.cyl(0.24, 0.6, M('#9fd8ff', 0.05, { transparent: true, opacity: 0.7 }), x, 1.42, z, { segments: 18 })
  b.sphere(0.24, M('#9fd8ff', 0.05, { transparent: true, opacity: 0.7 }), x, 1.72, z).scale.y = 0.35
  b.cyl(0.08, 0.1, M('#3a6bff', 0.4), x, 1.12, z, { segments: 12 })
}
export function trashBin(b, x, z, color = '#c9ced6') {
  b.cyl(0.26, 0.7, M(color, 0.4, { metalness: 0.3 }), x, 0.35, z, { segments: 16, rTop: 0.3 })
  b.cyl(0.32, 0.06, M('#3a3f4a', 0.5), x, 0.72, z, { segments: 16 })
  b.cyl(0.08, 0.06, M('#3a3f4a', 0.5), x + 0.12, 0.33, z + 0.27, { segments: 8 }).rotation.x = Math.PI / 2
}
export function ceilingVent(b, x, y, z) {
  b.box(1.2, 0.04, 1.2, M('#f4f6fa', 0.5), x, y - 0.02, z, { cast: false })
  for (let k = 0; k < 6; k++) b.box(1.0, 0.03, 0.06, M('#c9ced8', 0.5), x, y - 0.05, z - 0.4 + k * 0.16, { cast: false })
}
export function bench(b, x, z, rotY = 0, color = '#c98a4a') {
  const g = new Group()
  g.position.set(x, 0, z)
  g.rotation.y = rotY
  b.group.add(g)
  const wood = M(color, 0.8)
  const metal = M('#2a3a66', 0.5, { metalness: 0.4 })
  for (let k = 0; k < 3; k++) b.box(2.4, 0.08, 0.16, wood, 0, 0.75, -0.2 + k * 0.2, { parent: g, round: 0.02 })
  for (let k = 0; k < 2; k++) b.box(2.4, 0.16, 0.06, wood, 0, 1.0 + k * 0.22, -0.36, { parent: g, round: 0.02 })
  for (const sx of [-1, 1]) {
    b.box(0.08, 0.75, 0.5, metal, sx * 1.05, 0.38, 0, { parent: g })
    b.box(0.08, 0.6, 0.08, metal, sx * 1.05, 1.05, -0.38, { parent: g })
    b.box(0.08, 0.06, 0.5, metal, sx * 1.1, 0.95, -0.05, { parent: g })
  }
  return g
}
export function bollard(b, x, z) {
  b.cyl(0.14, 0.9, M('#ffffff', 0.4), x, 0.45, z, { segments: 14, solid: true })
  b.cyl(0.15, 0.12, M('#ffe7a0', 0.3, { emissive: '#ffd27a', emissiveIntensity: 0.6 }), x, 0.82, z, { segments: 14 })
  b.cyl(0.16, 0.06, M('#f4a6cf', 0.5), x, 0.92, z, { segments: 14 })
}
export function ivStand(b, x, z) {
  const chrome = M('#c9ced6', 0.25, { metalness: 0.7 })
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2
    const leg = b.box(0.45, 0.04, 0.05, chrome, x + Math.cos(a) * 0.2, 0.1, z + Math.sin(a) * 0.2)
    leg.rotation.y = -a
    b.sphere(0.05, M('#2b2f3a', 0.6), x + Math.cos(a) * 0.42, 0.05, z + Math.sin(a) * 0.42)
  }
  b.cyl(0.025, 2.4, chrome, x, 1.3, z, { segments: 8 })
  b.box(0.6, 0.03, 0.03, chrome, x, 2.48, z)
  b.box(0.26, 0.38, 0.08, M('#e8f6ff', 0.1, { transparent: true, opacity: 0.75 }), x - 0.22, 2.2, z, { round: 0.03 })
  b.cyl(0.008, 1.3, M('#e8f6ff', 0.2), x - 0.22, 1.4, z + 0.15, { segments: 4 }).rotation.x = 0.3
}

// --- Street furniture ------------------------------------------------------------------
export function lampPost(b, x, z, faceX = 0) {
  const pole = M('#2a3a66', 0.5, { metalness: 0.4 })
  b.cyl(0.24, 0.5, pole, x, 0.25, z, { segments: 10, rTop: 0.16 }) // base
  b.cyl(0.1, 6, pole, x, 3, z, { solid: true, segments: 10 })
  for (const ry of [0.55, 2.2]) b.cyl(0.14, 0.1, pole, x, ry, z, { segments: 10 }) // collars
  b.box(1.25, 0.1, 0.1, pole, x + faceX * 0.55, 6, z)
  b.box(0.06, 0.6, 0.06, pole, x + faceX * 0.25, 5.75, z).rotation.z = faceX * 0.7 // brace
  b.cyl(0.12, 0.08, pole, x, 6.06, z, { segments: 10 })
  b.box(0.75, 0.12, 0.45, pole, x + faceX * 1.05, 6.0, z, { round: 0.04 })
  b.box(0.62, 0.14, 0.36, M('#f0f4ff', 0.3, { emissive: '#fff5d8', emissiveIntensity: 0.5 }), x + faceX * 1.05, 5.88, z)
}

export function mailbox(b, x, z, color = '#3fa0ff') {
  b.box(0.18, 1.3, 0.18, M('#c98a4a', 0.9), x, 0.65, z, { solid: true })
  b.box(0.5, 0.08, 0.5, M('#a8703a', 0.9), x, 1.22, z)
  b.box(0.9, 0.55, 0.6, M(color, 0.4), x, 1.52, z, { round: 0.08 })
  b.cyl(0.3, 0.9, M(color, 0.4), x, 1.78, z, { segments: 14 }).rotation.z = Math.PI / 2 // rounded top
  b.box(0.04, 0.5, 0.5, M('#2a2a3a', 0.6), x - 0.46, 1.62, z) // door
  b.box(0.04, 0.4, 0.06, M('#e0182d', 0.5), x + 0.2, 1.95, z + 0.33) // flag
  b.box(0.2, 0.14, 0.04, M('#e0182d', 0.5), x + 0.3, 2.1, z + 0.33)
}

// --- Queue stanchions -------------------------------------------------------------------------
// Posts at `points` (local) joined by sagging ropes; `posts` style { post, top, rope }.
export function stanchionLine(b, points, { post = '#c9ced6', top = '#c9ced6', rope = '#2ed6d0', base = '#3a3f4a', loop = false } = {}) {
  const pm = M(post, 0.35, { metalness: 0.5 })
  const tm = M(top, 0.35, { metalness: 0.3 })
  const bm = M(base, 0.6)
  const rm = M(rope, 0.5)
  for (const p of points) {
    b.cyl(0.05, 1.0, pm, p.x, 0.5, p.z, { segments: 10 })
    b.cyl(0.24, 0.07, bm, p.x, 0.035, p.z, { segments: 18, rTop: 0.2 }) // domed base
    b.cyl(0.12, 0.05, pm, p.x, 0.09, p.z, { segments: 12, rTop: 0.07 })
    b.cyl(0.075, 0.08, tm, p.x, 0.92, p.z, { segments: 12 }) // rope housing
    b.sphere(0.08, tm, p.x, 1.02, p.z)
    b.mesh(new TorusGeometry(0.065, 0.012, 4, 14), pm, p.x, 0.86, p.z).rotation.x = Math.PI / 2
  }
  const n = loop ? points.length : points.length - 1
  for (let i = 0; i < n; i++) {
    const a = points[i]
    const c = points[(i + 1) % points.length]
    const mid = new Vector3((a.x + c.x) / 2, 0.82, (a.z + c.z) / 2)
    const curve = new CatmullRomCurve3([new Vector3(a.x, 0.96, a.z), mid, new Vector3(c.x, 0.96, c.z)])
    b.mesh(new TubeGeometry(curve, 8, 0.03, 5), rm, 0, 0, 0, { cast: false })
  }
}

// --- Seating ------------------------------------------------------------------------------
export function chair(b, x, z, color, faceRot = 0) {
  const g = new Group()
  g.position.set(x, 0, z)
  g.rotation.y = faceRot
  b.group.add(g)
  const m = M(color, 0.6)
  const seam = M(shade(color, 0.82), 0.6)
  const metal = M('#c9ced6', 0.25, { metalness: 0.7 })
  b.box(0.9, 0.18, 0.85, m, 0, 0.55, 0, { parent: g, round: 0.07 })
  b.box(0.92, 0.04, 0.87, seam, 0, 0.46, 0, { parent: g })
  b.box(0.9, 0.85, 0.16, m, 0, 1.02, -0.38, { parent: g, round: 0.07 })
  for (const sx of [-1, 1]) {
    for (const lz of [-0.32, 0.32]) b.cyl(0.03, 0.46, metal, sx * 0.38, 0.23, lz, { segments: 8, parent: g })
    b.box(0.06, 0.06, 0.7, metal, sx * 0.5, 0.78, 0.02, { parent: g })
    b.box(0.05, 0.3, 0.05, metal, sx * 0.5, 0.63, 0.3, { parent: g })
    b.box(0.05, 0.05, 0.7, metal, sx * 0.38, 0.03, 0, { parent: g })
  }
  return g
}

// --- Balloons -------------------------------------------------------------------------------
const BALLOON = new SphereGeometry(1, 20, 16)
BALLOON.scale(1, 1.18, 1)
export function balloonCluster(b, x, z, colors, { height = 3.4, y = 0 } = {}) {
  const strMat = M('#ffffff', 0.5)
  colors.forEach((c, i) => {
    const a = (i / colors.length) * Math.PI * 2
    const bx = x + Math.cos(a) * 0.35
    const bz = z + Math.sin(a) * 0.35
    const by = y + height + (i % 2) * 0.35
    const m = b.mesh(BALLOON, new MeshStandardMaterial({ color: c, roughness: 0.25, metalness: 0.05 }), bx, by, bz)
    m.scale.setScalar(0.42)
    b.box(0.015, by - y - 0.5, 0.015, strMat, (bx + x) / 2, y + (by - y - 0.5) / 2, (bz + z) / 2, { cast: false })
  })
  b.box(0.35, 0.3, 0.35, M('#ff7fc4', 0.6), x, y + 0.15, z)
}

// Balloon arch: a semicircle of chunky low-poly balloons in a 5-colour cycle.
export function balloonArch(b, x, z, radius = 3, colors = ['#ff6fc2', '#5ec6ff', '#ffd84a', '#ffffff', '#b98bff'], alongX = true) {
  const per = 34
  for (let ring = 0; ring < 2; ring++) {
    for (let i = 0; i <= per; i++) {
      const a = (i / per) * Math.PI
      const r = radius + ring * 0.05
      const px = Math.cos(a) * r
      const py = Math.sin(a) * r * 1.05 + 0.3
      const off = ring ? 0.32 : -0.32
      const c = colors[(i + ring * 2) % colors.length]
      const m = b.blob(0.42, flat(c, 0.35), alongX ? x + px : x + off, py, alongX ? z + off : z + px, { detail: 1, rot: i * 0.7 })
      m.castShadow = true
    }
  }
}

export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16)
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * k)))
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => c(v).toString(16).padStart(2, '0')).join('')
}

// Ceiling light panel (glowing rectangle).
export function ceilingLight(b, x, y, z, w = 3, d = 0.8) {
  const m = b.box(w, 0.06, d, M('#ffffff', 0.3, { emissive: '#ffffff', emissiveIntensity: 1.4 }), x, y - 0.03, z, { cast: false })
  return m
}

export { tex, mulberry32, DoubleSide, TorusGeometry }
