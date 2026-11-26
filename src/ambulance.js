// The ambulance: a boxy white rig facing -X with red/pink stripes, red crosses,
// "AMBULANCE" lettering, a red/blue light bar that flashes (emissive + point
// lights), spinning wheels, swinging rear doors with windows, and a lit
// interior (stretcher, bench, wall rails, heart monitor with a live ECG).
import { CanvasTexture, CylinderGeometry, Group, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, PlaneGeometry, PointLight, SRGBColorSpace } from 'three'
import { Builder, M } from './props.js'
import { bake } from './bake.js'
import { TorusGeometry } from 'three'
import { cnv, drawHeart, signTex } from './paint.js'
import { neon } from './propkit.js'

const L = { rear: 4, front: -4, boxFront: -1.2, floor: 1.0, roof: 4.0, half: 1.5 }

export function createAmbulance(scene) {
  const root = new Group() // world placement (position + yaw)
  const body = new Group() // suspension sway
  root.add(body)
  scene.add(root)
  const b = new Builder(body)
  b.colliders = false
  const white = M('#fbfcff', 0.35)
  const red = M('#e0182d', 0.45)
  const pink = M('#f3a3c4', 0.5)
  const inner = M('#e7eefb', 0.7)
  const dark = M('#2b2f3a', 0.6)
  const glass = new MeshPhysicalMaterial({ color: '#7fb6f2', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.45, depthWrite: false })

  // --- Patient box (shell + inner panels, open at the rear) ---
  const { rear, boxFront, floor, roof, half } = L
  const midX = (rear + boxFront) / 2
  const len = rear - boxFront
  b.span(boxFront, floor - 0.25, -half, rear, floor, half, white) // floor slab
  b.span(boxFront, floor, -half, rear, floor + 0.02, half, M('#9aa6bb', 0.8)) // floor mat
  b.span(boxFront, roof, -half - 0.05, rear, roof + 0.2, half + 0.05, white, { round: 0.1 })
  for (const s of [-1, 1]) {
    b.span(boxFront, floor - 0.25, s > 0 ? half - 0.08 : -half, rear, roof, s > 0 ? half : -half + 0.08, white)
    b.span(boxFront + 0.05, floor, s > 0 ? half - 0.14 : -half + 0.08, rear - 0.02, roof, s > 0 ? half - 0.08 : -half + 0.14, inner, { cast: false })
    // stripes + pink pinstripe outside
    const z = s * (half + 0.005)
    b.span(boxFront, 1.55, z - 0.01, rear, 2.05, z + 0.01, red, { cast: false })
    b.span(boxFront, 2.18, z - 0.01, rear, 2.3, z + 0.01, pink, { cast: false })
    // light-blue rails inside
    b.span(boxFront + 0.1, 2.75, s * (half - 0.2) - 0.04, rear - 0.1, 2.85, s * (half - 0.2) + 0.04, M('#63b8ff', 0.4), { cast: false })
    // big red cross + lettering
    b.box(0.25, 1.1, 0.03, red, midX - 0.6, 3.0, z + s * 0.01, { cast: false })
    b.box(1.1, 0.3, 0.036, red, midX - 0.6, 3.0, z + s * 0.01, { cast: false })
    b.picture(signTex('AMBULANCE', { w: 1024, h: 200, color: '#e0182d', italic: false, weight: 700 }), 2.6, 0.5, midX + 0.5, 3.7, z + s * 0.05, s > 0 ? '+z' : '-z')
  }
  b.span(boxFront - 0.02, floor, -half, boxFront + 0.08, roof, half, white)
  b.span(boxFront + 0.08, floor, -half + 0.1, boxFront + 0.12, roof, half - 0.1, inner, { cast: false })
  // ceiling light strip inside
  b.span(boxFront + 0.5, roof - 0.06, -0.4, rear - 0.5, roof - 0.01, 0.4, M('#ffffff', 0.2, { emissive: '#ffffff', emissiveIntensity: 0.7 }), { cast: false })
  // rear frame + step
  b.span(rear - 0.05, floor - 0.4, -half, rear + 0.3, floor - 0.15, half, dark)
  b.span(rear - 0.05, roof - 0.15, -half, rear + 0.02, roof, half, white)

  // --- Cab ---
  const cabX0 = L.front
  b.span(cabX0 + 0.3, 0.75, -1.4, boxFront, 2.7, 1.4, white, { round: 0.25 })
  b.span(cabX0 + 1.2, 2.5, -1.35, boxFront, 3.4, 1.35, white, { round: 0.2 })
  const ws = b.box(0.1, 0.95, 2.5, glass, cabX0 + 1.18, 2.95, 0)
  ws.rotation.z = -0.25
  for (const s of [-1, 1]) {
    b.box(1.4, 0.8, 0.04, glass, cabX0 + 2.0, 2.95, s * 1.37)
    b.span(cabX0 + 0.3, 1.55, s * 1.405 - 0.01, boxFront, 2.05, s * 1.405 + 0.01, red, { cast: false })
    b.box(0.25, 0.08, 0.3, dark, cabX0 + 1.6, 2.6, s * 1.55) // mirror arm
    b.box(0.1, 0.35, 0.25, dark, cabX0 + 1.6, 2.75, s * 1.7)
    // headlights
    b.box(0.08, 0.35, 0.5, M('#fffbe0', 0.2, { emissive: '#fff6c8', emissiveIntensity: 0.6 }), cabX0 + 0.28, 1.9, s * 0.95)
  }
  b.box(0.35, 0.45, 3.0, dark, cabX0 + 0.25, 1.0, 0, { round: 0.08 }) // bumper
  b.box(0.06, 0.6, 1.2, M('#c9ced8', 0.3, { metalness: 0.7 }), cabX0 + 0.27, 1.75, 0) // grille
  b.span(cabX0 + 1.3, 0.75, -1.38, boxFront, 2.7, 1.38, M('#222833', 0.5), { cast: false }) // cab inner (hidden)

  // --- Exterior detail ---
  const chrome = M('#d5d9e0', 0.25, { metalness: 0.8 })
  const amber = M('#ffb020', 0.3, { emissive: '#ff8a00', emissiveIntensity: 0.4 })
  const tail = M('#e0182d', 0.3, { emissive: '#ff1020', emissiveIntensity: 0.35 })
  for (const s of [-1, 1]) {
    const z = s * (half + 0.012)
    // wheel arches (dark half rings) on the box and the cab
    for (const ax of [-2.6, 2.6]) {
      const arch = b.mesh(new TorusGeometry(0.95, 0.09, 6, 20, Math.PI), dark, ax, 0.78, s * (ax > 0 ? half + 0.02 : 1.42))
      arch.scale.z = 0.6
    }
    // side compartment doors with seams and handles on the lower box
    for (const cxp of [0.2, 1.45]) {
      b.span(cxp - 0.55, 0.62, z - 0.012, cxp + 0.55, 0.66, z + 0.012, dark, { cast: false })
      b.span(cxp - 0.55, 1.45, z - 0.012, cxp + 0.55, 1.49, z + 0.012, dark, { cast: false })
      b.span(cxp - 0.57, 0.62, z - 0.012, cxp - 0.53, 1.49, z + 0.012, dark, { cast: false })
      b.span(cxp + 0.53, 0.62, z - 0.012, cxp + 0.57, 1.49, z + 0.012, dark, { cast: false })
      b.box(0.3, 0.07, 0.06, chrome, cxp, 1.3, z + s * 0.03, { round: 0.02 })
    }
    // small frosted window on the box side
    b.span(2.6, 2.55, z - 0.015, 3.5, 3.25, z + 0.015, M('#cfe3f5', 0.2, { metalness: 0.1 }), { cast: false })
    b.span(2.56, 2.51, z - 0.01, 3.54, 3.29, z + 0.01, M('#9aa6bb', 0.5), { cast: false })
    // marker lights along the roof edge, tail + reverse lights at the back
    for (const mx of [boxFront + 0.6, midX, rear - 0.6]) b.box(0.18, 0.08, 0.05, amber, mx, roof + 0.05, s * (half + 0.03), { cast: false })
    b.box(0.08, 0.5, 0.3, tail, rear + 0.06, 1.85, s * (half - 0.2), { round: 0.03, cast: false })
    b.box(0.08, 0.22, 0.3, M('#ffffff', 0.2, { emissive: '#ffffff', emissiveIntensity: 0.3 }), rear + 0.06, 1.45, s * (half - 0.2), { round: 0.03, cast: false })
    b.box(0.08, 0.2, 0.3, amber, rear + 0.06, 2.2, s * (half - 0.2), { round: 0.03, cast: false })
    // cab door seams, handle, step and fuel cap
    b.span(cabX0 + 1.25, 0.85, s * 1.402 - 0.01, cabX0 + 1.29, 2.6, s * 1.402 + 0.01, dark, { cast: false })
    b.span(boxFront - 0.12, 0.85, s * 1.402 - 0.01, boxFront - 0.08, 2.6, s * 1.402 + 0.01, dark, { cast: false })
    b.box(0.28, 0.06, 0.06, chrome, boxFront - 0.45, 2.25, s * 1.44, { round: 0.02 })
    b.box(0.9, 0.08, 0.32, dark, cabX0 + 1.9, 0.55, s * 1.45, { round: 0.03 })
    if (s < 0) b.cyl(0.12, 0.04, chrome, 1.0, 1.25, z + s * 0.02, { segments: 14 }).rotation.x = Math.PI / 2
    // mirror head (glass face) and turn signal by the headlight
    b.box(0.04, 0.3, 0.2, M('#a9c8ec', 0.05, { metalness: 0.6 }), cabX0 + 1.53, 2.75, s * 1.7)
    b.box(0.08, 0.15, 0.25, amber, cabX0 + 0.28, 1.55, s * 1.05, { round: 0.03, cast: false })
    b.box(0.06, 0.45, 0.62, chrome, cabX0 + 0.26, 1.9, s * 0.95, { round: 0.03 }) // headlight bezel
    // mud flap behind the rear wheel
    b.box(0.06, 0.6, 0.5, dark, 3.55, 0.5, s * 1.32)
  }
  // grille slats, plates, wipers, chassis, exhaust, hitch
  for (let k = 0; k < 5; k++) b.box(0.05, 0.05, 1.15, dark, cabX0 + 0.23, 1.5 + k * 0.12, 0)
  b.box(0.04, 0.3, 0.7, M('#ffffff', 0.5), cabX0 + 0.04, 1.05, 0)
  b.box(0.04, 0.3, 0.7, M('#ffffff', 0.5), rear + 0.33, 0.75, 0)
  b.picture(signTex('MAMA 1', { w: 512, h: 220, color: '#1d2a6a', bg: '#ffffff' }), 0.66, 0.26, cabX0 + 0.01, 1.05, 0, '-x', { transparent: false })
  b.picture(signTex('MAMA 1', { w: 512, h: 220, color: '#1d2a6a', bg: '#ffffff' }), 0.66, 0.26, rear + 0.36, 0.75, 0, '+x', { transparent: false })
  for (const wz of [-0.5, 0.5]) b.box(0.04, 0.04, 0.85, dark, cabX0 + 1.0, 2.55, wz).rotation.x = 0.3
  b.span(-2.0, 0.45, -0.9, 2.0, 0.78, 0.9, dark) // chassis
  b.cyl(0.25, 1.1, chrome, 0.4, 0.55, -1.05, { segments: 14 }).rotation.z = Math.PI / 2 // fuel tank
  b.cyl(0.06, 0.6, chrome, rear - 0.1, 0.42, -1.1, { segments: 8 }).rotation.z = Math.PI / 2 // exhaust
  b.box(0.35, 0.12, 0.12, dark, rear + 0.45, 0.55, 0) // hitch
  for (let k = 0; k < 4; k++) b.box(0.035, 0.03, 2.8, M('#6a7080', 0.6), rear + 0.12, floor - 0.135, 0).position.x = rear + 0.02 + k * 0.07 // step treads
  // roof: AC unit with grille, antenna, scene spotlight
  b.box(1.4, 0.35, 1.2, M('#eef1f6', 0.4), midX + 0.8, roof + 0.37, 0, { round: 0.08 })
  for (let k = 0; k < 6; k++) b.box(1.2, 0.03, 0.05, M('#9aa6bb', 0.5), midX + 0.8, roof + 0.55, -0.45 + k * 0.18)
  b.cyl(0.015, 0.8, dark, boxFront + 0.6, roof + 0.6, 0.9, { segments: 6 })
  b.box(0.3, 0.25, 0.3, chrome, rear - 0.4, roof + 0.32, -1.1, { round: 0.06 })
  b.cyl(0.11, 0.04, M('#fffbe0', 0.2, { emissive: '#fff6c8', emissiveIntensity: 0.4 }), rear - 0.24, roof + 0.32, -1.1, { segments: 14 }).rotation.z = Math.PI / 2

  // --- Light bar ---
  const lb = new Builder(body) // not baked: its lamps swap materials when flashing
  lb.colliders = false
  b.box(1.0, 0.15, 2.2, dark, cabX0 + 2.0, 3.48, 0)
  for (const lz of [-1.0, 1.0]) b.box(0.15, 0.12, 0.15, chrome, cabX0 + 2.0, 3.38, lz)
  const redLight = neon('#ff2030', 4)
  const blueLight = neon('#2a6bff', 6)
  const offRed = M('#7a1018', 0.3)
  const offBlue = M('#152a6a', 0.3)
  const bars = []
  for (let i = 0; i < 4; i++) {
    const isRed = i < 2
    const m = lb.box(0.8, 0.28, 0.48, isRed ? offRed : offBlue, cabX0 + 2.0, 3.68, -0.8 + i * 0.53, { round: 0.06 })
    bars.push({ m, isRed })
  }
  // corner lights on the box
  for (const s of [-1, 1]) {
    for (const x of [boxFront + 0.2, rear - 0.2]) bars.push({ m: lb.box(0.25, 0.25, 0.12, s > 0 ? offRed : offBlue, x, roof - 0.3, s * (half + 0.03)), isRed: s > 0 })
  }
  const lightR = new PointLight('#ff2a3a', 0, 14, 2)
  lightR.position.set(cabX0 + 2.0, 4.2, -1)
  const lightB = new PointLight('#3a6bff', 0, 14, 2)
  lightB.position.set(cabX0 + 2.0, 4.2, 1)
  body.add(lightR, lightB)
  const cabin = new PointLight('#fff4e6', 0, 9, 1.6)
  cabin.position.set(midX, roof - 0.5, 0)
  body.add(cabin)

  // --- Wheels (outside the body group so they stay on the road) ---
  const wheels = []
  const tire = new CylinderGeometry(0.78, 0.78, 0.55, 28)
  tire.rotateX(Math.PI / 2)
  const rim = new CylinderGeometry(0.46, 0.46, 0.58, 24)
  rim.rotateX(Math.PI / 2)
  const hub = new CylinderGeometry(0.17, 0.17, 0.6, 16)
  hub.rotateX(Math.PI / 2)
  const treadGeo = new TorusGeometry(0.74, 0.045, 4, 32)
  for (const x of [-2.6, 2.6]) {
    for (const s of [-1, 1]) {
      const raw = new Group()
      const add = (geo, mat, px = 0, py = 0, pz = 0, rz = 0) => {
        const m = new Mesh(geo, mat)
        m.position.set(px, py, pz)
        m.rotation.z = rz
        m.castShadow = true
        raw.add(m)
        return m
      }
      const rubber = M('#1b1d22', 0.85)
      add(tire, rubber)
      for (const tz of [-0.2, 0, 0.2]) add(treadGeo, M('#111317', 0.9), 0, 0, tz)
      add(new TorusGeometry(0.56, 0.06, 6, 28), M('#2a2d34', 0.7), 0, 0, s * 0.29) // sidewall bead
      add(rim, M('#e8eaf0', 0.3, { metalness: 0.4 }))
      for (let k = 0; k < 5; k++) add(new CylinderGeometry(0.05, 0.05, 0.3, 6).rotateX(0), M('#c9ced8', 0.3, { metalness: 0.6 }), Math.cos((k / 5) * Math.PI * 2) * 0.27, Math.sin((k / 5) * Math.PI * 2) * 0.27, s * 0.3, (k / 5) * Math.PI * 2 + Math.PI / 2)
      add(hub, M('#e0182d', 0.4))
      for (let k = 0; k < 5; k++) add(new CylinderGeometry(0.03, 0.03, 0.64, 6).rotateX(Math.PI / 2), M('#9aa0aa', 0.4), Math.cos((k / 5) * Math.PI * 2 + 0.6) * 0.11, Math.sin((k / 5) * Math.PI * 2 + 0.6) * 0.11, 0)
      const w = bake(raw)
      w.position.set(x, 0.78, s * 1.32)
      root.add(w)
      wheels.push(w)
    }
  }

  // --- Rear doors (hinged at the outer edges) ---
  const doors = []
  for (const s of [-1, 1]) {
    const pivot = new Group()
    pivot.position.set(rear + 0.02, 0, s * half)
    body.add(pivot)
    const db = new Builder(pivot)
    db.colliders = false
    const dz = -s * 0.75 // door centre relative to its hinge
    const z0 = Math.min(0, -s * 1.5)
    const z1 = Math.max(0, -s * 1.5)
    db.span(0, floor, z0, 0.1, 2.75, z1, white)
    db.span(0, 3.6, z0, 0.1, roof, z1, white)
    db.span(0, 2.75, z0, 0.1, 3.6, z0 + 0.25, white)
    db.span(0, 2.75, z1 - 0.25, 0.1, 3.6, z1, white)
    db.box(0.04, 0.85, 1.0, glass, 0.05, 3.17, dz)
    db.span(0.1, 1.55, z0, 0.115, 2.05, z1, red, { cast: false })
    db.span(-0.02, floor, z0 + 0.05, 0, 2.75, z1 - 0.05, inner, { cast: false })
    db.span(-0.02, 3.6, z0 + 0.05, 0, roof - 0.05, z1 - 0.05, inner, { cast: false })
    db.span(-0.02, 2.75, z0 + 0.05, 0, 3.6, z0 + 0.25, inner, { cast: false })
    db.span(-0.02, 2.75, z1 - 0.25, 0, 3.6, z1 - 0.05, inner, { cast: false })
    db.box(0.08, 0.5, 0.12, dark, 0.14, 2.3, -s * 1.3) // handle
    db.span(0.1, 2.71, z0 + 0.21, 0.13, 2.75, z1 - 0.21, dark, { cast: false }) // window trim
    db.span(0.1, 3.6, z0 + 0.21, 0.13, 3.64, z1 - 0.21, dark, { cast: false })
    for (const hy of [1.4, 2.6, 3.6]) db.box(0.12, 0.2, 0.08, M('#9aa0aa', 0.3, { metalness: 0.6 }), 0.08, hy, -s * 0.02)
    db.box(0.06, 0.4, 0.06, M('#63b8ff', 0.4), -0.06, 2.3, -s * 1.1) // inside grab handle
    const bakedDoor = bake(db.group)
    pivot.remove(db.group)
    pivot.add(bakedDoor)
    doors.push({ pivot, s })
  }

  // --- Interior: stretcher, bench, monitor ---
  const ib = new Builder(body)
  ib.colliders = false
  const frame = M('#b9c0cc', 0.35, { metalness: 0.6 })
  // stretcher: X-frame legs on castors, deck, mattress, side rails, straps, pillow
  ib.span(0.0, floor + 0.42, 0.0, 3.4, floor + 0.55, 0.95, frame)
  for (const lx of [0.3, 3.1]) for (const lz of [0.08, 0.87]) {
    ib.cyl(0.04, 0.42, frame, lx, floor + 0.21, lz, { segments: 8 })
    ib.sphere(0.07, M('#2b2f3a', 0.6), lx, floor + 0.06, lz)
  }
  for (const lz of [0.08, 0.87]) ib.box(2.9, 0.05, 0.05, frame, 1.7, floor + 0.3, lz).rotation.z = 0.12
  ib.span(-0.05, floor + 0.55, -0.05, 3.45, floor + 0.78, 1.0, M('#ec8fc0', 0.95), { round: 0.08 })
  ib.span(0.0, floor + 0.78, 0.05, 0.75, floor + 0.95, 0.9, M('#ffffff', 0.9), { round: 0.08 }) // pillow
  for (const rz of [-0.1, 1.05]) {
    ib.box(2.2, 0.05, 0.05, frame, 1.9, floor + 0.98, rz)
    for (const px of [0.9, 2.9]) ib.box(0.05, 0.4, 0.05, frame, px, floor + 0.78, rz)
  }
  for (const sx of [1.4, 2.6]) ib.box(0.14, 0.04, 1.08, M('#1d1d1d', 0.7), sx, floor + 0.8, 0.475)
  // IV pole with a bag and line
  ib.cyl(0.025, 2.2, frame, -0.35, floor + 1.1, 1.05, { segments: 8 })
  ib.box(0.5, 0.03, 0.03, frame, -0.35, floor + 2.18, 1.05)
  ib.box(0.22, 0.35, 0.08, M('#e8f6ff', 0.1, { transparent: true, opacity: 0.75 }), -0.55, floor + 1.95, 1.05, { round: 0.03 })
  ib.cyl(0.008, 1.1, M('#e8f6ff', 0.2), -0.45, floor + 1.25, 0.9, { segments: 4 }).rotation.x = 0.35
  // bench with a backrest cushion and seat belt
  ib.span(0.4, floor, -half + 0.15, 3.6, floor + 0.65, -half + 0.85, M('#1f43b8', 0.9), { round: 0.06 }) // bench
  ib.span(0.5, floor + 0.85, -half + 0.15, 3.5, floor + 1.75, -half + 0.32, M('#2a52c8', 0.9), { round: 0.07 })
  for (const bx2 of [1.2, 2.6]) ib.box(0.08, 0.02, 0.65, M('#1d1d1d', 0.7), bx2, floor + 0.66, -half + 0.5)
  // overhead cabinets with see-through fronts and supplies (right wall, toward the cab)
  ib.span(-0.9, roof - 0.9, half - 0.62, 1.6, roof - 0.12, half - 0.15, M('#f4f6fa', 0.5))
  for (let k = 0; k < 4; k++) ib.box(0.58, 0.66, 0.02, M('#cfe7ff', 0.05, { transparent: true, opacity: 0.35 }), -0.6 + k * 0.62, roof - 0.5, half - 0.63)
  const supplies = ['#ff8ab8', '#7fd0ff', '#ffd84a', '#8be59a', '#ffffff', '#ff6b6b', '#b98bff', '#7fd0ff']
  supplies.forEach((c, k) => ib.box(0.24, 0.26, 0.3, M(c, 0.6), -0.75 + k * 0.3, roof - 0.62, half - 0.4, { round: 0.03 }))
  // oxygen tank strapped by the cab wall
  ib.cyl(0.16, 1.2, M('#2fae5a', 0.4), boxFront + 0.35, floor + 0.62, -half + 0.32, { segments: 16 })
  ib.sphere(0.16, M('#2fae5a', 0.4), boxFront + 0.35, floor + 1.22, -half + 0.32)
  ib.cyl(0.05, 0.16, frame, boxFront + 0.35, floor + 1.42, -half + 0.32, { segments: 10 })
  for (const sy of [0.4, 1.0]) ib.mesh(new TorusGeometry(0.17, 0.02, 4, 18), M('#1d1d1d', 0.6), boxFront + 0.35, floor + sy, -half + 0.32).rotation.x = Math.PI / 2
  // anti-slip floor strips and ceiling grab handles
  for (let k = 0; k < 6; k++) ib.box(4.8, 0.012, 0.05, M('#808aa0', 0.8), midX, floor + 0.026, -1.1 + k * 0.45, { cast: false })
  for (const hx of [0.6, 2.0, 3.3]) ib.mesh(new TorusGeometry(0.12, 0.025, 6, 14, Math.PI), M('#63b8ff', 0.4), hx, roof - 0.05, 0.8).rotation.x = Math.PI
  // monitor on the right wall (+Z), angled toward the stretcher
  const monCanvas = cnv(256, 160)
  const monTex = new CanvasTexture(monCanvas)
  monTex.colorSpace = SRGBColorSpace
  const mon = new Group()
  mon.position.set(2.7, 3.05, half - 0.3)
  mon.rotation.y = Math.PI + 0.85
  body.add(mon)
  const monBox = new Mesh(new CylinderGeometry(1, 1, 1, 4, 1).rotateY(Math.PI / 4), M('#121418', 0.4))
  monBox.scale.set(1.2, 0.85, 0.35)
  mon.add(monBox)
  const screen = new Mesh(new PlaneGeometry(1.45, 0.95), new MeshStandardMaterial({ map: monTex, emissiveMap: monTex, emissive: '#ffffff', emissiveIntensity: 1.1 }))
  screen.position.z = 0.26
  mon.add(screen)

  // merge the static shell and interior (hundreds of parts -> one mesh per material)
  for (const builder of [b, ib]) {
    const baked = bake(builder.group)
    body.remove(builder.group)
    body.add(baked)
  }

  let bpm = 128
  let ecgX = 0
  let beatT = 0
  const ecg = new Float32Array(256)
  function drawMonitor(dt) {
    const ctx = monCanvas.getContext('2d')
    beatT += dt
    const period = 60 / bpm
    const phase = (beatT % period) / period
    // ECG: flat, small P bump, sharp QRS spike, T bump
    let v = 0
    if (phase < 0.06) v = Math.sin((phase / 0.06) * Math.PI) * 0.12
    else if (phase > 0.14 && phase < 0.17) v = -0.15
    else if (phase >= 0.17 && phase < 0.21) v = 1
    else if (phase >= 0.21 && phase < 0.25) v = -0.3
    else if (phase > 0.4 && phase < 0.55) v = Math.sin(((phase - 0.4) / 0.15) * Math.PI) * 0.2
    ecgX = (ecgX + dt * 140) % 256
    ecg[Math.floor(ecgX)] = v
    ctx.fillStyle = '#05090b'
    ctx.fillRect(0, 0, 256, 160)
    ctx.strokeStyle = '#4dff9a'
    ctx.lineWidth = 3
    ctx.beginPath()
    for (let x = 0; x < 256; x++) {
      const y = 128 - ecg[x] * 34
      if (Math.abs(x - ecgX) < 6) {
        ctx.moveTo(x + 1, y)
        continue
      }
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    const pulse = phase < 0.25 ? 1.15 : 1
    drawHeart(ctx, 46, 58, 52 * pulse, '#4dff9a', null)
    ctx.fillStyle = '#4dff9a'
    ctx.font = '700 64px Fredoka, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(Math.round(bpm)), 92, 62)
    monTex.needsUpdate = true
    return phase
  }

  // Exhaust position (local) for smoke puffs.
  const exhaust = { x: rear - 0.3, y: 0.55, z: -1.1 }

  let doorOpen = 1
  let doorTarget = 1
  let sirenOn = false
  let sirenT = 0
  let lastPhase = 0
  const state = {
    root,
    body,
    L,
    wheels,
    exhaust,
    cabinLight: cabin,
    // where things are, in ambulance-local space
    anchors: {
      stretcherFeet: { x: 2.35, y: floor + 0.98, z: 0.48 }, // lying player's feet (head toward -X)
      bench: { x: 1.9, y: floor + 0.65, z: -half + 0.55 },
      rideCam: { x: boxFront + 0.35, y: roof - 0.35, z: 0.25 },
      rideLook: { x: rear + 1.0, y: floor + 1.0, z: 0.05 },
      rearStep: { x: rear + 1.6, z: 0 },
    },
    set bpm(v) {
      bpm = v
    },
    get bpm() {
      return bpm
    },
    setDoors(open, instant = false) {
      doorTarget = open ? 1 : 0
      if (instant) doorOpen = doorTarget
    },
    setSiren(on) {
      sirenOn = on
      if (!on) {
        lightR.intensity = lightB.intensity = 0
        for (const bar of bars) bar.m.material = bar.isRed ? offRed : offBlue
      }
    },
    setInterior(on) {
      cabin.intensity = on ? 2.5 : 0
    },
    // speed m/s along -X (local forward). onBeat() fires on each heartbeat.
    update(dt, speed, onBeat) {
      doorOpen += (doorTarget - doorOpen) * (1 - Math.exp(-6 * dt))
      for (const d of doors) d.pivot.rotation.y = d.s * doorOpen * 1.75
      for (const w of wheels) w.rotation.z += (speed * dt) / 0.78
      const t = performance.now() / 1000
      body.position.y = speed > 0.5 ? Math.sin(t * 9) * 0.015 + Math.sin(t * 3.3) * 0.02 : 0
      body.rotation.x = speed > 0.5 ? Math.sin(t * 2.1) * 0.006 : 0
      if (sirenOn) {
        sirenT += dt
        const flip = Math.floor(sirenT * 5) % 2 === 0
        for (const bar of bars) bar.m.material = bar.isRed ? (flip ? redLight : offRed) : flip ? offBlue : blueLight
        lightR.intensity = flip ? 60 : 0
        lightB.intensity = flip ? 0 : 80
      }
      const phase = drawMonitor(dt)
      if (phase < lastPhase) onBeat?.()
      lastPhase = phase
    },
  }
  state.setDoors(true, true)
  return state
}

