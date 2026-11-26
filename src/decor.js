// The nursery at home (home.js bedroom, ROOM coords): the Babydex bookshelf (always there; a book per
// baby type found), the play mat where your newest babies rock and coo, and the decorations bought
// in the shop's Nursery tab (DECOR in config.js, coins only). Everything is code-built and animated;
// each piece has its own patch of floor or wall, clear of the furniture (see the spots below), and the
// two big pieces (rocking horse, fish tank) get a collider only while they are owned.
import { CatmullRomCurve3, ConeGeometry, CylinderGeometry, Group, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, PointLight, SphereGeometry, TorusGeometry, TubeGeometry, Vector3 } from 'three'
import { Builder, M } from './props.js'
import { RAPIER, addFixed, removeBody } from './physics.js'
import { BABY_TYPES } from './characters.js'
import { ROOM } from './home.js'

const SPH = new SphereGeometry(1, 18, 12)
const SPH_LO = new SphereGeometry(1, 10, 7)
const CYL = new CylinderGeometry(1, 1, 1, 16)
const mesh = (parent, geo, mat, x, y, z, sx = 1, sy = sx, sz = sx) => {
  const m = new Mesh(geo, mat)
  m.position.set(x, y, z)
  m.scale.set(sx, sy, sz)
  m.castShadow = true
  m.receiveShadow = true
  parent.add(m)
  return m
}

// Floor / wall spots (ROOM: x -6..6, z -5.5..5.5; north wall z0 has the bed, nightstand, plant and
// crib; the east wall the dresser; the south wall the window and the door at x 1..3.2).
export const NURSERY = {
  shelf: { x: ROOM.x0 + 0.26, z: 0.35 }, // west wall, between the crib (z < -1.65) and the toy box (z > 2.15)
  mat: { x: -2.2, z: 0.7, r: 1.0 }, // floor between the bed's foot and the crib
  nightlight: { x: 2.55, z: ROOM.z0 + 0.55 }, // between the nightstand (x < 2.05) and the plant (x 3.4)
  balloons: { x: -3.15, z: -1.5 }, // tied at the crib's front corner
  garland: { x: ROOM.x0 + 0.14, z0: -1.3, z1: 3.4, y: 3.95 }, // high on the west wall
  horse: { x: -4.95, z: 4.45 }, // south-west corner, past the toy box and the rocking chair
  fishtank: { x: ROOM.x1 - 0.5, z: 3.3 }, // east wall, south of the dresser (z < 1.55)
  train: { x: 2.7, z: 1.55, r: 0.85 }, // a loop on the rug (top at y 0.045)
}

export function buildNursery(parent, sound) {
  const g = new Group()
  parent.add(g)
  const anims = []
  const pieces = {}

  // --- Babydex bookshelf: 4 shelves x 8 books, a book appears for each type found ---------------
  const shelf = new Group()
  shelf.position.set(NURSERY.shelf.x, 0, NURSERY.shelf.z)
  g.add(shelf)
  // the Builder's group sits at the shelf spot itself (its offset also places the colliders)
  const sb = new Builder(g, NURSERY.shelf.x, 0, NURSERY.shelf.z)
  const wood = M('#e7b07a', 0.6)
  const woodDark = M('#b97a45', 0.6)
  const W = 1.7 // along z
  const D = 0.46 // along x (out from the wall)
  sb.box(D, 0.08, W, woodDark, 0, 0.04, 0, { solid: true }) // plinth
  for (const sz of [-1, 1]) sb.box(D, 2.1, 0.06, wood, 0, 1.05, (sz * (W - 0.06)) / 2)
  sb.box(0.04, 2.1, W, woodDark, -D / 2 + 0.02, 1.05, 0) // back panel
  sb.box(D + 0.04, 0.07, W + 0.06, wood, 0.02, 2.13, 0, { round: 0.02 }) // top
  sb.solid(D / 2, 1.05, W / 2, 0, 1.05, 0)
  const shelfY = [0.12, 0.62, 1.12, 1.62]
  for (const y of shelfY.slice(1)) sb.box(D - 0.04, 0.04, W - 0.12, wood, 0.01, y - 0.02, 0)
  // an open book on top: blue covers with cream pages, tilted open toward the room
  const sign = new Group()
  sign.position.set(0.02, 2.157, 0) // spine 2 mm above the top board (2.165)
  shelf.add(sign)
  const boxGeo = new CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2, 1, 4, 1)
  boxGeo.rotateY(Math.PI / 4) // a unit box from a 4-sided cylinder
  for (const sz of [-1, 1]) {
    const half = new Group()
    half.rotation.x = -sz * 0.32 // both halves rise from the spine: a V, never into the shelf
    sign.add(half)
    mesh(half, boxGeo, M('#3f7ff0', 0.5), 0, 0.02, sz * 0.13, 0.26, 0.02, 0.26) // cover
    mesh(half, boxGeo, M('#fff6e0', 0.8), 0, 0.045, sz * 0.12, 0.23, 0.03, 0.22) // pages
  }
  const books = []
  const bookTypes = BABY_TYPES.slice(0, 32)
  bookTypes.forEach((t, i) => {
    const row = Math.floor(i / 8)
    const col = i % 8
    const h = 0.3 + ((i * 37) % 7) * 0.015
    const m = mesh(shelf, new CylinderGeometry(1, 1, 1, 4), new MeshStandardMaterial({ color: t.swaddle, roughness: 0.6 }), 0.02, shelfY[row] + h / 2 + 0.005, -W / 2 + 0.16 + col * 0.19, 0.12, h, 0.07)
    m.rotation.y = Math.PI / 4 // square book from a 4-sided cylinder
    m.rotation.z = col % 5 === 3 ? 0.08 : 0
    m.visible = false
    books.push({ m, id: t.id })
  })
  pieces.shelfBooks = books

  // --- play mat with the newest babies rocking on it --------------------------------------------
  const matG = new Group()
  matG.position.set(NURSERY.mat.x, 0, NURSERY.mat.z)
  g.add(matG)
  const petals = ['#ff9ac8', '#9ad8ff', '#ffe27a', '#a8f0b4', '#c9b3ff', '#ffb38a']
  mesh(matG, CYL, M('#fff3f8', 0.95), 0, 0.012, 0, NURSERY.mat.r, 0.024, NURSERY.mat.r)
  petals.forEach((c, i) => {
    const a = (i / petals.length) * Math.PI * 2
    mesh(matG, CYL, M(c, 0.95), Math.cos(a) * 0.62, 0.026, Math.sin(a) * 0.62, 0.3, 0.006, 0.3)
  })
  // a toy arch at the mat's west edge, past the babies' feet (x < -0.55), so no hat or ear reaches it
  const AR = 0.92
  const arch = new Mesh(new TorusGeometry(AR, 0.025, 8, 30, Math.PI), M('#ff9ac8', 0.5))
  arch.position.set(-0.8, 0.03, 0)
  arch.rotation.y = Math.PI / 2
  matG.add(arch)
  const dangles = [-0.45, 0, 0.45].map((z, i) => {
    const d = new Group()
    d.position.set(-0.8, AR * Math.sin(Math.acos(z / AR)) + 0.03, z)
    matG.add(d)
    mesh(d, CYL, M('#ffffff', 0.6), 0, -0.06, 0, 0.006, 0.12, 0.006)
    mesh(d, i === 1 ? SPH : SPH_LO, M(['#ffe27a', '#9ad8ff', '#a8f0b4'][i], 0.5), 0, -0.16, 0, 0.05)
    return d
  })
  anims.push((dt, t) => dangles.forEach((d, i) => (d.rotation.z = Math.sin(t * 1.6 + i * 1.3) * 0.25)))
  let matBabies = []

  // --- decorations (DECOR ids) ---------------------------------------------------------------
  // Star night-light: a crescent moon on a little stand, glowing and slowly pulsing.
  {
    const p = new Group()
    p.position.set(NURSERY.nightlight.x, 0, NURSERY.nightlight.z)
    mesh(p, CYL, M('#ffffff', 0.5), 0, 0.04, 0, 0.18, 0.08, 0.18)
    mesh(p, CYL, M('#d9b24a', 0.3, { metalness: 0.6 }), 0, 0.42, 0, 0.02, 0.7, 0.02)
    const glow = new MeshStandardMaterial({ color: '#fff4c2', emissive: '#ffd86b', emissiveIntensity: 1.2, roughness: 0.4 })
    const moon = new Mesh(new TorusGeometry(0.17, 0.07, 10, 28, Math.PI * 1.25), glow)
    moon.position.set(0, 0.95, 0)
    moon.rotation.z = -0.6
    moon.castShadow = true
    p.add(moon)
    const star = mesh(p, new ConeGeometry(0.05, 0.1, 5), glow, 0.12, 1.12, 0)
    const light = new PointLight('#ffd98a', 2.5, 4, 1.5)
    light.position.set(0, 0.95, 0.2)
    p.add(light)
    anims.push((dt, t) => {
      const k = 0.5 + 0.5 * Math.sin(t * 1.4)
      glow.emissiveIntensity = 0.9 + k * 0.6
      light.intensity = 1.8 + k * 1.4
      moon.rotation.y = Math.sin(t * 0.5) * 0.3
      star.rotation.y = t * 1.2
    })
    pieces.nightlight = { g: p }
  }
  // Balloon bunch tied at the crib corner: three balloons bobbing on their strings.
  {
    const p = new Group()
    p.position.set(NURSERY.balloons.x, 1.45, NURSERY.balloons.z)
    const knot = new Vector3(0, 0, 0)
    const balloons = [
      ['#ff6f9a', -0.22, 1.55, 0.05],
      ['#5aa8ff', 0.18, 1.75, -0.08],
      ['#ffd23a', 0.02, 1.4, 0.2],
    ].map(([c, x, y, z], i) => {
      const b = new Group()
      p.add(b)
      const mat = new MeshPhysicalMaterial({ color: c, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.15 })
      mesh(b, SPH, mat, 0, 0, 0, 0.2, 0.25, 0.2)
      mesh(b, new ConeGeometry(0.035, 0.05, 8), mat, 0, -0.26, 0)
      const string = new Mesh(new TubeGeometry(new CatmullRomCurve3([knot.clone(), new Vector3(x * 0.4, y * 0.5, z * 0.4), new Vector3(x, y - 0.28, z)]), 12, 0.004, 4), M('#ffffff', 0.6))
      p.add(string)
      return { b, x, y, z, i }
    })
    anims.push((dt, t) => {
      for (const o of balloons) {
        o.b.position.set(o.x + Math.sin(t * 0.9 + o.i) * 0.03, o.y + Math.sin(t * 1.3 + o.i * 2) * 0.04, o.z)
        o.b.rotation.z = Math.sin(t * 0.8 + o.i) * 0.12
      }
    })
    pieces.balloons = { g: p }
  }
  // Twinkle garland: a sagging wire along the west wall with bulbs that twinkle in turn.
  {
    const p = new Group()
    const { x, z0, z1, y } = NURSERY.garland
    const pts = []
    for (let i = 0; i <= 3; i++) {
      const za = z0 + ((z1 - z0) * i) / 3
      const zb = z0 + ((z1 - z0) * (i + 0.5)) / 3
      pts.push(new Vector3(x, y, za))
      if (i < 3) pts.push(new Vector3(x, y - 0.32, zb))
    }
    const curve = new CatmullRomCurve3(pts)
    p.add(new Mesh(new TubeGeometry(curve, 80, 0.008, 5), M('#3a7a3a', 0.6)))
    const cols = ['#ff6f9a', '#ffd23a', '#5ad8ff', '#7fe39e', '#c9a0ff']
    const bulbs = []
    for (let i = 0; i < 22; i++) {
      const at = curve.getPoint((i + 0.5) / 22)
      const mat = new MeshStandardMaterial({ color: cols[i % cols.length], emissive: cols[i % cols.length], emissiveIntensity: 1, roughness: 0.3 })
      const bm = mesh(p, SPH_LO, mat, at.x + 0.03, at.y - 0.06, at.z, 0.04, 0.055, 0.04)
      bm.castShadow = false
      bulbs.push(mat)
    }
    anims.push((dt, t) => bulbs.forEach((m, i) => (m.emissiveIntensity = 0.35 + 1.4 * Math.max(0, Math.sin(t * 2.2 - i * 0.7)))))
    pieces.garland = { g: p }
  }
  // Rocking horse: rockers, body, head, mane, saddle; rocks all by itself.
  {
    const p = new Group()
    p.position.set(NURSERY.horse.x, 0, NURSERY.horse.z)
    const rock = new Group()
    p.add(rock)
    const white = M('#fff6ee', 0.5)
    const pink = M('#ff8ac2', 0.5)
    for (const sz of [-1, 1]) {
      const r = new Mesh(new TorusGeometry(1.0, 0.035, 8, 30, 1.2), M('#c46a3a', 0.5))
      r.position.set(0, 1.02, sz * 0.17)
      r.rotation.z = -Math.PI / 2 - 0.6
      r.castShadow = true
      rock.add(r)
    }
    for (const [lx, lz] of [[-0.3, -0.15], [0.3, -0.15], [-0.3, 0.15], [0.3, 0.15]]) {
      const leg = mesh(rock, CYL, white, lx, 0.3, lz, 0.04, 0.34, 0.04)
      leg.rotation.z = lx * 0.35
    }
    mesh(rock, SPH, white, 0, 0.55, 0, 0.42, 0.2, 0.2) // body
    mesh(rock, SPH, pink, -0.02, 0.73, 0, 0.18, 0.05, 0.16) // saddle
    const neck = mesh(rock, CYL, white, 0.36, 0.78, 0, 0.08, 0.32, 0.08)
    neck.rotation.z = -0.6
    mesh(rock, SPH, white, 0.5, 0.95, 0, 0.17, 0.1, 0.1) // head
    for (const sz of [-1, 1]) {
      mesh(rock, SPH_LO, M('#222', 0.3), 0.56, 0.98, sz * 0.085, 0.022)
      mesh(rock, new ConeGeometry(0.03, 0.08, 6), white, 0.44, 1.07, sz * 0.05)
    }
    for (let i = 0; i < 5; i++) mesh(rock, SPH_LO, pink, 0.36 - i * 0.04, 0.95 - i * 0.07, 0, 0.05, 0.05, 0.035) // mane
    const tail = mesh(rock, new ConeGeometry(0.06, 0.28, 8), pink, -0.44, 0.52, 0)
    tail.rotation.z = 2.4
    anims.push((dt, t) => (rock.rotation.z = Math.sin(t * 1.5) * 0.12))
    pieces.horse = { g: p, collider: { hx: 0.5, hy: 0.55, hz: 0.25, x: NURSERY.horse.x, y: 0.55, z: NURSERY.horse.z } }
  }
  // Fish tank on a stand: glass, water, gravel, a plant and three fish swimming laps, rising bubbles.
  {
    const p = new Group()
    p.position.set(NURSERY.fishtank.x, 0, NURSERY.fishtank.z)
    const tb = new Builder(p)
    tb.colliders = false
    tb.box(0.6, 0.86, 1.1, M('#e7b07a', 0.6), 0, 0.43, 0, { round: 0.03 })
    tb.box(0.5, 0.05, 1.0, M('#3a3f55', 0.4), 0, 0.885, 0) // tank base
    const water = new MeshPhysicalMaterial({ color: '#6fd0ff', transparent: true, opacity: 0.32, roughness: 0.05, depthWrite: false })
    const glass = new MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.12, roughness: 0.02, depthWrite: false })
    mesh(p, new CylinderGeometry(1, 1, 1, 4, 1, true), glass, 0, 1.17, 0, 0.36, 0.52, 0.7).rotation.y = Math.PI / 4
    const wbox = new Mesh(new CylinderGeometry(1, 1, 1, 4), water)
    wbox.rotation.y = Math.PI / 4
    wbox.scale.set(0.33, 0.44, 0.66)
    wbox.position.set(0, 1.14, 0)
    p.add(wbox)
    for (let i = 0; i < 14; i++) mesh(p, SPH_LO, M(['#e9d8b0', '#c9b48a', '#ffb3cf'][i % 3], 0.9), (Math.random() - 0.5) * 0.36, 0.93, (Math.random() - 0.5) * 0.86, 0.03)
    for (let i = 0; i < 3; i++) {
      const leaf = mesh(p, new ConeGeometry(0.03, 0.3, 6), M('#3fc24c', 0.6), 0.1 - i * 0.03, 1.05, -0.3 + i * 0.04)
      leaf.rotation.z = (i - 1) * 0.25
    }
    const fish = ['#ff8a2a', '#ffd23a', '#ff5f9a'].map((c, i) => {
      const f = new Group()
      p.add(f)
      mesh(f, SPH, M(c, 0.4), 0, 0, 0, 0.06, 0.04, 0.025)
      const tail = mesh(f, new ConeGeometry(0.035, 0.05, 6), M(c, 0.4), -0.075, 0, 0)
      tail.rotation.z = Math.PI / 2
      mesh(f, SPH_LO, M('#111', 0.3), 0.04, 0.012, 0.018, 0.008)
      return { f, tail, i }
    })
    const bubbles = [0, 1, 2, 3].map((i) => {
      const b = mesh(p, SPH_LO, new MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, roughness: 0.1 }), -0.12, 1, 0.25, 0.015)
      b.castShadow = false
      return { b, ph: i / 4 }
    })
    anims.push((dt, t) => {
      for (const o of fish) {
        const a = t * (0.5 + o.i * 0.15) + o.i * 2.1
        const dir = Math.cos(a) >= 0 ? 1 : -1
        o.f.position.set(Math.sin(a * 1.3) * 0.06, 1.08 + o.i * 0.1 + Math.sin(t * 1.7 + o.i) * 0.03, Math.sin(a) * 0.24)
        o.f.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2
        o.tail.rotation.y = Math.sin(t * 12 + o.i) * 0.5
      }
      for (const o of bubbles) {
        const k = (t * 0.45 + o.ph) % 1
        o.b.position.y = 0.97 + k * 0.38
        o.b.position.x = -0.12 + Math.sin(t * 3 + o.ph * 9) * 0.015
      }
    })
    pieces.fishtank = { g: p, collider: { hx: 0.3, hy: 0.7, hz: 0.55, x: NURSERY.fishtank.x, y: 0.7, z: NURSERY.fishtank.z } }
  }
  // Toy train: a track loop on the rug, an engine and two wagons chugging round, a puff of steam.
  {
    const p = new Group()
    p.position.set(NURSERY.train.x, 0.046, NURSERY.train.z) // just above the rug's top (0.045)
    const R = NURSERY.train.r
    for (const r of [R - 0.05, R + 0.05]) {
      const rail = new Mesh(new TorusGeometry(r, 0.008, 4, 64), M('#9aa4b2', 0.3, { metalness: 0.7 }))
      rail.rotation.x = Math.PI / 2
      rail.position.y = 0.022
      p.add(rail)
    }
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2
      const tie = mesh(p, CYL, M('#8a5a32', 0.8), Math.cos(a) * R, 0.008, Math.sin(a) * R, 0.012, 0.016, 0.09)
      tie.rotation.y = -a
      tie.castShadow = false
    }
    const cars = ['#e0243a', '#2f6fd0', '#2fb85a'].map((c, i) => {
      const car = new Group()
      p.add(car)
      const body = M(c, 0.5)
      if (i === 0) {
        mesh(car, CYL, body, 0.02, 0.09, 0, 0.055, 0.14, 0.055).rotation.z = Math.PI / 2
        mesh(car, CYL, M('#333', 0.4), -0.07, 0.1, 0, 0.05, 0.12, 0.06) // cab
        mesh(car, CYL, M('#333', 0.4), 0.07, 0.16, 0, 0.018, 0.06, 0.018) // chimney
        mesh(car, SPH_LO, M('#ffd23a', 0.3, { emissive: '#ffcc33', emissiveIntensity: 0.6 }), 0.095, 0.09, 0, 0.022)
      } else mesh(car, CYL, body, 0, 0.07, 0, 0.07, 0.07, 0.05)
      for (const wx of [-0.045, 0.045]) for (const wz of [-0.045, 0.045]) mesh(car, CYL, M('#222', 0.4), wx, 0.03, wz, 0.022, 0.012, 0.022).rotation.x = Math.PI / 2
      return car
    })
    const steam = []
    for (let i = 0; i < 6; i++) {
      const s = mesh(p, SPH_LO, new MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, roughness: 1 }), 0, -1, 0, 0.03)
      s.castShadow = false
      steam.push({ s, ph: i / 6 })
    }
    let tootIn = 4
    anims.push((dt, t, near) => {
      const base = t * 0.55
      cars.forEach((car, i) => {
        const a = base - i * 0.24
        car.position.set(Math.cos(a) * R, 0, Math.sin(a) * R)
        car.rotation.y = -a - Math.PI / 2 + Math.PI // facing along the loop
      })
      const eng = cars[0].position
      for (const o of steam) {
        const k = (t * 0.9 + o.ph) % 1
        o.s.position.set(eng.x, 0.2 + k * 0.3, eng.z)
        o.s.scale.setScalar(0.025 + k * 0.05)
        o.s.material.opacity = 0.5 * (1 - k)
      }
      tootIn -= dt
      if (tootIn <= 0) {
        tootIn = 9 + Math.random() * 6
        if (near(NURSERY.train, 7)) sound?.toot?.()
      }
    })
    pieces.train = { g: p }
  }
  for (const k of ['nightlight', 'balloons', 'garland', 'horse', 'fishtank', 'train']) {
    g.add(pieces[k].g)
    pieces[k].g.visible = false
  }

  let owned = new Set()
  let cooT = 0
  return {
    group: g,
    // Shows the decorations owned (DECOR ids); the big ones get their colliders.
    setOwned(ids) {
      owned = new Set(ids)
      for (const k of ['nightlight', 'balloons', 'garland', 'horse', 'fishtank', 'train']) {
        const piece = pieces[k]
        const on = owned.has(k)
        piece.g.visible = on
        if (piece.collider && on && !piece.body) {
          const c = piece.collider
          piece.body = addFixed(RAPIER.ColliderDesc.cuboid(c.hx, c.hy, c.hz), { x: c.x, y: c.y, z: c.z })
        } else if (piece.body && !on) {
          removeBody(piece.body)
          piece.body = null
        }
      }
    },
    // The bookshelf: a book for each baby type in the Babydex (ids found).
    setBooks(foundIds) {
      const f = new Set(foundIds)
      for (const b of books) b.m.visible = f.has(b.id)
    },
    // Up to three babies on the play mat (built with buildBaby by the caller).
    setMatBabies(list) {
      for (const b of matBabies) matG.remove(b)
      matBabies = list.slice(0, 3)
      // side by side along the mat (each ~0.9 m long, 0.55 m wide at its 1.5 scale), the middle one
      // under the toy arch, with room between them so they never touch as they rock
      const zs = [0, 0.64, -0.64]
      matBabies.forEach((b, i) => {
        b.position.set(i ? 0.05 : 0.1, 0.27, zs[i]) // the swaddle's 0.24 m half-height rests on the mat
        b.rotation.set(0, 0, 0)
        b.userData.rockPh = i * 1.9
        if (b.userData.tag) b.userData.tag.visible = false // no name clutter on the floor
        matG.add(b)
      })
    },
    bookshelf: { x: NURSERY.shelf.x + 0.6, z: NURSERY.shelf.z },
    update(dt, t, playerPos) {
      const near = (p, r) => playerPos && Math.hypot(playerPos.x - p.x, playerPos.z - p.z) < r
      for (const fn of anims) fn(dt, t, near)
      // babies on the mat rock from side to side and coo when you come close
      for (const b of matBabies) {
        b.rotation.x = Math.sin(t * 1.8 + b.userData.rockPh) * 0.18
        b.userData.animate?.(t)
      }
      cooT -= dt
      if (matBabies.length && cooT <= 0 && near(NURSERY.mat, 2.4)) {
        cooT = 7 + Math.random() * 5
        sound?.babyCoo?.()
      }
    },
  }
}
