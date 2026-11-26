// Outdoor world: a big lawn with one long suburban street running along X
// (home near x = 0, the maternity hospital near x = HOSPITAL_X), pastel houses
// with gable roofs, low-poly trees, lamp posts, flower bushes and clouds. The
// ambulance ride happens on a separate "treadmill": a few street chunks far
// away that scroll past a parked ambulance and wrap around (createTreadmill).
// Static scenery is baked to one mesh per material per section (draw calls).
import { ExtrudeGeometry, Group, IcosahedronGeometry, Mesh, MeshLambertMaterial, MeshStandardMaterial, PlaneGeometry, Shape, Vector2 } from 'three'
import { bake } from './bake.js'
import { RAPIER, addFixed } from './physics.js'
import { Builder, M, bushWithFlowers, flat, lampPost, mailbox, tree } from './props.js'
import { cnv, speckle, tex } from './paint.js'
import { mulberry32 } from './textures.js'

export const STREET = {
  walkN: [12, 15], // north sidewalk z range (home side)
  road: [15, 25],
  walkS: [25, 28],
  x0: -640,
  x1: 200,
  laneZ: 17.4, // parked/driving lane (westbound, toward -X)
}
export const HOSPITAL_X = -430
export const TREADMILL = { x: 0, z: -3000, chunk: 60, count: 6 }

let grassTex = null
let roadTex = null
let walkTex = null
function textures() {
  if (grassTex) return
  const g = speckle('#43c043', '#6fe063', 256, 8, 24, 0.5)
  grassTex = { map: tex(g, { repeat: [1, 1] }), bump: tex(g, { srgb: false }) }
  roadTex = tex(speckle('#5b5f6e', '#7e8394', 256, 12, 48, 0.7))
  const w = cnv(256)
  const ctx = w.getContext('2d')
  ctx.drawImage(speckle('#d3d4dc', '#eceef3', 256, 14, 32, 0.3), 0, 0)
  ctx.fillStyle = 'rgba(90,90,110,0.35)'
  ctx.fillRect(0, 0, 256, 3)
  ctx.fillRect(0, 0, 3, 256)
  walkTex = tex(w)
}

// Ground layers sit at distinct heights (lawn -0.04 < road 0.02 < sidewalk 0.06 < paths 0.08)
// and `depthBias` > 0 pushes a layer back in the depth buffer so the layer above always wins.
function texturedPlane(map, w, d, x, y, z, repeatW, repeatD, rough = 0.95, bump = null, depthBias = 0) {
  const t = map.clone()
  t.needsUpdate = true
  t.repeat.set(repeatW, repeatD)
  const mat = new MeshStandardMaterial({ map: t, roughness: rough })
  if (bump) {
    const b = bump.clone()
    b.needsUpdate = true
    b.repeat.set(repeatW, repeatD)
    mat.bumpMap = b
    mat.bumpScale = 0.6
  }
  if (depthBias) {
    mat.polygonOffset = true
    mat.polygonOffsetFactor = depthBias
    mat.polygonOffsetUnits = depthBias * 2
  }
  const m = new Mesh(new PlaneGeometry(w, d), mat)
  m.rotation.x = -Math.PI / 2
  m.position.set(x, y, z)
  m.receiveShadow = true
  return m
}

// One stretch of street (road, sidewalks, curbs, lines) from xa to xb, at z offset oz.
function streetStrip(root, xa, xb, oz = 0) {
  textures()
  const len = xb - xa
  const cx = (xa + xb) / 2
  const [r0, r1] = STREET.road
  const [n0, n1] = STREET.walkN
  const [s0, s1] = STREET.walkS
  root.add(texturedPlane(roadTex, len, r1 - r0, cx, 0.02, oz + (r0 + r1) / 2, len / 8, (r1 - r0) / 8, 0.9, null, 1))
  root.add(texturedPlane(walkTex, len, n1 - n0, cx, 0.06, oz + (n0 + n1) / 2, len / 3, 1))
  root.add(texturedPlane(walkTex, len, s1 - s0, cx, 0.06, oz + (s0 + s1) / 2, len / 3, 1))
  const b = new Builder(root, 0, 0, oz)
  b.castDefault = false
  b.colliders = false
  // curb faces: thin vertical strips along the road edges (no slab hidden under the sidewalk)
  const curb = M('#d8d9e2', 0.8)
  b.span(xa, -0.04, r0 - 0.02, xb, 0.06, r0, curb)
  b.span(xa, -0.04, r1, xb, 0.06, r1 + 0.02, curb)
  const yellow = M('#ffd21f', 0.6)
  const mid = (r0 + r1) / 2
  for (let x = Math.ceil(xa / 7) * 7; x < xb; x += 7) b.box(3.2, 0.02, 0.22, yellow, x, 0.035, mid)
}

// Pastel suburban house facing +Z (front door) or -Z.
const PASTELS = ['#f6c1d0', '#d9c6f2', '#c4e3f6', '#f9e3a6', '#c9f0d6', '#f7d1b5', '#e7c9f0']
const ROOFS = ['#e9677e', '#7f6ad8', '#4f9be0', '#e58b3a', '#e86a9a', '#c0485a']
export function house(b, x, z, facing = 1, rand = Math.random, opts = {}) {
  const w = opts.w ?? 11 + Math.floor(rand() * 3)
  const d = opts.d ?? 10
  const h = opts.h ?? 5.5
  const wall = M(opts.wall ?? PASTELS[Math.floor(rand() * PASTELS.length)], 0.85)
  const roof = flat(opts.roof ?? ROOFS[Math.floor(rand() * ROOFS.length)], 0.7)
  b.box(w, h, d, wall, x, h / 2, z, { solid: true })
  // gable roof (ridge along X) with eaves
  const s = new Shape()
  const ov = 0.7
  s.moveTo(-(d / 2 + ov), 0)
  s.lineTo(d / 2 + ov, 0)
  s.lineTo(0, 3)
  s.closePath()
  const geo = new ExtrudeGeometry(s, { depth: w + ov * 2, bevelEnabled: false })
  geo.translate(0, 0, -(w + ov * 2) / 2)
  geo.rotateY(Math.PI / 2)
  const r = b.mesh(geo, roof, x, h - 0.05, z)
  r.castShadow = true
  const fz = z + facing * (d / 2 + 0.02)
  const face = facing > 0 ? '+z' : '-z'
  const trim = M('#ffffff', 0.55)
  const roofHex = '#' + roof.color.getHexString()
  const shutter = M(['#5a7fd6', '#e46a92', '#4fae7a', '#a66be8', '#e58b3a'][Math.floor(rand() * 5)], 0.6)
  // foundation, corner boards, fascia under the eaves
  b.box(w + 0.16, 0.42, d + 0.16, M('#b9b3c4', 0.9), x, 0.21, z)
  for (const cx2 of [-1, 1]) for (const cz2 of [-1, 1]) b.box(0.28, h - 0.4, 0.28, trim, x + cx2 * (w / 2 - 0.06), h / 2 + 0.2, z + cz2 * (d / 2 - 0.06))
  for (const fzz of [-1, 1]) b.box(w + 0.3, 0.26, 0.16, trim, x, h - 0.1, z + fzz * (d / 2 + 0.05))
  // chimney with a cap
  const chx = x + (rand() < 0.5 ? -1 : 1) * (w / 2 - 2)
  b.box(0.9, 2.6, 0.9, M('#b5574a', 0.85), chx, h + 1.6, z - 1.2, { solid: false })
  b.box(1.1, 0.2, 1.1, M('#8a3f34', 0.8), chx, h + 2.95, z - 1.2)
  // front door: frame, raised panels, little window, knob, porch steps + canopy on posts, lamp
  const doorCol = opts.door ?? ['#ffffff', '#e94f6a', '#3f7fd6', '#f2c230'][Math.floor(rand() * 4)]
  b.box(1.95, 2.95, 0.14, trim, x, 1.48 + 0.4, fz + facing * 0.02)
  b.box(1.6, 2.7, 0.16, M(doorCol, 0.5), x, 1.35 + 0.4, fz + facing * 0.05)
  for (const py of [1.0, 1.9]) for (const px of [-0.35, 0.35]) b.box(0.55, 0.65, 0.2, M(doorCol, 0.45), x + px, py + 0.4, fz + facing * 0.06)
  b.box(0.8, 0.4, 0.2, M('#bfe2ff', 0.1), x, 2.6 + 0.4, fz + facing * 0.065)
  b.sphere(0.07, M('#d9b24a', 0.3, { metalness: 0.6 }), x + 0.6, 1.6, fz + facing * 0.17)
  for (let k = 0; k < 2; k++) b.box(2.4 - k * 0.3, 0.2, 0.55 - k * 0.2, M('#d6d3dc', 0.9), x, 0.1 + k * 0.2, fz + facing * (0.3 - k * 0.1))
  b.box(2.6, 0.12, 1.5, roof, x, 3.65 + 0.4, fz + facing * 0.75)
  for (const px of [-1.15, 1.15]) b.cyl(0.07, 3.6, trim, x + px, 2.2, fz + facing * 1.35, { segments: 10 })
  b.box(0.18, 0.3, 0.18, M('#fff3c4', 0.3, { emissive: '#ffe08a', emissiveIntensity: 0.4 }), x + 1.2, 2.9, fz + facing * 0.12)
  // windows: frame, cross mullions, sill, shutters, flower box
  const glass = M('#5aa7e6', 0.15, { metalness: 0.1 })
  for (const sx of [-1, 1]) {
    const wx = x + sx * (w / 2 - 2.6)
    b.box(2.5, 2.0, 0.12, trim, wx, 3, fz + facing * 0.02)
    b.box(2.2, 1.7, 0.14, glass, wx, 3, fz + facing * 0.03)
    b.box(0.1, 1.7, 0.18, trim, wx, 3, fz + facing * 0.04)
    b.box(2.2, 0.1, 0.18, trim, wx, 3, fz + facing * 0.04)
    b.box(2.7, 0.14, 0.34, trim, wx, 1.95, fz + facing * 0.1)
    for (const ss of [-1, 1]) {
      b.box(0.55, 2.0, 0.08, shutter, wx + ss * 1.6, 3, fz + facing * 0.06)
      for (let k = 0; k < 5; k++) b.box(0.45, 0.05, 0.1, M(roofHex, 0.6), wx + ss * 1.6, 2.2 + k * 0.38, fz + facing * 0.07)
    }
    b.box(2.2, 0.35, 0.4, M('#8a5a3b', 0.8), wx, 1.72, fz + facing * 0.32)
    for (let k = 0; k < 4; k++) b.blob(0.2, M(['#ff7fc4', '#ffd84a', '#ffffff', '#c58bff'][(k + Math.floor(rand() * 4)) % 4], 0.6), wx - 0.75 + k * 0.5, 2.0, fz + facing * 0.32, { sy: 0.8 })
  }
  // path to the sidewalk + bushes
  const walkZ = facing > 0 ? STREET.walkN[0] : STREET.walkS[1]
  const pz0 = fz
  const len = Math.abs(walkZ - pz0)
  b.box(1.8, 0.12, len - 0.02, M('#e8e8ee', 0.9), x, 0.02, (pz0 + walkZ) / 2, { cast: false })
  bushWithFlowers(b, x - 3.6, fz + facing * 1.2, { len: 3, rand })
  bushWithFlowers(b, x + 3.6, fz + facing * 1.2, { len: 3, rand })
  if (opts.mailbox !== false) mailbox(b, x + 1.8, walkZ - facing * 0.9, ['#3fa0ff', '#ff6f91', '#ffd84a'][Math.floor(rand() * 3)])
  void face
}

function clouds() {
  const rand = mulberry32(2024)
  const geo = new IcosahedronGeometry(1, 2)
  const mat = new MeshLambertMaterial({ color: '#ffffff', emissive: '#e8f2ff', emissiveIntensity: 0.65, fog: false, flatShading: false })
  const group = new Group()
  for (let i = 0; i < 26; i++) {
    const ang = rand() * Math.PI * 2
    const dist = 240 + rand() * 160
    const cloud = new Group()
    const puffs = 4 + Math.floor(rand() * 4)
    const len = 18 + rand() * 24
    for (let p = 0; p < puffs; p++) {
      const t = p / (puffs - 1) - 0.5
      const r = (1 - Math.abs(t) * 1.1) * (7 + rand() * 5)
      const puff = new Mesh(geo, mat)
      puff.scale.set(r, r * 0.6, r)
      puff.position.set(t * len, r * 0.15 + rand() * 2, (rand() - 0.5) * 8)
      cloud.add(puff)
    }
    cloud.position.set(Math.cos(ang) * dist, 60 + rand() * 60, Math.sin(ang) * dist)
    cloud.lookAt(0, cloud.position.y, 0)
    group.add(cloud)
  }
  return group
}

// The main outdoor area. Returns { clouds } (clouds follow the camera).
export function buildWorld(scene, { homeExclude = [-9, 9], hospitalExclude = [HOSPITAL_X - 60, HOSPITAL_X + 60] } = {}) {
  textures()
  const lawnW = STREET.x1 - STREET.x0 + 400
  const lawnX = (STREET.x0 + STREET.x1) / 2
  scene.add(texturedPlane(grassTex.map, lawnW, 500, lawnX, -0.04, 0, lawnW / 10, 50, 1, grassTex.bump, 2))
  addFixed(RAPIER.ColliderDesc.cuboid(lawnW / 2, 1, 250), { x: lawnX, y: -1, z: 0 })
  // Street in sections so each bakes separately (culling).
  const SECTION = 120
  for (let xa = STREET.x0; xa < STREET.x1; xa += SECTION) {
    const raw = new Group()
    streetStrip(raw, xa, Math.min(STREET.x1, xa + SECTION))
    const b = new Builder(raw)
    const rand = mulberry32(Math.floor(xa * 13 + 7))
    // houses on both sides every ~30 m, skipping home and hospital plots
    for (let x = xa + 15; x < xa + SECTION; x += 30) {
      const xx = x + (rand() - 0.5) * 3
      const blocked = (lo, hi, a) => a > lo - 9 && a < hi + 9
      if (!blocked(homeExclude[0], homeExclude[1], xx) && !blocked(hospitalExclude[0], hospitalExclude[1], xx)) house(b, xx, 2, 1, rand)
      if (!blocked(hospitalExclude[0] - 20, hospitalExclude[1] + 20, xx)) house(b, xx, 38, -1, rand)
    }
    for (let x = xa + 5; x < xa + SECTION; x += 15) {
      const tx = x + rand() * 6
      const nearHospital = Math.abs(tx - HOSPITAL_X) < 75
      if (!nearHospital || rand() < 0.15) tree(b, tx, 9.5 + rand() * 1.5, rand)
      if (!nearHospital) tree(b, x + rand() * 6, 30.5 + rand() * 1.5, rand)
    }
    for (let x = xa + 10; x < xa + SECTION; x += 40) {
      lampPost(b, x, STREET.walkN[0] + 0.6, 1)
      lampPost(b, x + 20, STREET.walkS[1] - 0.6, -1)
    }
    const baked = bake(raw)
    baked.traverse((o) => {
      if (o.isMesh) o.receiveShadow = true
    })
    scene.add(baked)
  }
  // a few far-off trees on the lawns behind
  const far = new Group()
  const fb = new Builder(far)
  const rand = mulberry32(99)
  for (let i = 0; i < 70; i++) {
    const x = STREET.x0 + rand() * (STREET.x1 - STREET.x0)
    const z = rand() < 0.5 ? -25 - rand() * 120 : 55 + rand() * 120
    if (Math.abs(x - HOSPITAL_X) < 70 && z < 0 && z > -70) continue
    tree(fb, x, z, rand, 1.2)
  }
  scene.add(bake(far, true))
  const c = clouds()
  scene.add(c)
  return { clouds: c }
}

// A wrap-around street for the ambulance ride: chunks scroll along +X past a
// fixed point at (TREADMILL.x, 0, TREADMILL.z + laneZ).
export function createTreadmill(scene) {
  textures()
  const { chunk, count } = TREADMILL
  const chunks = []
  for (let i = 0; i < count; i++) {
    const raw = new Group()
    streetStrip(raw, -chunk / 2, chunk / 2)
    raw.add(texturedPlane(grassTex.map, chunk, 160, 0, -0.04, 20, chunk / 10, 16, 1, grassTex.bump, 2))
    const b = new Builder(raw)
    b.colliders = false
    const rand = mulberry32(500 + i * 31)
    house(b, -14 + rand() * 4, 2, 1, rand)
    house(b, 14 + rand() * 4, 2, 1, rand)
    house(b, -12 + rand() * 4, 38, -1, rand)
    house(b, 16 + rand() * 4, 38, -1, rand)
    for (let k = 0; k < 4; k++) {
      tree(b, -chunk / 2 + k * 15 + rand() * 5, 9.8, rand)
      tree(b, -chunk / 2 + k * 15 + rand() * 5, 30.5, rand)
    }
    lampPost(b, -20, STREET.walkN[0] + 0.6, 1)
    lampPost(b, 10, STREET.walkS[1] - 0.6, -1)
    const g = bake(raw)
    g.traverse((o) => {
      if (o.isMesh) o.receiveShadow = true
    })
    g.position.set(TREADMILL.x + (i - count / 2) * chunk, 0, TREADMILL.z)
    scene.add(g)
    chunks.push(g)
  }
  return {
    origin: { x: TREADMILL.x, z: TREADMILL.z + STREET.laneZ },
    scroll(dist) {
      for (const g of chunks) {
        g.position.x += dist
        if (g.position.x > TREADMILL.x + (count / 2) * chunk) g.position.x -= count * chunk
      }
    },
    setVisible(v) {
      for (const g of chunks) g.visible = v
    },
  }
}

export { Vector2 }
