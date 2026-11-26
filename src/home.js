// The player's home: one cosy bedroom (pink dotted walls, plank floor, bed with
// a blue blanket, nightstand with a pink rotary phone, crib with a ball mobile,
// potted plant, heart poster, curtained window, dresser with a "MY BABY"
// banner, green rug) inside a pastel house with a gable roof, facing the street.
// Walls and ceiling cast no shadows so the sun still lights the room.
import { CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, PointLight, Shape, TorusGeometry, CatmullRomCurve3, TubeGeometry, Vector3 } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { Builder, M, flat, pottedPlant, bushWithFlowers, mailbox } from './props.js'
import { bake } from './bake.js'
import { dottedWall, fabric, heartPoster, plankFloor, sign, tex, woodGrain } from './paint.js'
import { STREET } from './world.js'

export const ROOM = { x0: -6, x1: 6, z0: -5.5, z1: 5.5, h: 4.6, door: [1, 3.2] }

export function buildHome(scene) {
  const g = new Group()
  scene.add(g)
  const b = new Builder(g)
  const { x0, x1, z0, z1, h } = ROOM
  const T = 0.3

  // --- materials ---
  const wallTex = tex(dottedWall('#ebb3a2', 'rgba(255,255,255,0.25)', 256, 5, 2), { repeat: [3, 1.2] })
  const wallMat = new MeshStandardMaterial({ map: wallTex, roughness: 0.9 })
  const outerMat = M('#f4b9c4', 0.85)
  const floorT = plankFloor('#c4612c', 512, 8, 11)
  const floorMat = new MeshStandardMaterial({ map: tex(floorT.color, { repeat: [2.4, 2.4] }), normalMap: tex(floorT.normal, { srgb: false, repeat: [2.4, 2.4] }), roughness: 0.55 })
  const wood = woodGrain('#a7411b', '#6b200b', 256, 3, 30)
  const woodMat = new MeshStandardMaterial({ map: tex(wood.color, { repeat: [1, 1] }), normalMap: tex(wood.normal, { srgb: false }), roughness: 0.5 })
  const woodLight = woodGrain('#c7742e', '#8a4216', 256, 4, 26)
  const woodMat2 = new MeshStandardMaterial({ map: tex(woodLight.color), normalMap: tex(woodLight.normal, { srgb: false }), roughness: 0.5 })
  const blanket = fabric('#0d5bb0', 256, 21, 80)
  const blanketMat = new MeshStandardMaterial({ map: tex(blanket.color, { repeat: [2, 2] }), normalMap: tex(blanket.normal, { srgb: false, repeat: [2, 2] }), roughness: 0.95 })
  const sheet = fabric('#e9e9ec', 256, 22, 90)
  const sheetMat = new MeshStandardMaterial({ map: tex(sheet.color, { repeat: [2, 2] }), normalMap: tex(sheet.normal, { srgb: false, repeat: [2, 2] }), roughness: 0.95 })

  // --- floor, ceiling ---
  b.span(x0 - T, -0.2, z0 - T, x1 + T, 0.0, z1 + T, floorMat, { solid: true, cast: false })
  b.span(x0 - T, h, z0 - T, x1 + T, h + 0.2, z1 + T, M('#f6e6e2', 0.9), { solid: true, cast: false })

  // --- walls (inner faces dotted pink, outer shell pastel) ---
  const wall = (ax0, az0, ax1, az1, y0 = 0, y1 = h) => {
    b.span(ax0, y0, az0, ax1, y1, az1, wallMat, { solid: true, cast: false })
  }
  wall(x0 - T, z0 - T, x1 + T, z0) // back
  wall(x0 - T, z0, x0, z1) // west
  wall(x1, z0, x1 + T, z1) // east
  const [d0, d1] = ROOM.door
  const win = [-4.2, -1.4]
  wall(x0 - T, z1, win[0], z1 + T)
  wall(win[0], z1, win[1], z1 + T, 0, 1.3)
  wall(win[0], z1, win[1], z1 + T, 3.3, h)
  wall(win[1], z1, d0, z1 + T)
  wall(d0, z1, d1, z1 + T, 3.3, h)
  wall(d1, z1, x1 + T, z1 + T)
  // outer shell (thin skin just outside, so the outside reads as a house)
  const skin = (ax0, az0, ax1, az1, y0 = 0, y1 = h + 0.2) => b.span(ax0, y0, az0, ax1, y1, az1, outerMat, { cast: false })
  skin(x0 - T - 0.02, z0 - T - 0.02, x1 + T + 0.02, z0 - T)
  skin(x0 - T - 0.02, z0 - T, x0 - T, z1 + T)
  skin(x1 + T, z0 - T, x1 + T + 0.02, z1 + T)
  skin(x0 - T, z1 + T, win[0], z1 + T + 0.02)
  skin(win[0], z1 + T, win[1], z1 + T + 0.02, 0, 1.3)
  skin(win[0], z1 + T, win[1], z1 + T + 0.02, 3.3, h + 0.2)
  skin(win[1], z1 + T, d0, z1 + T + 0.02)
  skin(d0, z1 + T, d1, z1 + T + 0.02, 3.3, h + 0.2)
  skin(d1, z1 + T, x1 + T, z1 + T + 0.02)
  // skirting
  const skirt = M('#f8efe9', 0.6)
  b.span(x0, 0, z0, x1, 0.18, z0 + 0.05, skirt, { cast: false })
  b.span(x0, 0, z0, x0 + 0.05, 0.18, z1, skirt, { cast: false })
  b.span(x1 - 0.05, 0, z0, x1, 0.18, z1, skirt, { cast: false })

  // --- roof (gable, ridge along X) ---
  const rs = new Shape()
  rs.moveTo(-(z1 - z0) / 2 - 1.1, 0)
  rs.lineTo((z1 - z0) / 2 + 1.1, 0)
  rs.lineTo(0, 3.4)
  rs.closePath()
  const roofGeo = new ExtrudeGeometry(rs, { depth: x1 - x0 + 2.2, bevelEnabled: false })
  roofGeo.translate(0, 0, -(x1 - x0 + 2.2) / 2)
  roofGeo.rotateY(Math.PI / 2)
  const roof = b.mesh(roofGeo, flat('#e46a92', 0.7), 0, h + 0.2, 0, { cast: false })
  roof.receiveShadow = true

  // --- window with curtains ---
  const wx = (win[0] + win[1]) / 2
  const ww = win[1] - win[0]
  const frame = M('#ffffff', 0.5)
  b.box(ww, 0.12, 0.46, frame, wx, 1.3, z1 + 0.13)
  b.box(ww, 0.12, 0.46, frame, wx, 3.3, z1 + 0.13)
  b.box(0.1, 2, 0.12, frame, wx, 2.3, z1 + 0.15)
  b.box(ww, 0.1, 0.12, frame, wx, 2.3, z1 + 0.15)
  b.box(ww, 2, 0.04, new MeshStandardMaterial({ color: '#bfe4ff', transparent: true, opacity: 0.25, roughness: 0.05 }), wx, 2.3, z1 + 0.15)
  b.cyl(0.05, ww + 1.7, woodMat2, wx, 3.62, z1 - 0.25, { segments: 10 }).rotation.z = Math.PI / 2 // rod
  for (const s of [-1, 1]) {
    b.sphere(0.1, woodMat2, wx + s * (ww / 2 + 0.9), 3.62, z1 - 0.25)
    b.box(0.05, 0.22, 0.05, woodMat2, wx + s * (ww / 2 + 0.75), 3.72, z1 - 0.12)
  }
  for (let k = 0; k < 8; k++) b.mesh(new TorusGeometry(0.07, 0.012, 6, 12), M('#d9b24a', 0.3, { metalness: 0.7 }), wx - ww / 2 - 0.7 + (k % 4) * 0.12 + (k > 3 ? ww + 0.9 : 0), 3.62, z1 - 0.25)
  const curtain = M('#d4234f', 0.9)
  const curtainDark = M('#b01d42', 0.9)
  for (const s of [-1, 1]) {
    // pleated drape: alternating cylinders narrowing toward the tie-back
    for (let k = 0; k < 6; k++) {
      const px = wx + s * (ww / 2 + 0.55 - k * 0.16)
      const pleat = b.cyl(0.11, 2.75, k % 2 ? curtainDark : curtain, px, 2.25, z1 - 0.25 - (k % 2) * 0.05, { segments: 8 })
      pleat.scale.set(1, 1, 0.7)
    }
    b.box(0.15, 0.12, 0.3, M('#ffd84a', 0.5), wx + s * (ww / 2 + 0.32), 1.75, z1 - 0.25, { round: 0.05 }) // tie-back
  }
  // inner sill + little potted cactus on it
  b.box(ww + 0.3, 0.08, 0.35, M('#ffffff', 0.5), wx, 1.33, z1 - 0.12)
  b.cyl(0.12, 0.2, M('#ffb3d9', 0.6), wx + 0.6, 1.47, z1 - 0.12, { segments: 12 })
  b.blob(0.12, flat('#4fbf5a', 0.8), wx + 0.6, 1.68, z1 - 0.12, { sy: 1.6 })

  // --- door (open, swung against the wall inside) ---
  const doorMat = M('#ffffff', 0.5)
  // frames stand proud of the wall on every side (no face shares a plane with the wall)
  b.span(d0 - 0.12, 0, z1 - 0.04, d0 + 0.03, 3.4, z1 + T + 0.06, doorMat, { cast: false })
  b.span(d1 - 0.03, 0, z1 - 0.04, d1 + 0.12, 3.4, z1 + T + 0.06, doorMat, { cast: false })
  b.span(d0 - 0.12, 3.27, z1 - 0.04, d1 + 0.12, 3.47, z1 + T + 0.06, doorMat, { cast: false })
  b.box(0.1, 3.2, 2.1, M('#f3f0ee', 0.5), d1 + 0.1, 1.6, z1 - 1.1, { solid: true })
  for (const py of [0.85, 2.3]) for (const pz of [-0.48, 0.48]) b.box(0.16, py > 1 ? 1.1 : 0.9, 0.75, M('#ffffff', 0.45), d1 + 0.1, py, z1 - 1.1 + pz, { round: 0.03 }) // raised panels
  const brass = M('#d9b24a', 0.3, { metalness: 0.7 })
  for (const sxx of [-1, 1]) {
    b.cyl(0.06, 0.04, brass, d1 + 0.1 + sxx * 0.07, 1.5, z1 - 1.95, { segments: 12 }).rotation.z = Math.PI / 2
    b.box(0.04, 0.05, 0.28, brass, d1 + 0.1 + sxx * 0.1, 1.5, z1 - 1.85, { round: 0.02 })
  }
  for (const hy of [0.4, 2.8]) b.cyl(0.035, 0.22, brass, d1 + 0.12, hy, z1 - 0.05, { segments: 8 })
  // doormat + steps outside
  b.box(2.2, 0.04, 1.2, M('#a7d46f', 1), (d0 + d1) / 2, 0.1, z1 + 1.0, { cast: false })

  // --- bed ---
  const bx = -0.8
  const woodDark = M('#5e1c09', 0.55)
  // headboard: two posts with ball finials, a framed panel with an inset and a capped top rail
  for (const sx of [-1, 1]) {
    b.box(0.22, 2.55, 0.32, woodMat, bx + sx * 1.33, 1.275, z0 + 0.2, { round: 0.04 })
    b.sphere(0.14, woodMat, bx + sx * 1.33, 2.66, z0 + 0.2)
    b.cyl(0.13, 0.06, woodMat, bx + sx * 1.33, 2.53, z0 + 0.2, { segments: 14 })
  }
  b.span(bx - 1.22, 0.55, z0 + 0.1, bx + 1.22, 2.3, z0 + 0.3, woodMat, { solid: true })
  b.span(bx - 1.0, 0.85, z0 + 0.29, bx + 1.0, 2.05, z0 + 0.33, woodDark) // inset panel
  for (let k = 0; k < 5; k++) b.box(0.08, 1.1, 0.04, woodMat, bx - 0.8 + k * 0.4, 1.45, z0 + 0.35) // panel ribs
  b.box(2.75, 0.14, 0.42, woodMat, bx, 2.34, z0 + 0.2, { round: 0.05 }) // top cap
  // frame: side rails, footboard, legs
  b.span(bx - 1.3, 0.15, z0 + 0.35, bx + 1.3, 0.55, z0 + 3.6, woodMat, { solid: true })
  b.span(bx - 1.34, 0.18, z0 + 3.5, bx + 1.34, 0.95, z0 + 3.68, woodMat, { round: 0.03 })
  b.box(2.72, 0.08, 0.22, woodMat, bx, 0.97, z0 + 3.59, { round: 0.03 })
  for (const [lx, lz] of [[-1, 0.45], [1, 0.45], [-1, 3.55], [1, 3.55]]) b.cyl(0.08, 0.2, woodDark, bx + lx * 1.24, 0.1, z0 + lz, { segments: 10 })
  // mattress with piping, sheet, blanket with turned-down sheet band and draped sides
  b.span(bx - 1.25, 0.55, z0 + 0.35, bx + 1.25, 0.95, z0 + 3.5, sheetMat, { round: 0.1 })
  for (const py of [0.6, 0.9]) b.box(2.48, 0.035, 3.12, M('#d6d6dc', 0.8), bx, py, z0 + 1.93, { round: 0.015 })
  const blanketMesh = b.span(bx - 1.32, 0.42, z0 + 1.55, bx + 1.32, 1.04, z0 + 3.62, blanketMat, { round: 0.06 })
  blanketMesh.castShadow = true
  b.span(bx - 1.34, 0.85, z0 + 1.45, bx + 1.34, 1.07, z0 + 1.72, sheetMat, { round: 0.08 }) // turned-down sheet
  b.box(2.66, 0.05, 0.06, M('#7fb2e6', 0.8), bx, 1.06, z0 + 1.7) // stitched hem
  for (let k = 0; k < 3; k++) b.box(2.66, 0.02, 0.04, M('#0b4c94', 0.9), bx, 1.045, z0 + 2.2 + k * 0.45) // quilting lines
  // pillows: a big one and a small pink cushion
  b.box(1.7, 0.36, 0.85, M('#ffffff', 0.95), bx - 0.15, 1.15, z0 + 0.82, { round: 0.17 })
  b.box(0.75, 0.3, 0.5, M('#ffb3d0', 0.95), bx + 0.8, 1.15, z0 + 0.95, { round: 0.14 })
  // teddy bear sitting by the pillow
  const bear = M('#b77a45', 0.95)
  const bearLight = M('#e8c49a', 0.95)
  const tbx = bx + 0.95
  const tbz = z0 + 1.25
  b.sphere(0.22, bear, tbx, 1.22, tbz).scale.set(0.2, 0.24, 0.18)
  b.sphere(0.15, bear, tbx, 1.52, tbz + 0.02)
  for (const sx of [-1, 1]) {
    b.sphere(0.055, bear, tbx + sx * 0.11, 1.64, tbz)
    b.sphere(0.06, bear, tbx + sx * 0.17, 1.24, tbz + 0.06)
    b.sphere(0.07, bear, tbx + sx * 0.1, 1.05, tbz + 0.12)
    b.sphere(0.018, M('#1a1a1a', 0.3), tbx + sx * 0.05, 1.56, tbz + 0.15)
  }
  b.sphere(0.06, bearLight, tbx, 1.48, tbz + 0.13)
  b.sphere(0.02, M('#1a1a1a', 0.3), tbx, 1.5, tbz + 0.18)
  b.mesh(new TorusGeometry(0.1, 0.025, 6, 14), M('#e4467c', 0.6), tbx, 1.38, tbz + 0.02).rotation.x = Math.PI / 2

  // --- nightstand + phone ---
  const nx = 1.45
  b.span(nx - 0.6, 0.12, z0 + 0.08, nx + 0.6, 1.08, z0 + 1.22, woodMat2, { solid: true })
  b.span(nx - 0.68, 1.06, z0 + 0.04, nx + 0.68, 1.15, z0 + 1.3, woodMat2, { round: 0.03 })
  for (const [lx, lz] of [[-1, 0.15], [1, 0.15], [-1, 1.15], [1, 1.15]]) b.box(0.1, 0.14, 0.1, woodMat, nx + lx * 0.52, 0.07, z0 + lz)
  for (const [dy, dh] of [[0.62, 0.36], [0.27, 0.28]]) {
    b.span(nx - 0.5, dy - dh / 2, z0 + 1.22, nx + 0.5, dy + dh / 2, z0 + 1.27, M('#f2a24f', 0.6), { round: 0.02 })
    b.sphere(0.045, M('#d9b24a', 0.3, { metalness: 0.7 }), nx, dy, z0 + 1.3)
  }
  const phone = buildPhone()
  phone.position.set(nx - 0.05, 1.15, z0 + 0.7)
  phone.rotation.y = 0.35
  g.add(phone)

  // --- plant in the corner ---
  pottedPlant(b, 3.4, z0 + 0.9, { scale: 1.35, pot: '#cd5b36', leaves: '#3fc24c' })

  // --- crib + mobile ---
  const cx = -4.3
  const cz = z0 + 2.4
  const cw = 2.0
  const cd = 2.9
  const white = M('#f6f4f6', 0.55)
  b.span(cx - cw / 2 + 0.06, 0.12, cz - cd / 2 + 0.06, cx + cw / 2 - 0.06, 0.45, cz + cd / 2 - 0.06, white, { solid: true })
  b.span(cx - cw / 2 + 0.1, 0.45, cz - cd / 2 + 0.1, cx + cw / 2 - 0.1, 0.62, cz + cd / 2 - 0.1, new MeshStandardMaterial({ map: tex(fabric('#f2a6c4', 128, 7, 60).color, { repeat: [2, 2] }), roughness: 1 }), { round: 0.05 })
  // padded bumper along the inside of the head end
  b.span(cx - cw / 2 + 0.12, 0.62, cz - cd / 2 + 0.1, cx + cw / 2 - 0.12, 0.95, cz - cd / 2 + 0.22, M('#ffd6ea', 0.95), { round: 0.05 })
  const slatGeo = new CylinderGeometry(0.035, 0.035, 0.82, 8)
  for (const s of [-1, 1]) {
    // top and bottom rails, then slats between
    for (const ry of [0.5, 1.32]) {
      b.box(cw, 0.08, 0.1, white, cx, ry, cz + s * cd / 2, { round: 0.03 })
      b.box(0.1, 0.08, cd, white, cx + s * cw / 2, ry, cz, { round: 0.03 })
    }
    for (let k = 1; k < 9; k++) b.mesh(slatGeo, white, cx - cw / 2 + (k * cw) / 9, 0.91, cz + s * cd / 2)
    for (let k = 1; k < 13; k++) b.mesh(slatGeo, white, cx + s * cw / 2, 0.91, cz - cd / 2 + (k * cd) / 13)
  }
  b.solid(cw / 2, 0.7, cd / 2, cx, 0.7, cz)
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    b.box(0.14, 1.45, 0.14, white, cx + lx * (cw / 2), 0.72, cz + lz * (cd / 2), { round: 0.03 })
    b.sphere(0.1, white, cx + lx * (cw / 2), 1.52, cz + lz * (cd / 2))
  }
  // mobile: post, arm, hub; hanging stars, moon and balls on strings (animated group)
  b.cyl(0.04, 1.5, white, cx - cw / 2 + 0.1, 2.05, cz - cd / 2 + 0.3, { segments: 10 })
  b.box(0.7, 0.06, 0.06, white, cx - cw / 2 + 0.42, 2.78, cz - cd / 2 + 0.3, { round: 0.02 })
  const mobile = new Group()
  mobile.position.set(cx - cw / 2 + 0.72, 2.72, cz - cd / 2 + 0.3)
  g.add(mobile)
  const mm = (geo, mat, x, y, z) => {
    const m = new Mesh(geo, mat)
    m.position.set(x, y, z)
    m.castShadow = true
    mobile.add(m)
    return m
  }
  mm(new CylinderGeometry(0.06, 0.12, 0.08, 16), white, 0, 0, 0)
  const stringGeo = new CylinderGeometry(0.006, 0.006, 0.3, 4)
  const starShape = new Shape()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.05 : 0.12
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2
    if (i === 0) starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r)
    else starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  const starGeo = new ExtrudeGeometry(starShape, { depth: 0.04, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1 })
  const moonShape = new Shape()
  moonShape.absarc(0, 0, 0.13, Math.PI * 0.3, Math.PI * 1.7, false)
  moonShape.absarc(0.06, 0, 0.1, Math.PI * 1.55, Math.PI * 0.45, true)
  const moonGeo = new ExtrudeGeometry(moonShape, { depth: 0.04, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 1 })
  const hang = [
    [starGeo, '#f6e04a'], [new RoundedBoxGeometry(0.24, 0.22, 0.24, 2, 0.1), '#ffffff'], [moonGeo, '#ffe7a0'],
    [new RoundedBoxGeometry(0.24, 0.22, 0.24, 2, 0.1), '#ff6fb5'], [starGeo, '#5ec6ff'], [new RoundedBoxGeometry(0.24, 0.22, 0.24, 2, 0.1), '#b98bff'],
  ]
  hang.forEach(([geo, c], i) => {
    const a = (i / hang.length) * Math.PI * 2
    const r = 0.42
    const drop = 0.18 + (i % 2) * 0.12
    mm(stringGeo, M('#ffffff', 0.5), Math.cos(a) * r, -drop / 2 - 0.05, Math.sin(a) * r).scale.y = (drop + 0.1) / 0.3
    mm(new CylinderGeometry(0.012, 0.012, r, 4), white, (Math.cos(a) * r) / 2, 0, (Math.sin(a) * r) / 2).rotation.set(Math.PI / 2, 0, -a + Math.PI / 2)
    const piece = mm(geo, M(c, 0.5), Math.cos(a) * r, -drop - 0.15, Math.sin(a) * r)
    piece.rotation.y = -a
  })
  const cribSlots = [
    { x: cx - 0.3, y: 0.75, z: cz - 0.6 },
    { x: cx + 0.35, y: 0.75, z: cz + 0.4 },
    { x: cx - 0.3, y: 0.75, z: cz + 0.9 },
    { x: cx + 0.35, y: 0.75, z: cz - 0.9 },
  ]

  // --- posters ---
  b.picture(tex(heartPoster('#9ccbe0', '#e4467c', 256)), 2.4, 2.9, bx, 3.6, z0 + 0.02, '+z', { transparent: false })
  b.picture(tex(heartPoster('#b8e6c8', '#ffb84a', 256)), 1.6, 1.9, -4.5, 3.4, z0 + 0.02, '+z', { transparent: false })

  // --- dresser + banner on the east wall ---
  b.span(x1 - 1.05, 0.12, -1.55, x1, 1.45, 1.55, woodMat2, { solid: true })
  b.span(x1 - 1.0, 0, -1.5, x1, 0.12, 1.5, woodMat) // plinth
  b.span(x1 - 1.14, 1.43, -1.66, x1, 1.55, 1.66, woodMat, { round: 0.03 }) // top moulding
  const drawerMat = M('#e9935a', 0.6)
  const pull = M('#d9b24a', 0.3, { metalness: 0.7 })
  for (let row = 0; row < 3; row++) {
    for (const col of [-1, 1]) {
      const dy = 0.36 + row * 0.38
      const dz = col * 0.73
      b.box(0.05, 0.32, 1.38, drawerMat, x1 - 1.07, dy, dz, { round: 0.02 })
      b.box(0.06, 0.05, 0.3, pull, x1 - 1.12, dy, dz, { round: 0.02 })
      for (const pz of [-0.13, 0.13]) b.box(0.05, 0.05, 0.04, pull, x1 - 1.1, dy, dz + pz)
    }
  }
  // table lamp
  b.cyl(0.16, 0.06, M('#ffffff', 0.4), x1 - 0.55, 1.58, 1.05, { segments: 16 })
  b.cyl(0.035, 0.42, pull, x1 - 0.55, 1.82, 1.05, { segments: 8 })
  b.cyl(0.32, 0.34, M('#ffe7f2', 0.8, { emissive: '#ffd9b0', emissiveIntensity: 0.35 }), x1 - 0.55, 2.12, 1.05, { segments: 18, rTop: 0.2 })
  // photo frame with a little heart picture
  b.box(0.06, 0.42, 0.34, M('#ffffff', 0.5), x1 - 0.5, 1.76, 0.35, { round: 0.02 }).rotation.z = 0.12
  b.picture(tex(heartPoster('#ffe0ef', '#e4467c', 128)), 0.26, 0.3, x1 - 0.54, 1.77, 0.35, '-x', { transparent: false }).rotation.x = 0.0
  // stacked alphabet blocks
  const blocks = [['#ff6fb5', -0.3, 1.66, 0], ['#5ec6ff', -0.3, 1.66, -0.32], ['#ffd84a', -0.3, 1.95, -0.16]]
  for (const [c, , y, z] of blocks) b.box(0.28, 0.28, 0.28, M(c, 0.5), x1 - 0.6, y, z - 0.45, { round: 0.04 })
  // plush ball
  b.sphere(0.24, M('#5ec6ff', 0.8), x1 - 0.55, 1.79, -1.15)
  for (const ry of [0, Math.PI / 2]) b.mesh(new TorusGeometry(0.245, 0.03, 6, 24), M('#ffffff', 0.8), x1 - 0.55, 1.79, -1.15).rotation.y = ry
  // toy box beside the crib
  b.box(1.4, 0.7, 0.9, M('#9fd8ff', 0.6), -4.6, 0.35, 2.6, { round: 0.06, solid: true })
  b.box(1.46, 0.12, 0.96, M('#ff8ac2', 0.6), -4.6, 0.75, 2.6, { round: 0.05 })
  b.sphere(0.2, M('#ffd84a', 0.4), -4.2, 0.98, 2.5)
  b.box(0.3, 0.3, 0.3, M('#7fe39e', 0.5), -4.95, 0.95, 2.7, { round: 0.05 })
  // rocking chair by the window
  const rcx = -3.0
  const rcz = 3.8
  const rk = M('#f7efe8', 0.5)
  b.box(1.0, 0.1, 0.9, rk, rcx, 0.75, rcz, { round: 0.04 })
  b.box(1.0, 1.1, 0.1, rk, rcx, 1.3, rcz + 0.42, { round: 0.04 })
  for (let k = 0; k < 4; k++) b.box(0.08, 0.9, 0.06, rk, rcx - 0.36 + k * 0.24, 1.3, rcz + 0.4)
  b.box(0.9, 0.12, 0.8, M('#ffb3d0', 0.95), rcx, 0.84, rcz, { round: 0.05 })
  for (const sx of [-1, 1]) {
    for (const lz of [-0.35, 0.35]) b.box(0.07, 0.7, 0.07, rk, rcx + sx * 0.44, 0.42, rcz + lz)
    b.box(0.08, 0.06, 0.8, rk, rcx + sx * 0.48, 1.12, rcz, { round: 0.02 })
    const rocker = b.mesh(new TorusGeometry(1.3, 0.04, 6, 24, 0.75), rk, rcx + sx * 0.44, 1.38, rcz)
    rocker.rotation.set(0, Math.PI / 2, Math.PI * 1.5 - 0.375)
  }
  b.solid(0.5, 0.75, 0.5, rcx, 0.75, rcz)
  b.picture(tex(sign('👶 MY BABY', { w: 1024, h: 256, bg: '#f582b7', color: '#ffffff', outline: '#c2457f', outlineWidth: 10, radius: 30 })), 3.2, 0.8, x1 - 0.02, 3.2, 0, '-x', { transparent: true })

  // --- rug ---
  b.span(-0.2, 0.005, -1.4, 4.2, 0.035, 3.2, M('#4f9a4b', 1), { cast: false, round: 0.012 })
  b.span(-0.05, 0.01, -1.25, 4.05, 0.045, 3.05, new MeshStandardMaterial({ map: tex(fabric('#6fb06a', 128, 3, 40).color, { repeat: [3, 3] }), roughness: 1 }), { cast: false })

  // --- ceiling lamp, crown moulding, outlet + switch ---
  b.cyl(0.55, 0.3, M('#fff6ea', 0.4, { emissive: '#fff1d6', emissiveIntensity: 0.35 }), 0, h - 0.18, -0.5, { segments: 24, rTop: 0.3, cast: false })
  b.cyl(0.32, 0.05, M('#d9b24a', 0.3, { metalness: 0.7 }), 0, h - 0.02, -0.5, { segments: 18, cast: false })
  const crown = M('#fbf3ef', 0.6)
  b.span(x0, h - 0.16, z0, x1, h, z0 + 0.1, crown, { cast: false })
  b.span(x0, h - 0.16, z0, x0 + 0.1, h, z1, crown, { cast: false })
  b.span(x1 - 0.1, h - 0.16, z0, x1, h, z1, crown, { cast: false })
  b.span(x0, h - 0.16, z1 - 0.1, x1, h, z1, crown, { cast: false })
  b.box(0.06, 0.2, 0.14, M('#ffffff', 0.5), x0 + 0.04, 0.35, -2.5, { cast: false })
  b.box(0.06, 0.24, 0.16, M('#ffffff', 0.5), d0 - 0.25, 1.5, z1 - 0.03, { cast: false }).rotation.y = Math.PI / 2

  // --- outside: path, bushes, mailbox ---
  const outside = new Builder(g)
  const doorX = (d0 + d1) / 2
  outside.box(2, 0.12, STREET.walkN[0] - z1 - T - 0.04, M('#e9e9ef', 0.9), doorX, 0.02, (z1 + T + STREET.walkN[0]) / 2, { cast: false })
  bushWithFlowers(outside, -2.8, z1 + 1.2, { len: 4.5 })
  bushWithFlowers(outside, 5.2, z1 + 1.2, { len: 2.5 })
  mailbox(outside, doorX + 2.2, STREET.walkN[0] - 0.9, '#4aa3ff')

  // merge everything static: ~250 parts -> one mesh per material (+ shadow flag)
  for (const builder of [b, outside]) {
    const baked = bake(builder.group)
    g.remove(builder.group)
    g.add(baked)
  }

  // warm room light (no shadows; the sun does those)
  const lamp = new PointLight('#fff1e0', 22, 16, 1.4)
  lamp.position.set(0, h - 0.6, -0.5)
  g.add(lamp)

  return {
    group: g,
    phone,
    mobile,
    cribSlots,
    bed: { x: bx, y: 1.0, z: z0 + 0.6 }, // head end of the mattress top
    standSpot: { x: bx + 1.9, z: z0 + 4.4, facing: Math.PI * 0.85 },
    doorX,
    update(dt) {
      mobile.rotation.y += dt * 0.6
      phone.userData.update?.(dt)
    },
  }
}

// Pink rotary phone: rounded body, handset on the cradle, white dial with pink
// buttons and a yellow centre, curly cord. userData.ring(on) shakes it.
function buildPhone() {
  const g = new Group()
  const pink = M('#f07fbf', 0.45)
  const pinkDark = M('#e2559f', 0.45)
  const body = new Mesh(new RoundedBoxGeometry(0.62, 0.28, 0.48, 3, 0.12), pink)
  body.position.y = 0.14
  body.castShadow = true
  g.add(body)
  const top = new Mesh(new RoundedBoxGeometry(0.5, 0.12, 0.36, 3, 0.06), pink)
  top.position.set(0, 0.3, -0.02)
  g.add(top)
  const dial = new Mesh(new CylinderGeometry(0.13, 0.13, 0.02, 24), M('#fff4f8', 0.5))
  dial.position.set(0, 0.22, 0.2)
  dial.rotation.x = 1.1
  g.add(dial)
  const center = new Mesh(new CylinderGeometry(0.045, 0.045, 0.03, 16), M('#f6c93a', 0.4))
  center.position.copy(dial.position)
  center.rotation.copy(dial.rotation)
  center.translateY(0.01)
  g.add(center)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const btn = new Mesh(new CylinderGeometry(0.022, 0.022, 0.03, 10), pinkDark)
    btn.position.copy(dial.position)
    btn.rotation.copy(dial.rotation)
    btn.translateX(Math.cos(a) * 0.085)
    btn.translateZ(Math.sin(a) * 0.085)
    btn.translateY(0.01)
    g.add(btn)
  }
  for (const s of [-1, 1]) {
    const prong = new Mesh(new RoundedBoxGeometry(0.06, 0.1, 0.08, 2, 0.02), pinkDark)
    prong.position.set(s * 0.2, 0.39, -0.05)
    g.add(prong)
  }
  const handset = new Group()
  handset.position.set(0, 0.47, -0.05)
  const bar = new Mesh(new RoundedBoxGeometry(0.58, 0.09, 0.11, 2, 0.04), pink)
  handset.add(bar)
  for (const s of [-1, 1]) {
    const end = new Mesh(new RoundedBoxGeometry(0.16, 0.12, 0.2, 2, 0.06), pink)
    end.position.set(s * 0.29, -0.02, 0)
    end.castShadow = true
    handset.add(end)
  }
  g.add(handset)
  // curly cord
  const pts = []
  for (let i = 0; i <= 60; i++) {
    const t = i / 60
    pts.push(new Vector3(-0.32 - t * 0.12 + Math.cos(t * 50) * 0.025, 0.12 - t * 0.05 + Math.sin(t * 50) * 0.025, -0.05 + t * 0.15))
  }
  const cord = new Mesh(new TubeGeometry(new CatmullRomCurve3(pts), 120, 0.01, 5), pinkDark)
  g.add(cord)
  let ringing = false
  let t = 0
  let lifted = 0
  g.userData.ring = (on) => (ringing = on)
  g.userData.lift = (on) => (lifted = on ? 1 : 0)
  let liftT = 0
  g.userData.update = (dt) => {
    t += dt
    liftT += (lifted - liftT) * (1 - Math.exp(-8 * dt))
    const shake = ringing ? Math.sin(t * 60) * 0.06 * (Math.sin(t * 6) > -0.2 ? 1 : 0) : 0
    g.rotation.z = shake * 0.5
    handset.position.y = 0.47 + Math.abs(shake) * 0.3 + liftT * 0.6
    handset.rotation.z = shake * 2 + liftT * 0.4
    handset.visible = liftT < 0.9
  }
  void TorusGeometry
  return g
}
