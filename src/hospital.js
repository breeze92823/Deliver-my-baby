// The maternity hospital: the outside (long pastel building with a pink sign,
// entrance canopy, balloon arch, balloon bunches and flower planters) on the
// main street, and six interior rooms placed far apart in their own spots
// (each is a closed box, so they never see each other): lobby / check-in,
// waiting room, breathing class, ultrasound wing, final line and the delivery
// room. Queue rooms get a serpentine stanchion lane; the path is returned
// front-to-back for the queue system.
import { CanvasTexture, Group, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from 'three'
import { bake } from './bake.js'
import { Builder, M, balloonArch, balloonCluster, bench, bollard, ceilingLight, ceilingVent, chair, ivStand, planter, pottedPlant, stanchionLine, topiary, trashBin, tree, wallClock, waterCooler } from './props.js'
import { babyPoster, cnv, drawHeart, fabric, floorTiles, heartPoster, roundRect, sign, signTex, tex, ultrasoundImage, woodGrain } from './paint.js'
import { HOSPITAL_X, STREET } from './world.js'
import { HOSPITAL_NAME } from './config.js'
import { mulberry32 } from './textures.js'

export const HOSPITAL = {
  x: HOSPITAL_X,
  facadeZ: -2,
  entrance: { x: HOSPITAL_X, z: -1.2 },
  ambulanceStop: { x: HOSPITAL_X + 10, z: STREET.laneZ },
}

// --- Outside --------------------------------------------------------------------------
export function buildHospitalExterior(scene) {
  const raw = new Group()
  const b = new Builder(raw)
  const H = HOSPITAL_X
  const fz = HOSPITAL.facadeZ
  const wall = M('#e9e3f6', 0.8)
  const trim = M('#f4a6cf', 0.6)
  const white = M('#ffffff', 0.5)
  // main block
  b.span(H - 42, 0, fz - 34, H + 42, 7.6, fz, wall, { solid: true })
  b.span(H - 42.4, 7.6, fz - 34.4, H + 42.4, 8.1, fz + 0.4, white)
  b.span(H - 42.6, 8.1, fz - 34.6, H + 42.6, 8.6, fz + 0.6, trim)
  // windows across the facade and sides
  const glass = M('#5ba6f2', 0.15, { metalness: 0.1 })
  for (let x = H - 38; x <= H + 38; x += 6) {
    if (Math.abs(x - H) < 9) continue
    b.box(3.5, 3.5, 0.1, white, x, 3.4, fz + 0.05)
    b.box(3.2, 3.2, 0.14, glass, x, 3.4, fz + 0.07)
    b.box(0.1, 3.2, 0.2, white, x, 3.4, fz + 0.1)
    b.box(3.2, 0.1, 0.2, white, x, 4.2, fz + 0.1)
    b.box(3.6, 0.2, 0.45, white, x, 1.7, fz + 0.2)
  }
  for (let z = fz - 30; z <= fz - 4; z += 6) {
    for (const s of [-1, 1]) {
      b.box(0.1, 3.5, 3.5, white, H + s * 42.05, 3.4, z)
      b.box(0.14, 3.2, 3.2, glass, H + s * 42.07, 3.4, z)
      b.box(0.2, 3.2, 0.1, white, H + s * 42.1, 3.4, z)
    }
  }
  // pink base band, rooftop AC units and vents
  b.span(H - 42.08, 0, fz - 34.08, H + 42.08, 0.6, fz + 0.08, M('#f4b6d6', 0.7))
  for (const ax of [H - 25, H - 5, H + 18]) {
    b.box(3, 1.2, 2.2, M('#d9dde6', 0.5), ax, 8.6 + 0.6, fz - 14, { round: 0.1 })
    for (const fx2 of [-0.7, 0.7]) {
      b.cyl(0.55, 0.06, M('#2b2f3a', 0.5), ax + fx2, 9.82, fz - 14, { segments: 18 })
      b.box(1.0, 0.04, 0.06, M('#9aa6bb', 0.5), ax + fx2, 9.86, fz - 14)
    }
  }
  for (const vx of [H - 33, H + 30]) b.cyl(0.35, 0.8, M('#c9ced6', 0.3, { metalness: 0.6 }), vx, 9.0, fz - 8, { segments: 12 })
  // name sign
  b.sign(HOSPITAL_NAME.toUpperCase(), 26, 2.6, H - 21, 6.1, fz + 0.08, '+z', { color: '#f0479f', outline: '#ffffff', outlineWidth: 18, weight: 700 })
  // entrance: recess, glass doors, canopy, pillars
  // entrance, layered outward from the facade with clear gaps: lobby glow -> glass -> mullion/frame
  b.span(H - 2.5, 0.08, fz + 0.02, H + 2.5, 3.9, fz + 0.06, M('#ffffff', 0.4, { emissive: '#e9fbff', emissiveIntensity: 0.55 }), { cast: false })
  b.span(H - 2.5, 0.08, fz + 0.1, H + 2.5, 3.9, fz + 0.14, M('#bfe7f2', 0.1, { transparent: true, opacity: 0.45 }), { cast: false })
  b.span(H - 0.06, 0.08, fz + 0.1, H + 0.06, 3.9, fz + 0.22, white, { cast: false })
  b.span(H - 2.9, 0, fz, H - 2.5, 4.3, fz + 0.3, white)
  b.span(H + 2.5, 0, fz, H + 2.9, 4.3, fz + 0.3, white)
  b.span(H - 2.9, 3.9, fz, H + 2.9, 4.3, fz + 0.3, white)
  const cz1 = fz + 6.5
  for (const s of [-1, 1]) b.box(0.6, 5.3, 0.6, white, H + s * 4.2, 2.65, cz1 - 0.5, { solid: true, round: 0.08 })
  b.span(H - 4.9, 5.3, fz, H + 4.9, 5.8, cz1, white)
  b.span(H - 5.0, 5.8, cz1 - 0.6, H + 5.0, 6.15, cz1 + 0.1, trim)
  b.sign('❤ MATERNITY ❤', 7.5, 1.1, H, 6.55, cz1 + 0.12, '+z', { bg: '#ffffff', color: '#f0479f', radius: 40, border: '#f4a6cf', borderWidth: 18 })
  for (const s of [-1, 1]) {
    b.box(0.3, 0.5, 0.25, M('#ffffff', 0.4), H + s * 3.3, 3.2, fz + 0.15, { round: 0.05 })
    b.box(0.22, 0.32, 0.06, M('#fff3c4', 0.3, { emissive: '#ffe08a', emissiveIntensity: 0.6 }), H + s * 3.3, 3.2, fz + 0.3)
  }
  b.box(0.6, 0.15, 0.2, M('#2b2f3a', 0.4), H, 4.08, fz + 0.35)
  for (let k = 0; k < 4; k++) for (const s of [-1, 1]) bollard(b, H + s * 2.9, fz + 6 + k * 1.6)
  bench(b, H - 6.5, fz + 5.2, 0)
  bench(b, H + 6.5, fz + 5.2, 0)
  balloonArch(b, H, fz + 3.6, 2.9)
  balloonCluster(b, H - 5.6, fz + 4.6, ['#ffe066', '#ffffff', '#5ec6ff'], { height: 4.2 })
  balloonCluster(b, H + 5.6, fz + 4.6, ['#b98bff', '#ff8ad0', '#ffffff'], { height: 4.2 })
  // planters, path
  const rand = mulberry32(77)
  planter(b, H - 12.5, fz + 2.2, 10, 2.4, rand)
  planter(b, H + 12.5, fz + 2.2, 10, 2.4, rand)
  b.span(H - 2.4, -0.04, fz + 0.32, H + 2.4, 0.08, STREET.walkN[0] - 0.02, M('#e6e6ee', 0.9), { cast: false })
  for (const x of [H - 50, H - 58, H + 50, H + 56]) tree(b, x, fz - 6 + rand() * 10, rand, 1.1)
  const baked = bake(raw)
  baked.traverse((o) => {
    if (o.isMesh) o.receiveShadow = true
  })
  scene.add(baked)
  return baked
}

// --- Interior rooms ---------------------------------------------------------------------
const ROOM_SPACING = 800
export const ROOM_IDS = ['lobby', 'waiting', 'breathing', 'ultrasound', 'final', 'delivery']
export const roomOrigin = (id) => new Vector3(3000 + ROOM_IDS.indexOf(id) * ROOM_SPACING, 0, 0)

const THEMES = {
  lobby: {
    wallA: '#f4f2f5', wallB: '#f4f2f5', stripe: '#24d4d1', floor: ['#f6f0f3', '#ddd2d8'], carpet: null,
    rope: '#24d4d1', post: '#c8ccd4', top: '#c8ccd4', chairs: ['#f08fbf'], door: '#24d4d1',
    banner: { text: 'CHECK-IN', bg: '#24d4d1', color: '#ffffff', italic: true },
    posters: [['NAME IDEAS?\nWE LOVE THEM ALL!', '#f58cc0', '#ffffff']],
    rows: 4,
  },
  waiting: {
    wallA: '#f8d5e8', wallB: '#d4e3f8', stripe: '#ff7fc0', floor: ['#f7f4f7', '#e6dfe6'], carpet: '#dde5f4',
    rope: '#ff8fc8', post: '#ffffff', top: '#ff8fc8', chairs: ['#f58cc0', '#6fb4f2'], door: '#f58cc0',
    banner: { text: 'MATERNITY WAITING ROOM', bg: '#6aaef2', color: '#ffffff', italic: true },
    posters: [['Breathe\nin... breathe\nout 🌸', '#ffe0ef', '#5a2a4a'], ['Every baby\nis a VIP 👶', '#e8f0ff', '#2a2a5a'], ['Hydrate,\nmama! 💧', '#e2f7ec', '#2a4a3a'], ['Almost\ntime! ❤️', '#fff6d6', '#5a3a2a']],
    rows: 4,
  },
  breathing: {
    wallA: '#e8dcf8', wallB: '#d6f3e8', stripe: '#a66be8', floor: ['#f6f4fa', '#e4e0ec'], carpet: '#ecebf2',
    rope: '#a66be8', post: '#ffffff', top: '#a66be8', chairs: ['#a66be8'], door: '#a66be8',
    banner: { text: 'BREATHING CLASS', bg: '#62d1a6', color: '#ffffff', italic: false },
    posters: [['Breathe in\n4... hold 4...\nout 4 💨', '#efe6ff', '#3a2a5a'], ['Relax those\nshoulders 🧘', '#ffffff', '#3a2a5a'], ['In through\nthe nose 👃', '#fff8e0', '#3a2a5a'], ["You've got\nthis, mama 💜", '#ffe6f2', '#3a2a5a']],
    rows: 4,
    mats: true,
  },
  ultrasound: {
    wallA: '#1e3fbf', wallB: '#1e3fbf', stripe: '#2bd8ff', floor: ['#e8eef8', '#cfd9ea'], carpet: '#b9c9ea',
    rope: '#2bd8ff', post: '#c9dcf0', top: '#2bd8ff', chairs: ['#2bd8ff', '#5a8cf2'], door: '#2bd8ff',
    banner: { text: 'ULTRASOUND WING', bg: '#0c1a4a', color: '#7fe9ff', italic: true },
    posters: [['Say\ncheese,\nbaby! 📷', '#dfe9ff', '#1e2a5a'], ['Wave hi\nto mom 👋', '#e6ddff', '#1e2a5a'], ['Heartbeat:\nstrong 💙', '#ddf4ff', '#1e2a5a'], ['Tiny toes\nspotted 👣', '#f2e6ff', '#1e2a5a']],
    rows: 4,
    monitors: ['👣 tiny toes', '♡ 138 bpm', '👋 waving!', '♡ 142 bpm'],
  },
  final: {
    wallA: '#ffe27a', wallB: '#a63de2', stripe: '#ffd21f', floor: ['#fbf7ee', '#e9e2d0'], carpet: '#e3202f',
    rope: '#ffd21f', post: '#f2c230', top: '#ffd21f', chairs: ['#a63de2', '#ffd21f'], door: '#ffd21f',
    banner: { text: '⭐ LAST LINE BEFORE YOUR BABY! ⭐', bg: '#f5b800', color: '#ffffff', italic: true },
    posters: [['LAST\nLINE! 🏁', '#fff9e6', '#2a2a3a'], ['Your baby\nis next\ndoor 👶', '#f4ecff', '#2a2a3a'], ['Almost a\nmom! 🎉', '#ffeef6', '#2a2a3a'], ['Final\nstretch! 💪', '#fff6d0', '#2a2a3a']],
    rows: 5,
    wallText: '🏁 FINAL LINE 🏁',
  },
}

const W = 36
const D = 32
const HGT = 8.5

// Serpentine lane: rows along X from the back (+Z) toward the front (-Z).
function lanePath(rows, xr = 9, zBack = 6, spacing = 1.8) {
  const pts = []
  for (let k = 0; k < rows; k++) {
    const z = zBack - k * spacing
    const right = k % 2 === 0
    pts.push(new Vector3(right ? xr : -xr, 0, z), new Vector3(right ? -xr : xr, 0, z))
  }
  return pts // back -> front
}

function buildQueueRoom(scene, id) {
  const th = THEMES[id]
  const o = roomOrigin(id)
  const raw = new Group()
  const b = new Builder(raw, o.x, o.y, o.z)
  b.castDefault = false
  const hx = W / 2
  const hz = D / 2
  const rand = mulberry32(id.length * 1013)
  const tile = floorTiles(th.floor[0], th.floor[1], 256, 2, id.length)
  const floorMat = new MeshStandardMaterial({ map: tex(tile, { repeat: [W / 3, D / 3] }), roughness: 0.35, metalness: 0.0 })
  b.span(-hx, -0.3, -hz, hx, 0, hz, floorMat, { solid: true })
  b.span(-hx, HGT, -hz, hx, HGT + 0.3, hz, M('#fbfbfd', 0.9), { solid: true })
  const wallA = M(th.wallA, 0.9)
  const wallB = M(th.wallB, 0.9)
  b.span(-hx - 0.4, 0, -hz - 0.4, hx + 0.4, HGT, -hz, th.wallB === th.wallA ? wallA : wallB, { solid: true }) // front (-Z)
  b.span(-hx - 0.4, 0, hz, hx + 0.4, HGT, hz + 0.4, wallA, { solid: true }) // back (+Z, entrance)
  b.span(-hx - 0.4, 0, -hz, -hx, HGT, hz, wallA, { solid: true }) // west
  b.span(hx, 0, -hz, hx + 0.4, HGT, hz, wallB, { solid: true }) // east
  // stripe + skirting around the room
  const stripe = M(th.stripe, 0.5)
  const sY = id === 'ultrasound' ? 2.2 : 3.6
  b.span(-hx, sY, -hz, hx, sY + 0.35, -hz + 0.05, stripe)
  b.span(-hx, sY, hz - 0.05, hx, sY + 0.35, hz, stripe)
  b.span(-hx, sY, -hz, -hx + 0.05, sY + 0.35, hz, stripe)
  b.span(hx - 0.05, sY, -hz, hx, sY + 0.35, hz, stripe)
  b.span(-hx, 0, -hz, hx, 0.25, -hz + 0.06, M('#ffffff', 0.6))
  b.span(-hx, 0, hz - 0.06, hx, 0.25, hz, M('#ffffff', 0.6))
  // ceiling lights
  for (let x = -12; x <= 12; x += 8) for (let z = -10; z <= 10; z += 7) ceilingLight(b, x, HGT, z, 3.4, 0.9)
  // entrance door (back wall) + exit door (front wall)
  const doorM = M(th.door, 0.5)
  b.span(-1.6, 0, hz - 0.12, 1.6, 4.2, hz - 0.02, doorM)
  b.span(-1.9, 4.2, hz - 0.14, 1.9, 4.45, hz - 0.02, M('#ffffff', 0.5))
  const exitX = -11
  b.span(exitX - 1.6, 0, -hz + 0.02, exitX + 1.6, 4.4, -hz + 0.14, doorM)
  b.span(exitX - 1.9, 4.4, -hz + 0.02, exitX + 1.9, 4.65, -hz + 0.16, M('#ffffff', 0.5))
  b.cyl(0.55, 0.05, M('#cfefff', 0.1), exitX, 3.2, -hz + 0.17, { segments: 24 }).rotation.x = Math.PI / 2

  // queue lane, carpet, stanchions, start mat
  const lane = lanePath(th.rows, 9, 5.5, 1.8)
  const zBack = lane[0].z
  const zFront = lane[lane.length - 1].z
  if (th.carpet) b.span(-10.6, 0.005, zFront - 1.1, 10.6, 0.04, zBack + 1.1, M(th.carpet, 0.95), { cast: false })
  b.castDefault = true
  const sOpts = { post: th.post, top: th.top, rope: th.rope, base: id === 'final' ? '#c9a020' : '#3a3f4a' }
  const xr = 10.2
  const posts = (z, xa, xb) => {
    const n = Math.max(1, Math.round((xb - xa) / 2.3))
    return Array.from({ length: n + 1 }, (_, i) => ({ x: xa + ((xb - xa) * i) / n, z }))
  }
  stanchionLine(b, posts(zBack + 0.9, -xr, xr), sOpts)
  stanchionLine(b, posts(zFront - 0.9, -xr + 2.2, xr), sOpts)
  for (let k = 0; k < th.rows - 1; k++) {
    const z = zBack - k * 1.8 - 0.9
    const gapLeft = k % 2 === 0 // row k (even) runs to -X and turns there
    stanchionLine(b, gapLeft ? posts(z, -xr + 2.2, xr) : posts(z, -xr, xr - 2.2), sOpts)
  }
  stanchionLine(b, [{ x: xr, z: zBack - 0.9 }, { x: xr, z: zFront - 0.9 }], sOpts)
  stanchionLine(b, [{ x: -xr, z: zBack + 0.9 }, { x: -xr, z: zFront + 0.9 }], sOpts)
  b.castDefault = false
  const matCol = id === 'final' ? '#fff3b0' : id === 'ultrasound' ? '#7fe9ff' : id === 'breathing' ? '#eadcff' : '#ffd0e8'
  const startMat = { x: xr + 2.2, z: zBack }
  const lineMat = b.picture(signTex('LINE\nSTARTS\nHERE', { w: 512, h: 512, bg: matCol, color: '#ffffff', outline: '#00000022', outlineWidth: 8, italic: true, radius: 40 }), 3, 3, startMat.x, 0.04, startMat.z, '+z', { transparent: true })
  lineMat.rotation.set(-Math.PI / 2, 0, 0)
  lineMat.position.y = 0.08 // above the carpet

  // banner + posters + room-specific dressing
  const bnr = th.banner
  if (id === 'lobby') {
    // check-in counter with three windows along the front wall
    const counterZ = -hz + 3.2
    const wood = woodGrain('#e2b57a', '#b98648', 256, 9, 16)
    const top = new MeshStandardMaterial({ map: tex(wood.color, { repeat: [6, 1] }), roughness: 0.45 })
    b.castDefault = true
    b.span(-12, 0, counterZ - 0.6, 12, 0.95, counterZ + 0.6, M(th.stripe, 0.5), { solid: true })
    b.span(-12.2, 0.95, counterZ - 0.8, 12.2, 1.08, counterZ + 0.8, top)
    for (let i = -1; i <= 1; i++) {
      const x = i * 8
      b.span(x - 3.9, 1.08, counterZ - 0.05, x - 3.7, 4.2, counterZ + 0.05, M('#ffffff', 0.4))
      b.box(0.9, 0.55, 0.12, M('#1f2433', 0.4), x - 1.4, 1.4, counterZ - 0.35)
      b.box(0.3, 0.1, 0.3, M('#1f2433', 0.4), x - 1.4, 1.12, counterZ - 0.35)
      b.cyl(0.16, 0.35, M('#f59ac8', 0.5), x + 1.2, 1.25, counterZ + 0.1, { segments: 14 })
      b.sign(String(i + 2), 1, 1.2, x - 2.6, 5.0, counterZ - 0.4, '+z', { bg: '#1cc1be', color: '#ffffff', radius: 20 })
    }
    b.span(-12.5, 4.2, counterZ - 0.5, 12.5, 4.35, counterZ + 0.3, M('#ffffff', 0.5))
    for (let k = -5; k <= 5; k++) b.box(0.06, 0.8, 0.04, M('#1cb8b5', 0.5), k * 2.2, 0.5, counterZ + 0.62) // front panel grooves
    for (let i = -1; i <= 1; i++) {
      const x = i * 8
      b.box(0.5, 0.04, 0.35, M('#ffffff', 0.8), x + 0.5, 1.1, counterZ + 0.2) // papers
      b.cyl(0.08, 0.06, M('#d9b24a', 0.3, { metalness: 0.7 }), x + 2.4, 1.11, counterZ + 0.35, { segments: 14 }) // bell
      b.sphere(0.07, M('#d9b24a', 0.3, { metalness: 0.7 }), x + 2.4, 1.15, counterZ + 0.35).scale.y = 0.7
      b.cyl(0.06, 0.18, M('#5ec6ff', 0.5), x - 2.6, 1.17, counterZ + 0.2, { segments: 10 }) // pen cup
      b.box(0.6, 0.04, 0.25, M('#2b2f3a', 0.5), x - 1.4, 1.1, counterZ + 0.05) // keyboard
    }
    b.sign(bnr.text, 14, 2.2, 0, 6.1, counterZ - 0.3, '+z', { bg: bnr.bg, color: bnr.color, italic: bnr.italic, radius: 10 })
    b.castDefault = false
    b.sign(th.posters[0][0], 9, 3, hx - 0.05, 5.4, 4, '-x', { bg: th.posters[0][1], color: th.posters[0][2], radius: 16, italic: true })
    b.picture(tex(babyPoster('#f6d23c')), 2.4, 3, -hx + 0.05, 4.8, -6, '+x', { transparent: false })
    b.picture(tex(heartPoster('#a8d4ef', '#e4457a')), 2.4, 2.9, -hx + 0.05, 4.8, -2, '+x', { transparent: false })
  } else {
    b.sign(bnr.text, 22, 2.6, hx - 0.06, 6.3, -1, '-x', { bg: bnr.bg, color: bnr.color, italic: bnr.italic, radius: 12, outline: id === 'ultrasound' ? '#2bd8ff' : null, outlineWidth: 4 })
    th.posters.forEach(([text, bg, fg], i) => {
      const opts = { w: 512, h: 512, bg, color: fg, radius: 26, border: '#ffffffaa', borderWidth: 14 }
      if (th.monitors) b.sign(text, 3.4, 3.4, -hx + 0.06, 5.0, -10 + i * 6, '+x', opts) // the front wall has the screens
      else b.sign(text, 3.4, 3.4, -12 + i * 6, 5.0, -hz + 0.06, '+z', opts)
    })
  }
  if (th.wallText) b.sign(th.wallText, 12, 1.5, 0, 7.5, -hz + 0.06, '+z', { color: '#ffffff', outline: '#7a1fb0', outlineWidth: 12, italic: true })
  if (th.monitors) {
    th.monitors.forEach((text, i) => {
      const x = -12 + i * 6
      b.castDefault = true
      b.box(4.4, 3.2, 0.3, M('#0b1020', 0.4), x, 5.1, -hz + 0.2)
      b.castDefault = false
      const c = cnv(512, 360)
      const ctx = c.getContext('2d')
      ctx.fillStyle = '#060a18'
      ctx.fillRect(0, 0, 512, 360)
      ctx.fillStyle = '#f6d23c'
      ctx.beginPath()
      ctx.arc(256, 130, 62, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#2a1a12'
      ctx.beginPath()
      ctx.arc(232, 120, 8, 0, 7)
      ctx.arc(280, 120, 8, 0, 7)
      ctx.fill()
      ctx.strokeStyle = '#2a1a12'
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.arc(256, 140, 22, 0.2 * Math.PI, 0.8 * Math.PI)
      ctx.stroke()
      ctx.fillStyle = '#7fe9ff'
      ctx.font = '700 58px Fredoka, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(text, 256, 290)
      const t = new CanvasTexture(c)
      t.colorSpace = SRGBColorSpace
      document.fonts?.load?.('700 58px Fredoka').then(() => {
        ctx.fillStyle = '#060a18'
        ctx.fillRect(0, 240, 512, 120)
        ctx.fillStyle = '#7fe9ff'
        ctx.font = '700 58px Fredoka, sans-serif'
        ctx.fillText(text, 256, 290)
        t.needsUpdate = true
      })
      b.picture(t, 4, 2.8, x, 5.1, -hz + 0.37, '+z', { emissive: true, transparent: false })
    })
  }
  if (th.mats) {
    for (let i = 0; i < 6; i++) {
      const z = -12 + i * 2.6
      b.span(12, 0, z - 0.9, 16.5, 0.06, z + 0.9, M(i % 2 ? '#62d1a6' : '#a66be8', 0.9))
      b.castDefault = true
      b.sphere(0.75, M('#b88cf0', 0.35), 15.6, 0.75, z)
      b.castDefault = false
    }
  }
  // chairs along the east wall
  b.castDefault = true
  for (let i = 0; i < 8; i++) {
    const z = -12 + i * 1.3
    if (!th.mats) chair(b, hx - 1.2, z + 12, th.chairs[i % th.chairs.length], -Math.PI / 2)
  }
  topiary(b, -hx + 1.4, hz - 1.6, { color: '#3e8f5a', ring: th.stripe })
  topiary(b, hx - 1.4, -hz + 1.6, { color: '#3e8f5a', ring: th.stripe })
  topiary(b, -hx + 1.4, -hz + 4, { color: '#3e8f5a', ring: th.stripe })
  // fittings: wall clock, water cooler, bins, vents, exit door frame + push bar, skirting caps
  wallClock(b, 6, 6.9, -hz + 0.1, '+z', th.stripe)
  waterCooler(b, -hx + 0.8, 8)
  trashBin(b, -hx + 0.8, 9.6, th.stripe)
  trashBin(b, hx - 0.8, 13.5, th.stripe)
  for (const vx of [-8, 8]) ceilingVent(b, vx, HGT, 13)
  b.span(exitX - 1.75, 0, -hz + 0.02, exitX - 1.6, 4.4, -hz + 0.2, M('#ffffff', 0.5))
  b.span(exitX + 1.6, 0, -hz + 0.02, exitX + 1.75, 4.4, -hz + 0.2, M('#ffffff', 0.5))
  b.box(2.4, 0.12, 0.12, M('#c9ced6', 0.25, { metalness: 0.7 }), exitX, 1.9, -hz + 0.3, { round: 0.04 })
  b.box(0.7, 0.3, 0.04, M('#2ec46b', 0.3, { emissive: '#2ec46b', emissiveIntensity: 0.6 }), exitX, 4.9, -hz + 0.06)
  if (id === 'final') {
    balloonCluster(b, exitX - 2.4, -hz + 1, ['#ffd84a', '#ff8ad0', '#b98bff'], { height: 4.4 })
    balloonCluster(b, exitX + 2.4, -hz + 1, ['#ff8ad0', '#ffd84a', '#ffffff'], { height: 4.6 })
  }
  b.castDefault = false

  const baked = bake(raw)
  baked.traverse((m) => {
    if (m.isMesh) m.receiveShadow = true
  })
  scene.add(baked)
  baked.visible = false

  const toWorld = (p) => new Vector3(o.x + p.x, 0, o.z + p.z)
  // Densify the lane into a polyline (front -> back) with a lead-in to the exit.
  const pts = lane.slice().reverse().map(toWorld)
  const exitFront = toWorld({ x: id === 'lobby' ? 0 : exitX, z: id === 'lobby' ? -hz + 5 : -hz + 1.4 })
  return {
    id,
    group: baked,
    origin: o,
    path: pts, // front -> back
    joinAt: toWorld(startMat),
    spawn: { ...toWorld({ x: 4, z: hz - 6 }), facing: Math.PI },
    frontExit: exitFront,
    exitDoor: toWorld({ x: exitX, z: -hz + 0.6 }),
    // The spots at the head of the line (queue.js; the server hands them out online, backend
    // lines.ts): the lobby's three check-in windows, one station in the other rooms. stand = where the
    // mom waits there, face = toward the staff, staff = the staff key game.js talks to.
    spots:
      id === 'lobby'
        ? [-8, 0, 8].map((x, i) => ({ key: `lobby:${i}`, stand: toWorld({ x, z: -hz + 5 }), face: Math.PI, staff: ['rec1', 'rec2', 'rec3'][i] }))
        : [{ key: `${id}:0`, stand: exitFront, face: Math.PI, staff: null }],
    // From a spot out through the exit door.
    exitRoute: id === 'lobby' ? [toWorld({ x: exitX, z: -hz + 3 }), toWorld({ x: exitX, z: -hz + 0.6 })] : [toWorld({ x: exitX, z: -hz + 0.6 })],
    // where a mom who reaches the front goes before leaving through the exit door
    npcRoute: () =>
      id === 'lobby'
        ? [toWorld({ x: (Math.random() < 0.5 ? -8 : 8) + (Math.random() - 0.5), z: -hz + 5.2 }), toWorld({ x: exitX, z: -hz + 3 }), toWorld({ x: exitX, z: -hz + 0.6 })]
        : [toWorld({ x: exitX + 1.5, z: -hz + 3.5 }), toWorld({ x: exitX, z: -hz + 0.6 })],
    staffSpots: {
      counter: [toWorld({ x: -8, z: -hz + 1.4 }), toWorld({ x: 0, z: -hz + 1.4 }), toWorld({ x: 8, z: -hz + 1.4 })],
      door: toWorld({ x: exitX + 3, z: -hz + 2 }),
      mat: toWorld({ x: 14.2, z: -4 }),
    },
    bounds: { x: o.x, z: o.z, hx, hz },
  }
}

// --- Delivery room -----------------------------------------------------------------------
function buildDeliveryRoom(scene) {
  const o = roomOrigin('delivery')
  const raw = new Group()
  const b = new Builder(raw, o.x, 0, o.z)
  b.castDefault = false
  const hx = 8
  const hz = 7
  const h = 6
  const floorMat = new MeshStandardMaterial({ map: tex(floorTiles('#f7f3f4', '#e1d8dc', 256, 2, 5), { repeat: [5, 5] }), roughness: 0.4 })
  b.span(-hx, -0.3, -hz, hx, 0, hz, floorMat, { solid: true })
  b.span(-hx, h, -hz, hx, h + 0.3, hz, M('#ffffff', 0.9), { solid: true })
  const wall = M('#f6ecee', 0.9)
  b.span(-hx - 0.4, 0, -hz - 0.4, hx + 0.4, h, -hz, wall, { solid: true })
  b.span(-hx - 0.4, 0, hz, hx + 0.4, h, hz + 0.4, wall, { solid: true })
  b.span(-hx - 0.4, 0, -hz, -hx, h, hz, wall, { solid: true })
  b.span(hx, 0, -hz, hx + 0.4, h, hz, wall, { solid: true })
  ceilingLight(b, -2, h, -1, 3, 1)
  ceilingLight(b, 3, h, 2, 3, 1)
  // rug
  b.span(-4.5, 0.005, -6.5, 4.5, 0.035, 3, M('#a9b3cf', 1))
  // hospital bed, head at the back wall
  b.castDefault = true
  const blanket = fabric('#f0a3c4', 128, 4, 50)
  b.span(-2.6, 0, -6.9, 0.6, 2.4, -6.5, M('#34c3b0', 0.5), { round: 0.08 })
  b.span(-2.5, 0, -6.5, 0.5, 0.9, -2.0, M('#ffffff', 0.5), { solid: true })
  b.span(-2.4, 0.9, -6.4, 0.4, 1.25, -2.1, new MeshStandardMaterial({ map: tex(blanket.color, { repeat: [2, 2] }), roughness: 1 }), { round: 0.08 })
  b.span(-2.3, 1.25, -6.3, 0.3, 1.5, -5.4, M('#ffffff', 0.95), { round: 0.12 })
  const chrome = M('#c9ced6', 0.25, { metalness: 0.7 })
  for (const rx of [-2.62, 0.62]) {
    b.span(rx - 0.04, 1.3, -5.5, rx + 0.04, 1.36, -2.6, M('#9ec9f0', 0.4)) // rails
    for (const rz of [-5.3, -4.05, -2.8]) b.box(0.05, 0.4, 0.05, chrome, rx, 1.12, rz)
  }
  b.span(-2.45, 0.0, -6.45, 0.45, 0.25, -2.05, M('#d9dde6', 0.5)) // base
  for (const lx of [-2.3, 0.3]) for (const lz of [-6.3, -2.2]) b.sphere(0.1, M('#2b2f3a', 0.6), lx, 0.1, lz)
  b.box(0.5, 0.3, 0.06, M('#2b2f3a', 0.4), 0.62, 1.05, -3.2) // bed controls
  for (let k = 0; k < 3; k++) b.box(0.08, 0.08, 0.02, M(['#2ec46b', '#ffb020', '#e0245e'][k], 0.3), 0.66, 1.05, -3.35 + k * 0.15)
  b.span(-2.6, 2.4, -6.92, 0.6, 2.5, -6.48, M('#2aa596', 0.5), { round: 0.04 }) // headboard cap
  // heart monitor on a wheeled stand
  b.cyl(0.06, 2.4, chrome, -3.8, 1.2, -5.2, { segments: 10 })
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2
    b.box(0.5, 0.05, 0.06, chrome, -3.8 + Math.cos(a) * 0.22, 0.12, -5.2 + Math.sin(a) * 0.22).rotation.y = -a
    b.sphere(0.06, M('#2b2f3a', 0.6), -3.8 + Math.cos(a) * 0.46, 0.06, -5.2 + Math.sin(a) * 0.46)
  }
  b.box(1.5, 1.1, 0.4, M('#15171c', 0.4), -3.8, 2.6, -5.2, { rotY: 0.6, round: 0.06 })
  b.box(1.0, 0.12, 0.12, M('#2b2f3a', 0.4), -3.8, 2.0, -5.2, { rotY: 0.6 })
  ivStand(b, 1.6, -6.0)
  // cabinet with a sink and supplies on the west wall
  b.span(-hx + 0.05, 0, 0.8, -hx + 0.75, 1.0, 4.2, M('#f4f6fa', 0.5), { solid: true })
  b.span(-hx + 0.03, 1.0, 0.7, -hx + 0.8, 1.08, 4.3, M('#bcd8ee', 0.4))
  for (let k = 0; k < 3; k++) {
    b.box(0.04, 0.85, 1.05, M('#ffffff', 0.5), -hx + 0.77, 0.5, 1.4 + k * 1.15, { round: 0.02 })
    b.box(0.05, 0.25, 0.05, chrome, -hx + 0.8, 0.75, 1.75 + k * 1.15)
  }
  b.box(0.5, 0.06, 0.7, M('#e8eef4', 0.2, { metalness: 0.4 }), -hx + 0.42, 1.06, 3.5)
  b.cyl(0.03, 0.4, chrome, -hx + 0.2, 1.28, 3.5, { segments: 8 })
  b.box(0.25, 0.04, 0.04, chrome, -hx + 0.3, 1.48, 3.5)
  ;['#ff8ab8', '#7fd0ff', '#ffd84a'].forEach((c, k) => b.box(0.22, 0.26, 0.3, M(c, 0.6), -hx + 0.4, 1.21, 1.2 + k * 0.4, { round: 0.03 }))
  wallClock(b, -1, 4.8, -hz + 0.08, '+z', '#34c3b0')
  pottedPlant(b, -5.4, -5.6, { scale: 1.3, pot: '#cd5b36', leaves: '#5ad866' })
  // bassinet
  b.span(3.2, 0.35, -6.6, 7.4, 1.4, -4.6, M('#7ab8e8', 0.5), { solid: true })
  b.span(3.4, 1.0, -6.4, 7.2, 1.25, -4.8, M('#ffc6dd', 0.9))
  b.span(3.1, 1.38, -6.7, 7.5, 1.48, -4.5, M('#9fd0f5', 0.4), { round: 0.04 }) // rim
  for (const lx of [3.4, 7.2]) for (const lz of [-6.4, -4.8]) {
    b.cyl(0.06, 0.35, chrome, lx, 0.18, lz, { segments: 8 })
    b.sphere(0.07, M('#2b2f3a', 0.6), lx, 0.06, lz)
  }
  b.span(3.25, 0.5, -4.58, 7.35, 1.3, -4.54, M('#ffffff', 0.5)) // front panel
  b.picture(tex(sign('♡ BABY', { w: 512, h: 200, color: '#ff6fae' })), 1.6, 0.6, 5.3, 0.9, -4.5, '+z')
  b.castDefault = false
  // posters + window
  b.picture(tex(sign('WHO WILL\nIT BE?', { w: 512, h: 400, bg: '#f6d23c', color: '#1d1d2a', radius: 10 })), 3.4, 2.6, 3.2, 4.0, -hz + 0.06, '+z', { transparent: false })
  b.picture(tex(babyPoster('#f6d23c')), 3, 3.75, -hx + 0.06, 3.6, -1, '+x', { transparent: false })
  b.span(hx - 0.1, 1.4, 0, hx - 0.02, 4.4, 4.5, M('#cfe7ff', 0.1, { transparent: true, opacity: 0.5 }))
  b.span(hx - 0.14, 1.2, -0.2, hx - 0.05, 1.4, 4.7, M('#9cc5ec', 0.5))
  b.span(hx - 0.14, 4.4, -0.2, hx - 0.05, 4.6, 4.7, M('#9cc5ec', 0.5))
  const baked = bake(raw)
  baked.traverse((m) => {
    if (m.isMesh) m.receiveShadow = true
  })
  scene.add(baked)
  baked.visible = false
  // live monitor screen
  const c = cnv(256, 180)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  const screen = new Mesh(new PlaneGeometry(1.25, 0.85), new MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: 1 }))
  screen.position.set(o.x - 3.8 + Math.sin(0.6) * 0.21, 2.6, o.z - 5.2 + Math.cos(0.6) * 0.21)
  screen.rotation.y = 0.6
  scene.add(screen)
  screen.visible = false
  let bpm = 120
  let tt = 0
  const W2 = (p) => new Vector3(o.x + p.x, p.y ?? 0, o.z + p.z)
  return {
    id: 'delivery',
    group: baked,
    extra: [screen],
    origin: o,
    bed: W2({ x: -1.0, y: 1.45, z: -3.75 }), // lying player's feet; head toward -Z
    doctorSpot: W2({ x: 1.9, z: -3.6 }),
    standSpot: W2({ x: -0.5, z: 0.5 }),
    bassinet: W2({ x: 5.3, y: 1.3, z: -5.6 }),
    quizCam: { pos: W2({ x: -1.0, y: 3.4, z: 0.4 }), look: W2({ x: 0.8, y: 1.6, z: -4.4 }) },
    revealCam: { pos: W2({ x: -0.5, y: 1.95, z: 3.4 }), look: W2({ x: -0.5, y: 1.45, z: 0.5 }) },
    setBpm: (v) => (bpm = v),
    update(dt) {
      tt += dt
      const ctx = c.getContext('2d')
      ctx.fillStyle = '#05090b'
      ctx.fillRect(0, 0, 256, 180)
      const pulse = (tt % (60 / bpm)) / (60 / bpm) < 0.2 ? 1.12 : 1
      drawHeart(ctx, 60, 92, 70 * pulse, '#6dffb3', null)
      ctx.fillStyle = '#6dffb3'
      ctx.font = '700 72px Fredoka, sans-serif'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(Math.round(bpm)), 112, 96)
      t.needsUpdate = true
    },
  }
}

export function buildHospitalInterior(scene) {
  const rooms = {}
  for (const id of ['lobby', 'waiting', 'breathing', 'ultrasound', 'final']) rooms[id] = buildQueueRoom(scene, id)
  rooms.delivery = buildDeliveryRoom(scene)
  return rooms
}

export { ultrasoundImage, roundRect }
