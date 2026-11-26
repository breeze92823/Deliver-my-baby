// Characters built in code on the shared rig layout (same bone names and bind
// positions as player.glb, so avatar/animator.js drives them).
//
// NPC moms and staff are detailed (rounded head with ears and a face, collar,
// cuffs, hands with thumbs, belt, shoes with soles and laces, layered hair,
// accessories, pregnant belly) but cheap to draw: every part is merged into ONE
// SkinnedMesh per character (each vertex weighted to its bone), coloured by
// vertex colours and sharing ONE material whose map is a small face atlas. So
// a character is one draw call (+ one in the shadow pass) however detailed.
//
// Also: babies (type accessory, swaddle folds, hood, hands)
// and the flying pet "Pip".
import {
  Bone,
  BufferAttribute,
  CanvasTexture,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { PLAYER_DIMS, RIG_HEIGHT } from './config.js'
import { face as paintFace, fabric, tex } from './paint.js'
import { label } from './propkit.js'
import { mulberry32 } from './textures.js'

const S = PLAYER_DIMS.height / RIG_HEIGHT // rig units -> metres
const deg = (d) => (d * Math.PI) / 180

// --- Poses (character space: +X swings a limb backward) ----------------------------
export const POSES = {
  sit: {
    LegL1: { x: deg(-88) }, LegR1: { x: deg(-88) }, LegL2: { x: deg(88) }, LegR2: { x: deg(88) },
    ArmL1: { x: deg(-20), z: deg(6) }, ArmR1: { x: deg(-20), z: deg(-6) }, ArmL2: { x: deg(-30) }, ArmR2: { x: deg(-30) },
  },
  lie: {
    ArmL1: { x: deg(-6), z: deg(16) }, ArmR1: { x: deg(-6), z: deg(-16) }, LegL1: { z: deg(4) }, LegR1: { z: deg(-4) },
  },
  phone: {
    ArmR1: { x: deg(-150), z: deg(-20) }, ArmR2: { x: deg(-60) }, ArmL1: { x: deg(-6), z: deg(16) }, LegL1: { z: deg(4) }, LegR1: { z: deg(-4) },
  },
  shock: {
    ArmL1: { x: deg(-160), z: deg(30) }, ArmR1: { x: deg(-160), z: deg(-30) }, ArmL2: { x: deg(-20) }, ArmR2: { x: deg(-20) }, Spine1: { x: deg(-8) },
  },
  cheer: {
    ArmL1: { x: deg(-170), z: deg(20) }, ArmR1: { x: deg(-170), z: deg(-20) }, Spine1: { x: deg(-6) },
  },
  typing: {
    ArmL1: { x: deg(-50), z: deg(-8) }, ArmR1: { x: deg(-50), z: deg(8) }, ArmL2: { x: deg(-40) }, ArmR2: { x: deg(-40) },
  },
  belly: {
    ArmL1: { x: deg(-35), z: deg(-18) }, ArmR1: { x: deg(-35), z: deg(18) }, ArmL2: { x: deg(-55) }, ArmR2: { x: deg(-55) },
  },
}
// Arms only, layered over the walk/idle (carrying a baby, hands on the belly).
export const OVERLAYS = {
  carry: { ArmL1: { x: deg(-62), z: deg(-28) }, ArmR1: { x: deg(-62), z: deg(28) }, ArmL2: { x: deg(-62) }, ArmR2: { x: deg(-62) } },
  holdBelly: POSES.belly,
}

// --- Shared material + face atlas ------------------------------------------------------
// 4x2 atlas of faces on white; body vertices sample a white texel, so the
// vertex colour shows unchanged. Face vertices are skin-coloured, so the
// white background becomes skin and only the features darken.
const ATLAS_COLS = 4
const ATLAS_ROWS = 2
const WHITE_UV = new Vector2(0.004, 0.996)
let sharedMat = null
function characterMaterial() {
  if (sharedMat) return sharedMat
  const cell = 128
  const c = document.createElement('canvas')
  c.width = cell * ATLAS_COLS
  c.height = cell * ATLAS_ROWS
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, c.width, c.height)
  for (let i = 0; i < ATLAS_COLS * ATLAS_ROWS; i++) {
    const f = paintFace(i, cell)
    ctx.drawImage(f, (i % ATLAS_COLS) * cell, Math.floor(i / ATLAS_COLS) * cell)
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  sharedMat = new MeshStandardMaterial({ map: t, vertexColors: true, roughness: 0.72, metalness: 0 })
  return sharedMat
}
function atlasUV(style, u, v) {
  const cx = style % ATLAS_COLS
  const cy = Math.floor(style / ATLAS_COLS)
  // CanvasTexture is flipped: canvas row 0 is the top (v near 1)
  return [(cx + u) / ATLAS_COLS, 1 - (cy + (1 - v)) / ATLAS_ROWS]
}

// --- Base geometry (shared, cloned per part) ------------------------------------------
const rbCache = new Map()
const rbox = (w, h, d, r = 0.14, seg = 1) => {
  const k = `${w},${h},${d},${r},${seg}`
  if (!rbCache.has(k)) rbCache.set(k, new RoundedBoxGeometry(w, h, d, seg, r))
  return rbCache.get(k)
}
const headProfile = [
  [0, 0], [0.55, 0], [0.74, 0.05], [0.84, 0.16], [0.88, 0.32], [0.89, 0.8], [0.88, 1.28], [0.84, 1.44], [0.74, 1.55], [0.55, 1.6], [0, 1.6],
].map(([x, y]) => new Vector2(x, y))
const BASE = {
  head: new LatheGeometry(headProfile, 20),
  face: new CylinderGeometry(0.915, 0.915, 1.12, 12, 1, true, -0.62, 1.24),
  sphere: new SphereGeometry(1, 16, 12),
  sphereLo: new SphereGeometry(1, 10, 7),
  ico: new IcosahedronGeometry(1, 1),
  cone: new ConeGeometry(0.35, 1.1, 6),
  cyl: new CylinderGeometry(1, 1, 1, 14),
  torus: new TorusGeometry(1, 0.22, 6, 16),
  capsule: new CapsuleGeometry(0.5, 1, 4, 10),
}

const _m = new Matrix4()
const _q = new Quaternion()
const _e = new Euler()
const _p = new Vector3()
const _s = new Vector3()
function xf(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz))
}

// Collects coloured parts per bone and merges them into one skinned mesh.
class SkinKit {
  constructor() {
    this.parts = []
  }
  add(bone, geo, color, matrix = new Matrix4(), faceStyle = -1) {
    this.parts.push({ bone, geo, color: new Color(color), matrix, faceStyle })
  }
  build(root, bones) {
    root.updateMatrixWorld(true)
    const index = new Map(bones.map((b, i) => [b, i]))
    const geos = []
    for (const p of this.parts) {
      const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone()
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name)
      g.applyMatrix4(_m.multiplyMatrices(p.bone.matrixWorld, p.matrix))
      const n = g.attributes.position.count
      const col = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) col.set([p.color.r, p.color.g, p.color.b], i * 3)
      g.setAttribute('color', new BufferAttribute(col, 3))
      const uv = g.attributes.uv
      for (let i = 0; i < n; i++) {
        if (p.faceStyle < 0) uv.setXY(i, WHITE_UV.x, WHITE_UV.y)
        else {
          const [u, v] = atlasUV(p.faceStyle, uv.getX(i), uv.getY(i))
          uv.setXY(i, u, v)
        }
      }
      const bi = index.get(p.bone)
      const si = new Uint16Array(n * 4)
      const sw = new Float32Array(n * 4)
      for (let i = 0; i < n; i++) {
        si[i * 4] = bi
        sw[i * 4] = 1
      }
      g.setAttribute('skinIndex', new BufferAttribute(si, 4))
      g.setAttribute('skinWeight', new Float32BufferAttribute(sw, 4))
      g.morphAttributes = {}
      geos.push(g)
    }
    const merged = mergeGeometries(geos)
    for (const g of geos) g.dispose()
    const mesh = new SkinnedMesh(merged, characterMaterial())
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false // posed limbs leave the bind-pose bounds
    return mesh
  }
}

function bone(name, parent, x, y, z) {
  const b = new Bone()
  b.name = name
  b.position.set(x, y, z)
  parent.add(b)
  return b
}

const shade = (hex, k) => {
  const c = new Color(hex)
  c.r = Math.min(1, c.r * k)
  c.g = Math.min(1, c.g * k)
  c.b = Math.min(1, c.b * k)
  return c
}

const SKINS = ['#f3c99c', '#e0ac7e', '#c68a5a', '#8d5a3b', '#5e3a26', '#ffd7b5', '#f5d76e']
const HAIRS = ['#c2271d', '#1b1b1b', '#5a3518', '#f29ad8', '#f3d36b', '#8a4b20', '#2f2f3a', '#e2483a']
const SHIRTS = ['#e8669b', '#f4d23e', '#b58cf0', '#5fcf8c', '#2f6fd0', '#ef4b4b', '#1d1d1d', '#ff9ccf', '#58c7ef', '#8a5a3b']
const PANTS = ['#2a55b8', '#1d1d1d', '#6b2a3e', '#3e2a1a', '#23305e', '#3a3a3a']
const SHOES = ['#2a2a2a', '#ffffff', '#ff6fa8', '#3a6fd8', '#7a4a2a']
const BELLIES = ['#f39ac4', '#f6e04a', '#c49bf5', '#7fe39e', '#7b4a2b', '#1b1b1b', '#e9eef0', '#5ec8f0', '#ff6b6b', '#c9d8cf']
export const HAIR_STYLES = ['messy', 'bun', 'spiky', 'long', 'afro', 'pigtails', 'short', 'ponytail']
const ACCESSORIES = [null, null, null, 'glasses', 'bow', 'headband', 'earrings', 'glasses']
const SHIRT_DESIGNS = ['plain', 'stripe', 'pocket', 'heart', 'buttons', 'plain']

function addHair(kit, neck, style, color, rand) {
  const c = new Color(color)
  const dark = shade(color, 0.82)
  const top = 1.6
  const cap = (sx = 1.07, sy = 0.62, sz = 1.1, y = top - 0.22) => kit.add(neck, BASE.sphere, c, xf(0, y, -0.04, 0, 0, 0, sx, sy, sz))
  const lump = (x, y, z, r, col = c) => kit.add(neck, BASE.ico, col, xf(x, y, z, rand() * 3, rand() * 3, rand() * 3, r, r * 0.85, r))
  switch (style) {
    case 'bun':
      cap()
      lump(0, top + 0.72, -0.25, 0.55)
      for (let i = 0; i < 7; i++) lump(Math.cos(i * 0.9) * 0.36, top + 0.8 + Math.sin(i * 1.7) * 0.12, -0.25 + Math.sin(i * 0.9) * 0.36, 0.28, i % 2 ? dark : c)
      kit.add(neck, BASE.torus, dark, xf(0, top + 0.4, -0.2, Math.PI / 2, 0, 0, 0.38, 0.38, 0.5))
      break
    case 'spiky':
      cap()
      for (let i = 0; i < 12; i++) kit.add(neck, BASE.cone, i % 3 ? c : dark, xf((rand() - 0.5) * 1.3, top + 0.35 + rand() * 0.2, (rand() - 0.65) * 1.2, (rand() - 0.7) * 1.3, rand() * 3, (rand() - 0.5) * 1.3))
      break
    case 'long':
      cap()
      kit.add(neck, rbox(1.9, 2.3, 0.55, 0.22), c, xf(0, top - 1.05, -0.66))
      for (let i = 0; i < 5; i++) kit.add(neck, rbox(0.34, 2.2, 0.12, 0.06), dark, xf(-0.76 + i * 0.38, top - 1.1, -0.95))
      kit.add(neck, rbox(0.4, 1.6, 0.6, 0.15), c, xf(-0.86, top - 0.8, -0.1))
      kit.add(neck, rbox(0.4, 1.6, 0.6, 0.15), c, xf(0.86, top - 0.8, -0.1))
      break
    case 'afro':
      kit.add(neck, BASE.ico, c, xf(0, top + 0.25, -0.12, 0, 0, 0, 1.36, 1.12, 1.3))
      for (let i = 0; i < 14; i++) {
        const a = rand() * Math.PI * 2
        const b2 = rand() * 1.2
        lump(Math.cos(a) * 1.15 * Math.cos(b2), top + 0.2 + Math.sin(b2) * 0.9, Math.sin(a) * 1.1 * Math.cos(b2) - 0.12, 0.38, i % 2 ? dark : c)
      }
      break
    case 'pigtails':
      cap()
      for (const sx of [-1, 1]) {
        kit.add(neck, BASE.ico, c, xf(sx * 1.15, top - 0.3, -0.25, 0, 0, sx * 0.3, 0.42, 0.75, 0.42))
        kit.add(neck, BASE.torus, new Color('#ff6fb5'), xf(sx * 1.0, top + 0.05, -0.2, 0, 0, sx * 1.2, 0.2))
      }
      break
    case 'ponytail':
      cap()
      kit.add(neck, BASE.capsule, c, xf(0, top - 0.6, -1.05, -0.5, 0, 0, 0.55, 1.1, 0.5))
      kit.add(neck, BASE.torus, new Color('#ffd84a'), xf(0, top + 0.05, -0.85, -0.5, 0, 0, 0.24))
      break
    case 'short':
      cap(1.05, 0.5, 1.08)
      for (let i = 0; i < 6; i++) lump(-0.6 + i * 0.24, top + 0.15, 0.55, 0.22, dark)
      break
    default:
      // messy swoop
      cap(1.1, 0.66, 1.13)
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2
        lump(Math.cos(a) * 0.72, top + 0.05 + rand() * 0.32, Math.sin(a) * 0.72 - 0.05, 0.42 + rand() * 0.12, i % 3 ? c : dark)
      }
      kit.add(neck, BASE.ico, c, xf(0.25, top + 0.12, 0.72, 0.3, 0, 0, 0.85, 0.32, 0.38))
  }
}

function addAccessory(kit, neck, kind, rand) {
  if (kind === 'glasses') {
    const frame = new Color(['#1d1d1d', '#a63de2', '#e0245e'][Math.floor(rand() * 3)])
    for (const sx of [-1, 1]) kit.add(neck, BASE.torus, frame, xf(sx * 0.36, 0.95, 0.93, 0, 0, 0, 0.24, 0.24, 0.35))
    kit.add(neck, rbox(0.25, 0.06, 0.06, 0.02), frame, xf(0, 0.98, 0.95))
    for (const sx of [-1, 1]) kit.add(neck, rbox(0.05, 0.05, 0.8, 0.02), frame, xf(sx * 0.82, 0.98, 0.55))
  } else if (kind === 'bow') {
    const col = new Color(['#ff6fb5', '#ff3b5c', '#7fd0ff'][Math.floor(rand() * 3)])
    for (const sx of [-1, 1]) kit.add(neck, BASE.cone, col, xf(sx * 0.32, 1.95, 0.35, 0, 0, (sx * Math.PI) / 2, 0.8, 0.5, 0.6))
    kit.add(neck, BASE.sphereLo, col, xf(0, 1.95, 0.35, 0, 0, 0, 0.14))
  } else if (kind === 'headband') {
    kit.add(neck, BASE.torus, new Color(['#ff6fb5', '#ffd84a', '#5ec6ff'][Math.floor(rand() * 3)]), xf(0, 1.45, 0, Math.PI / 2 - 0.25, 0, 0, 0.92, 0.92, 0.5))
  } else if (kind === 'earrings') {
    for (const sx of [-1, 1]) kit.add(neck, BASE.sphereLo, new Color('#ffcc33'), xf(sx * 0.95, 0.5, 0.05, 0, 0, 0, 0.09))
  }
}

// Builds one character. opts: { seed, skin, hair, hairStyle, shirt, pants, shoes,
// belly (color | true | null), bellySize, faceStyle, name, accessory, design,
// extra(kit, bones, xf, BASE, rbox) }
export function buildCharacter(opts = {}) {
  const rand = mulberry32(opts.seed ?? Math.floor(Math.random() * 1e9))
  const pick = (arr) => arr[Math.floor(rand() * arr.length)]
  const skin = new Color(opts.skin ?? pick(SKINS))
  const shirtHex = opts.shirt ?? pick(SHIRTS)
  const shirt = new Color(shirtHex)
  const shirtDark = shade(shirtHex, 0.78)
  const pantsHex = opts.pants ?? pick(PANTS)
  const pants = new Color(pantsHex)
  const pantsDark = shade(pantsHex, 0.8)
  const shoes = new Color(opts.shoes ?? pick(SHOES))
  const sole = new Color('#f4f4f6')
  const hair = opts.hair ?? pick(HAIRS)
  const hairStyle = opts.hairStyle ?? pick(HAIR_STYLES)
  const faceStyle = opts.faceStyle ?? Math.floor(rand() * 8)
  const design = opts.design ?? pick(SHIRT_DESIGNS)
  const accessory = opts.accessory !== undefined ? opts.accessory : pick(ACCESSORIES)

  const root = new Group()
  const rig = bone('Rig1', root, 0, 0, 0)
  const spine1 = bone('Spine1', rig, 0, 2.4, 0)
  const spine2 = bone('Spine2', spine1, 0, 1.8, 0)
  const neck = bone('Neck1', bone('Neck_Offset', spine2, 0, 0.6, 0), 0, 0, 0)
  const arms = {}
  const legs = {}
  for (const side of [-1, 1]) {
    const L = side > 0 ? 'L' : 'R'
    const a1 = bone(`Arm${L}1`, bone(`Arm${L}_Offset`, spine2, side * 2, 0.6, 0), 0, 0, 0)
    arms[L] = [a1, bone(`Arm${L}2`, a1, 0, -1.2, 0)]
    const l1 = bone(`Leg${L}1`, bone(`Leg${L}_Offset`, rig, side * 0.6, 2.4, 0), 0, 0, 0)
    legs[L] = [l1, bone(`Leg${L}2`, l1, 0, -1.2, 0)]
  }
  const kit = new SkinKit()

  // --- torso (Spine1 space: hips at 0, shoulders at 2.4) ---
  kit.add(spine1, rbox(2.85, 0.62, 1.32, 0.16), pants, xf(0, 0.28, 0))
  kit.add(spine1, rbox(2.92, 0.16, 1.38, 0.06), opts.belt ?? shade(pantsHex, 0.6), xf(0, 0.6, 0))
  kit.add(spine1, rbox(0.34, 0.2, 0.08, 0.03), new Color('#d9b24a'), xf(0, 0.6, 0.7))
  kit.add(spine1, rbox(2.9, 1.82, 1.34, 0.2, 2), shirt, xf(0, 1.55, 0))
  kit.add(spine1, rbox(2.96, 0.2, 1.4, 0.08), shirtDark, xf(0, 0.74, 0)) // hem
  kit.add(spine1, BASE.torus, shirtDark, xf(0, 2.42, 0.02, Math.PI / 2, 0, 0, 0.62, 0.48, 0.55)) // collar
  for (const sx of [-1, 1]) kit.add(spine1, BASE.sphereLo, shirt, xf(sx * 1.25, 2.12, 0, 0, 0, 0, 0.48, 0.36, 0.6)) // shoulder caps
  if (design === 'stripe') kit.add(spine1, rbox(2.95, 0.32, 1.38, 0.06), new Color(pick(['#ffffff', '#ffd84a', '#ff6fb5', '#5ec6ff'])), xf(0, 1.85, 0))
  else if (design === 'pocket') kit.add(spine1, rbox(0.55, 0.5, 0.06, 0.025), shirtDark, xf(-0.75, 1.9, 0.68))
  else if (design === 'heart') {
    const hc = new Color(pick(['#ff3b5c', '#ffffff', '#ffd84a']))
    kit.add(spine1, BASE.sphereLo, hc, xf(-0.13, 2.0, 0.66, 0, 0, 0, 0.18, 0.18, 0.06))
    kit.add(spine1, BASE.sphereLo, hc, xf(0.13, 2.0, 0.66, 0, 0, 0, 0.18, 0.18, 0.06))
    kit.add(spine1, BASE.cone, hc, xf(0, 1.82, 0.66, Math.PI, 0, 0, 0.62, 0.22, 0.12))
  } else if (design === 'buttons') {
    for (let i = 0; i < 4; i++) kit.add(spine1, BASE.sphereLo, new Color('#f4f4f6'), xf(0, 1.0 + i * 0.4, 0.69, 0, 0, 0, 0.07, 0.07, 0.04))
    kit.add(spine1, rbox(0.06, 1.6, 0.04, 0.015), shirtDark, xf(0.16, 1.55, 0.68))
  }
  if (opts.belly) {
    const r = opts.bellySize ?? 1.35 + rand() * 0.25
    const bc = new Color(opts.belly === true ? pick(BELLIES) : opts.belly)
    kit.add(spine1, BASE.sphere, bc, xf(0, 1.05, 0.42 + r * 0.55, 0, 0, 0, r * 1.05, r, r))
    kit.add(spine1, BASE.sphereLo, shade('#' + bc.getHexString(), 0.75), xf(0, 0.95, 0.42 + r * 1.53, 0, 0, 0, 0.07, 0.07, 0.03)) // navel
  }

  // --- head (Neck1 space) ---
  kit.add(neck, BASE.cyl, skin, xf(0, -0.1, 0, 0, 0, 0, 0.42, 0.5, 0.42))
  kit.add(neck, BASE.head, skin, xf(0, 0, 0))
  kit.add(neck, BASE.face, skin, xf(0, 0.8, 0), faceStyle)
  for (const sx of [-1, 1]) kit.add(neck, BASE.sphereLo, skin, xf(sx * 0.88, 0.78, -0.05, 0, 0, 0, 0.13, 0.24, 0.17))
  if (hairStyle !== 'none') addHair(kit, neck, hairStyle, hair, rand)
  if (accessory) addAccessory(kit, neck, accessory, rand)

  // --- arms (upper: sleeve + cuff, lower: forearm, hand, thumb) ---
  for (const L of ['L', 'R']) {
    const side = L === 'L' ? 1 : -1
    const [a1, a2] = arms[L]
    const sleeve = opts.sleeves === false ? skin : shirt
    kit.add(a1, rbox(1.12, 1.25, 1.12, 0.2), sleeve, xf(side * 0.06, -0.58, 0))
    if (opts.sleeves !== false) kit.add(a1, rbox(1.18, 0.2, 1.18, 0.08), opts.cuff ?? shirtDark, xf(side * 0.06, -1.1, 0))
    kit.add(a2, rbox(1.0, 0.9, 1.0, 0.18), opts.longSleeves ? shirt : skin, xf(side * 0.06, -0.42, 0))
    kit.add(a2, rbox(1.02, 0.5, 0.92, 0.2), skin, xf(side * 0.06, -1.05, 0.02))
    kit.add(a2, rbox(0.26, 0.4, 0.3, 0.1), skin, xf(side * 0.06 - side * 0.38, -0.98, 0.5, 0.2, 0, 0))
  }

  // --- legs (thigh, shin, cuff, shoe with sole, toe cap, laces) ---
  for (const L of ['L', 'R']) {
    const side = L === 'L' ? 1 : -1
    const [l1, l2] = legs[L]
    kit.add(l1, rbox(1.4, 1.28, 1.3, 0.18), pants, xf(side * 0.13, -0.6, 0))
    kit.add(l2, rbox(1.34, 0.85, 1.24, 0.16), pants, xf(side * 0.13, -0.4, 0))
    kit.add(l2, rbox(1.4, 0.14, 1.3, 0.06), pantsDark, xf(side * 0.13, -0.82, 0))
    kit.add(l2, rbox(1.42, 0.16, 1.72, 0.07), sole, xf(side * 0.13, -1.12, 0.14))
    kit.add(l2, rbox(1.36, 0.36, 1.58, 0.16), shoes, xf(side * 0.13, -0.94, 0.12))
    kit.add(l2, BASE.sphereLo, shoes, xf(side * 0.13, -0.98, 0.78, 0, 0, 0, 0.66, 0.24, 0.3))
    for (let k = 0; k < 3; k++) kit.add(l2, rbox(0.6, 0.05, 0.07, 0.02), new Color('#f4f4f6'), xf(side * 0.13, -0.74, 0.28 + k * 0.18))
  }

  opts.extra?.(kit, { spine1, spine2, neck, arms, legs }, xf, BASE, rbox)

  const bones = []
  root.traverse((o) => o.isBone && bones.push(o))
  const mesh = kit.build(root, bones)
  root.add(mesh)
  root.scale.setScalar(S)
  root.updateMatrixWorld(true)
  mesh.bind(new Skeleton(bones))

  root.nodes = {}
  root.traverse((o) => {
    if (o.name) root.nodes[o.name] = o
  })
  root.animations = []
  const outer = new Group()
  outer.add(root)
  outer.userData.avatar = root
  if (opts.name) {
    const tag = label(opts.name, 0.17, { color: opts.nameColor ?? '#ffffff', outline: '#2b2b3a', outlineWidth: 10, font: '600 64px Fredoka, sans-serif' })
    tag.position.y = 2.45
    tag.material.opacity = 0.9
    outer.add(tag)
    outer.userData.tag = tag
  }
  return outer
}

export const randomMom = (seed, name) => buildCharacter({ seed, belly: true, name })

// Staff looks (uniform details are added through `extra`).
const reflective = (kit, b, xf, BASE, rbox) => {
  for (const L of ['L', 'R']) {
    kit.add(b.arms[L][0], rbox(1.16, 0.14, 1.16, 0.05), new Color('#e9ff6a'), xf(0, -0.8, 0))
    kit.add(b.legs[L][1], rbox(1.38, 0.14, 1.28, 0.05), new Color('#e9ff6a'), xf((L === 'L' ? 1 : -1) * 0.13, -0.55, 0))
  }
  kit.add(b.spine1, rbox(2.94, 0.14, 1.38, 0.05), new Color('#e9ff6a'), xf(0, 1.4, 0))
  kit.add(b.spine1, rbox(0.35, 0.55, 0.22, 0.06), new Color('#1d1d1d'), xf(1.0, 2.0, 0.72)) // radio
}
const badge = (color) => (kit, b, xf, BASE, rbox) => {
  kit.add(b.spine1, BASE.torus, new Color(color), xf(0, 2.0, 0.3, 1.25, 0, 0, 0.55, 0.65, 0.3))
  kit.add(b.spine1, rbox(0.42, 0.55, 0.05, 0.02), new Color('#ffffff'), xf(0, 1.55, 0.7))
  kit.add(b.spine1, rbox(0.3, 0.12, 0.06, 0.02), new Color(color), xf(0, 1.7, 0.72))
}
export const STAFF = {
  paramedic: { shirt: '#2f5fd6', pants: '#2f5fd6', hair: '#d99ae8', hairStyle: 'long', skin: '#f3c99c', faceStyle: 1, accessory: null, design: 'plain', extra: reflective },
  receptionist: { shirt: '#f2a6cf', pants: '#33335a', hair: '#d8311f', hairStyle: 'bun', skin: '#c68a5a', faceStyle: 1, accessory: 'earrings', design: 'plain', extra: badge('#24d4d1') },
  receptionist2: { shirt: '#f2a6cf', pants: '#33335a', hair: '#6b3418', hairStyle: 'spiky', skin: '#f3c99c', faceStyle: 1, accessory: null, design: 'plain', extra: badge('#24d4d1') },
  nurse: {
    shirt: '#ff9fcf', pants: '#ff9fcf', hair: '#f6b3e3', hairStyle: 'ponytail', skin: '#f5d0b0', faceStyle: 4, accessory: null, design: 'pocket',
    extra(kit, b, xf, BASE, rbox) {
      badge('#ffffff')(kit, b, xf, BASE, rbox)
      kit.add(b.spine1, BASE.cone, new Color('#e46aa8'), xf(0, 2.25, 0.7, Math.PI, 0, 0, 1.2, 0.4, 0.05)) // V-neck
    },
  },
  coach: {
    shirt: '#ff9fcf', pants: '#ff9fcf', hair: '#f6a6e0', hairStyle: 'messy', skin: '#f5d0b0', faceStyle: 4, accessory: 'headband', design: 'heart',
    extra(kit, b, xf, BASE, rbox) {
      for (const L of ['L', 'R']) kit.add(b.arms[L][1], rbox(1.08, 0.2, 1.08, 0.08), new Color('#a66be8'), xf(0, -0.75, 0))
    },
  },
  tech: { shirt: '#3fc8d8', pants: '#1f6e8a', hair: '#1b1b1b', hairStyle: 'short', skin: '#8d5a3b', faceStyle: 0, accessory: 'glasses', design: 'pocket', extra: badge('#0c1a4a') },
  doctor: {
    shirt: '#f4f6f8', pants: '#3a4f8a', hair: '#8a2f17', hairStyle: 'spiky', skin: '#f3c99c', faceStyle: 1, accessory: null, design: 'buttons', longSleeves: true,
    extra(kit, b, xf, BASE, rbox) {
      // lab coat tails, lapels, stethoscope, head mirror
      kit.add(b.spine1, rbox(3.0, 1.3, 1.42, 0.12), new Color('#f4f6f8'), xf(0, -0.35, 0))
      for (const sx of [-1, 1]) kit.add(b.spine1, rbox(0.45, 1.5, 0.06, 0.025), new Color('#dfe3e8'), xf(sx * 0.45, 1.75, 0.69, 0, 0, sx * 0.15))
      kit.add(b.spine1, BASE.torus, new Color('#2b2f3a'), xf(0, 2.15, 0.25, 1.2, 0, 0, 0.6, 0.75, 0.4))
      kit.add(b.spine1, BASE.cyl, new Color('#c9ced6'), xf(0.35, 1.4, 0.72, Math.PI / 2, 0, 0, 0.16, 0.08, 0.16))
      kit.add(b.neck, BASE.torus, new Color('#2ec4b6'), xf(0, 1.15, 0, Math.PI / 2, 0, 0, 0.95, 0.95, 0.55))
      kit.add(b.neck, BASE.cyl, new Color('#d9dde2'), xf(0.3, 1.25, 0.98, Math.PI / 2, 0, 0, 0.35, 0.1, 0.35))
    },
  },
}
export const buildStaff = (kind, name) => buildCharacter({ ...STAFF[kind], name, belly: null, seed: kind.length * 97 })

// --- Belly fabric ------------------------------------------------------------------------
// The swaddles' cloth (and avatar/belly.js's fallback ball). The player's belly itself lives in
// avatar/belly.js, built into the avatar's own torso.
let bellyNormal = null
export function bellyMaterial(color) {
  bellyNormal ||= tex(fabric('#808080', 128, 5, 40).normal, { srgb: false, repeat: [3, 3] })
  return new MeshPhysicalMaterial({ color, roughness: 0.82, sheen: 0.4, sheenColor: '#ffffff', normalMap: bellyNormal })
}

// --- Babies ---------------------------------------------------------------------------------
export const BABY_TYPES = [
  { id: 'sleepy', name: 'Sleepy Baby', rarity: 0, swaddle: '#8fb8ff', quote: 'Welcome to the world, {n}! Shh... nap first, cuddles later.', coins: 20 },
  { id: 'giggly', name: 'Giggly Baby', rarity: 0, swaddle: '#ffb3d9', quote: '{n} giggled at the doctor. Instant best friends!', coins: 20 },
  { id: 'bunny', name: 'Bunny Baby', rarity: 1, swaddle: '#f5f0ff', quote: '{n} came with ears! Hop hop hooray!', coins: 26 },
  { id: 'dino', name: 'Dino Baby', rarity: 1, swaddle: '#7bd88f', quote: 'RAWR! {n} is ready to stomp around.', coins: 26 },
  { id: 'royal', name: 'Royal Baby', rarity: 2, swaddle: '#8a2be2', quote: 'Welcome to the world, {n}! Bow before the tiny ruler!', coins: 32 },
  { id: 'chef', name: 'Chef Baby', rarity: 2, swaddle: '#ffffff', quote: '{n} already wants to taste-test everything.', coins: 32 },
  { id: 'astro', name: 'Astronaut Baby', rarity: 3, swaddle: '#dfe6ee', quote: '{n} landed from outer space. One small step!', coins: 60 },
  { id: 'rainbow', name: 'Rainbow Baby', rarity: 3, swaddle: '#ff7aa8', quote: '{n} brightens every room. Pure sunshine!', coins: 60 },
  { id: 'golden', name: 'Golden Baby', rarity: 4, swaddle: '#ffcf3a', quote: 'A one-in-a-million miracle! {n} is solid gold!', coins: 150 },
]
export const RARITIES = [
  { name: 'COMMON', color: '#9aa4b2', weight: 46 },
  { name: 'UNCOMMON', color: '#4fd06a', weight: 28 },
  { name: 'RARE', color: '#4aa8ff', weight: 16 },
  { name: 'EPIC', color: '#b45cff', weight: 8 },
  { name: 'LEGENDARY', color: '#ffb020', weight: 2 },
]
export function rollBabyType(rand = Math.random) {
  const total = RARITIES.reduce((s, r) => s + r.weight, 0)
  let x = rand() * total
  let rarity = 0
  for (let i = 0; i < RARITIES.length; i++) {
    x -= RARITIES[i].weight
    if (x <= 0) {
      rarity = i
      break
    }
  }
  const pool = BABY_TYPES.filter((b) => b.rarity === rarity)
  return pool[Math.floor(rand() * pool.length)]
}

const babyMatCache = new Map()
const bmat = (color, rough = 0.7, extra = {}) => {
  const k = color + rough + JSON.stringify(extra)
  if (!babyMatCache.has(k)) babyMatCache.set(k, new MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }))
  return babyMatCache.get(k)
}
function bm(parent, geo, mat, x, y, z, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) {
  const m = new Mesh(geo, mat)
  m.position.set(x, y, z)
  m.scale.set(sx, sy, sz)
  m.rotation.set(rx, ry, rz)
  m.castShadow = true
  parent.add(m)
  return m
}

// A swaddled baby (~0.75 m long at scale, lying along +X): swaddle with wrap
// folds and a hood, tiny hands, face, hair curl, pacifier, type accessory, name tag.
export function buildBaby(typeId = 'royal', name = null) {
  const type = BABY_TYPES.find((b) => b.id === typeId) ?? BABY_TYPES[0]
  const g = new Group()
  const swaddleMat = bellyMaterial(type.swaddle)
  if (type.id === 'golden') {
    swaddleMat.metalness = 0.6
    swaddleMat.roughness = 0.35
    swaddleMat.emissive.set('#5a3a00')
  }
  const fold = shade(type.swaddle, 0.85)
  const foldMat = bellyMaterial('#' + fold.getHexString())
  bm(g, BASE.sphere, swaddleMat, 0, 0, 0, 0.27, 0.16, 0.18)
  // wrap folds: tilted rings around the body
  for (let i = 0; i < 3; i++) bm(g, BASE.torus, foldMat, -0.14 + i * 0.1, 0.01, 0, 0.14 - Math.abs(i - 1) * 0.02, 0.15, 0.17, 0, Math.PI / 2, 0.35)
  // hood behind the head
  bm(g, BASE.sphere, swaddleMat, 0.22, 0.04, 0, 0.15, 0.15, 0.16)
  bm(g, BASE.torus, foldMat, 0.27, 0.06, 0, 0.11, 0.12, 0.2, 0, Math.PI / 2, -0.35)
  if (type.id === 'rainbow') {
    ;['#ff5f5f', '#ffb84a', '#ffe34a', '#6fe07a', '#59c3ff', '#b77dff'].forEach((c, i) => bm(g, BASE.torus, bmat(c, 0.6), -0.17 + i * 0.05, 0, 0, 0.15, 0.16, 0.1, 0, Math.PI / 2, 0))
  }
  if (type.id === 'dino') for (let i = 0; i < 5; i++) bm(g, BASE.cone, bmat('#3fa456', 0.6), -0.2 + i * 0.07, 0.15, 0, 0.09, 0.09, 0.09)
  const skinMat = bmat('#f7d6bd', 0.65)
  const head = bm(g, BASE.sphere, skinMat, 0.27, 0.07, 0, 0.12)
  void head
  for (const sz of [-1, 1]) bm(g, BASE.sphereLo, skinMat, 0.25, 0.07, sz * 0.12, 0.025, 0.035, 0.02) // ears
  for (const sz of [-1, 1]) bm(g, BASE.sphereLo, skinMat, 0.1, 0.13, sz * 0.07, 0.035, 0.03, 0.035) // hands peeking
  bm(g, BASE.torus, bmat('#7a4a2a', 0.8), 0.33, 0.19, 0, 0.025, 0.025, 0.04, 0, 0, 1.2) // hair curl
  const ft = new CanvasTexture(paintFace(5, 128))
  ft.colorSpace = SRGBColorSpace
  const fp = new Mesh(new PlaneGeometry(0.17, 0.17), new MeshStandardMaterial({ map: ft, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }))
  fp.position.set(0.335, 0.155, 0)
  fp.rotation.order = 'YXZ'
  fp.rotation.set(-Math.PI / 2 - 0.6, -Math.PI / 2, 0)
  g.add(fp)
  bm(g, BASE.cyl, bmat('#ff2d8a', 0.4), 0.37, 0.2, 0, 0.035, 0.012, 0.035, 0, 0, 0.9)
  bm(g, BASE.sphereLo, bmat('#ffe3f0', 0.3), 0.385, 0.215, 0, 0.012)
  const hat = new Group()
  hat.position.set(0.25, 0.2, 0)
  g.add(hat)
  const gold = bmat('#ffcc33', 0.25, { metalness: 0.8 })
  if (type.id === 'royal' || type.id === 'golden') {
    bm(hat, new CylinderGeometry(0.075, 0.08, 0.05, 16, 1, true), bmat('#ffcc33', 0.25, { metalness: 0.8, side: DoubleSide }), 0, 0, 0)
    for (let i = 0; i < 8; i++) bm(hat, BASE.cone, gold, Math.cos((i / 8) * 6.28) * 0.075, 0.045, Math.sin((i / 8) * 6.28) * 0.075, 0.04, 0.05, 0.04)
    for (let i = 0; i < 4; i++) bm(hat, BASE.sphereLo, bmat(['#e0245e', '#3a7bff', '#2ec46b', '#e0245e'][i], 0.2), Math.cos(i * 1.57) * 0.08, 0, Math.sin(i * 1.57) * 0.08, 0.014)
  } else if (type.id === 'sleepy') {
    bm(hat, new ConeGeometry(0.1, 0.24, 14), bmat('#5d7fd6', 0.8), -0.06, 0.01, 0, 1, 1, 1, 0, 0, 1.1)
    bm(hat, BASE.torus, bmat('#ffffff', 0.9), 0.02, -0.04, 0, 0.1, 0.1, 0.25, 0, 0, Math.PI / 2 + 1.1)
    bm(hat, BASE.sphereLo, bmat('#ffffff', 0.9), -0.17, -0.04, 0, 0.03)
  } else if (type.id === 'chef') {
    bm(hat, new CylinderGeometry(0.09, 0.08, 0.08, 18), bmat('#ffffff', 0.9), 0, 0, 0)
    for (let i = 0; i < 5; i++) bm(hat, BASE.sphereLo, bmat('#ffffff', 0.9), Math.cos(i * 1.26) * 0.06, 0.08, Math.sin(i * 1.26) * 0.06, 0.06)
  } else if (type.id === 'bunny') {
    for (const z of [-0.045, 0.045]) {
      bm(hat, BASE.sphere, bmat('#ffffff', 0.9), -0.03, 0.09, z, 0.03, 0.11, 0.022, 0, 0, 0.5)
      bm(hat, BASE.sphere, bmat('#ffb3cf', 0.9), -0.025, 0.09, z, 0.016, 0.08, 0.024, 0, 0, 0.5)
    }
  } else if (type.id === 'astro') {
    bm(hat, BASE.sphere, new MeshPhysicalMaterial({ color: '#cfefff', transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.1 }), 0.01, -0.12, 0, 0.17)
    bm(hat, BASE.torus, bmat('#c9ced8', 0.3, { metalness: 0.6 }), -0.03, -0.17, 0, 0.13, 0.13, 0.13, 0, 0, Math.PI / 2 - 0.3)
  }
  if (name) {
    const tag = label(name, 0.13, { color: '#ff5fb4', outline: '#ffffff', outlineWidth: 12 })
    tag.position.set(0.1, 0.42, 0)
    g.add(tag)
    g.userData.tag = tag
  }
  g.userData.type = type
  g.scale.setScalar(1.5) // read clearly in the arms and the crib
  return g
}

// --- Pip, the little flying pet ----------------------------------------------------------
export function buildPet() {
  const g = new Group()
  const fur = bmat('#f0a13a', 0.85)
  bm(g, BASE.sphere, fur, 0, 0, 0, 0.12, 0.13, 0.11)
  bm(g, BASE.sphere, bmat('#ffe2a8', 0.9), 0, -0.02, 0.07, 0.07, 0.08, 0.05)
  for (let i = 0; i < 2; i++) bm(g, BASE.torus, bmat('#7a4a1a', 0.8), 0, -0.04 + i * 0.05, -0.03, 0.1, 0.1, 0.06, Math.PI / 2, 0, 0) // stripes
  for (const sx of [-1, 1]) {
    bm(g, BASE.cone, fur, sx * 0.07, 0.13, 0, 0.09, 0.09, 0.09, 0, 0, -sx * 0.4)
    bm(g, BASE.cone, bmat('#ffb3cf', 0.9), sx * 0.07, 0.125, 0.012, 0.05, 0.06, 0.04, 0, 0, -sx * 0.4)
    bm(g, BASE.sphereLo, bmat('#1a1a1a', 0.2), sx * 0.045, 0.04, 0.1, 0.018)
    bm(g, BASE.sphereLo, bmat('#ffffff', 0.2), sx * 0.04, 0.047, 0.115, 0.006)
    bm(g, BASE.sphereLo, bmat('#ff8aa8', 0.9), sx * 0.075, 0.005, 0.085, 0.02, 0.012, 0.01)
    bm(g, BASE.sphereLo, fur, sx * 0.05, -0.12, 0.02, 0.03, 0.025, 0.04) // feet
  }
  bm(g, BASE.sphereLo, bmat('#3a2010', 0.4), 0, 0.015, 0.112, 0.012)
  bm(g, BASE.cone, fur, 0, -0.02, -0.13, 0.05, 0.12, 0.05, -1.9, 0, 0) // tail
  const wingMat = new MeshPhysicalMaterial({ color: '#eaf6ff', transparent: true, opacity: 0.6, roughness: 0.2, side: DoubleSide, depthWrite: false })
  const wings = []
  for (const sx of [-1, 1]) {
    const pivot = new Group()
    pivot.position.set(sx * 0.06, 0.06, -0.08)
    bm(pivot, BASE.sphere, wingMat, sx * 0.11, 0, 0, 0.12, 0.07, 0.01)
    bm(pivot, BASE.sphere, wingMat, sx * 0.08, -0.06, 0.01, 0.07, 0.04, 0.01)
    g.add(pivot)
    wings.push({ pivot, sx })
  }
  const tag = label('Pip', 0.16, { color: '#6ee86e', outline: '#1d3a1d', outlineWidth: 12 })
  tag.position.y = 0.32
  g.add(tag)
  const pos = new Vector3()
  let t = 0
  g.userData.update = (dt, target, facing) => {
    t += dt
    for (const { pivot, sx } of wings) pivot.rotation.y = sx * (0.3 + Math.sin(t * 28) * 0.6)
    const side = 0.55
    const tx = target.x + Math.cos(facing) * side - Math.sin(facing) * 0.35
    const tz = target.z - Math.sin(facing) * side - Math.cos(facing) * 0.35
    const ty = target.y + 1.75 + Math.sin(t * 2.2) * 0.08
    const k = 1 - Math.exp(-5 * dt)
    if (pos.lengthSq() === 0 || pos.distanceTo(target) > 12) pos.set(tx, ty, tz)
    pos.x += (tx - pos.x) * k
    pos.y += (ty - pos.y) * k
    pos.z += (tz - pos.z) * k
    g.position.copy(pos)
    g.rotation.y = facing + Math.sin(t * 1.3) * 0.3
  }
  g.userData.snap = () => pos.set(0, 0, 0)
  return g
}
