// The game director: one long loop of phases.
//  1. Home: the phone rings (cutscene), walk out to the ambulance, ride it.
//  2. Arrival at the maternity hospital (cutscene), walk to the entrance.
//  3. Lobby check-in line, then the receptionist (baby name, twins offer).
//  4. Waiting-room line + nurse heartbeat check, breathing-class line + the
//     breathing minigame.
//  5. Ultrasound line + scan, final line, delivery room: doctor quiz, labor
//     (push!), the baby reveal + rarity card, heading home.
//  Loop: home nap, phone rings again: "THERE'S ANOTHER ONE?!" -> back to 1.
// Cutscenes are async functions; SKIP makes every wait resolve at once and
// the cutscene's end state is applied.
// Multiplayer: the other real players are moms in the same rooms (remote.js). Online the lines'
// order is the server's (queue.js); Kill / Kill All on a real mom is relayed (net.sendTroll) and her
// own game knocks her out (`G.onTrolled`: death screen, back to the end of the line).
import { Euler, Group, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three'
import { ADS, DEX, DIALOGUE, LINES, MOMS, NAMES, PRICES, QUEUE, REMOTE, REWARDS, RIDE, BREATHING, HOSPITAL_NAME } from './config.js'
import { store } from './store.js'
import { canTroll, claimAdReward, cutLineOnServer, mySession, myTicket, net, onNetChange, rosterOf, sendTroll } from './net.js'
import { deathScreen, hideScreenAd, setDevCharacter, showRewarded, showScreenAd } from './bloxity.js'
import { player, resetPlayer } from './player.js'
import { syncYawToPlayer } from './camera.js'
import { inputState } from './input.js'
import { sound, phoneRing, siren as makeSiren, engine as makeEngine, setAmbience, setMusic } from './audio.js'
import { POSES, OVERLAYS, buildBaby, buildStaff, rollBabyType, RARITIES, BABY_TYPES } from './characters.js'
import { DEX_TOTAL, claimDex, dexFound, dexView, isNewType, pityDue, recordBaby } from './dex.js'
import { affordable, babyCoinMult, canBuy, levelUp, luck, magnetReach, rideSeconds, shieldsPerTrip, upgLevel, upgView, waitBonus, walkMult } from './upgrades.js'
import { attachBelly, breatheBelly, removeBelly } from './avatar/belly.js'
import { makeAnimator } from './avatar/animator.js'
import { Queue } from './queue.js'
import { HOSPITAL } from './hospital.js'
import { ultrasoundImage } from './paint.js'
import { STREET } from './world.js'
import { ROOM } from './home.js'

const deg = (d) => (d * Math.PI) / 180
const lerp = (a, b, t) => a + (b - a) * t
const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t))
class Skip extends Error {}

export function createGame(ctx) {
  const { scene, camera, hud, fx, home, rooms, ambulance, treadmill, npcPool, remote } = ctx
  // --- save (store.js; net.js keeps it on the server for signed-in players) ---
  const save = store.data
  const persist = () => store.save()

  const G = {
    state: 'start',
    cameraMode: 'script', // 'follow' (camera.js) or 'script' (this file)
    puppet: null, // { pos: Vector3, rot: Euler } overrides the physics body for the avatar
    avatarInput: { pose: null, overlay: null },
    queue: null,
    room: null, // active interior room
    rideMult: 1,
    rideLeft: 0,
  }

  // --- coins ---
  let coinsChanged = () => {} // set by the upgrade shop below
  const addCoins = (n, at = null) => {
    save.coins += n
    persist()
    hud.setCoins(save.coins)
    coinsChanged()
    if (n > 0) {
      const p = at ?? { x: 160, y: window.innerHeight - 140 }
      hud.floater(`+${n}`, p.x, p.y)
    }
  }
  // quiet: the caller plays its own purchase sound (upgrades), so two jingles never stack.
  const spend = (n, quiet = false) => {
    if (save.coins < n) {
      sound.error()
      hud.toast(`Need ${n - save.coins} more coins!`, '#ff8a8a')
      return false
    }
    save.coins -= n
    persist()
    hud.setCoins(save.coins)
    coinsChanged()
    if (!quiet) sound.buy()
    return true
  }
  const refreshShop = () => hud.setShopPrices({ twins: PRICES.twins, killAll: PRICES.killAll, skipToEnd: PRICES.skipToEnd, twinsOwned: save.twins })
  hud.setCoins(save.coins, false)
  hud.setBabies(save.delivered)
  refreshShop()
  // A signed-in player's save arrived from the server (or a sign-out brought the guest one back).
  onNetChange((what) => {
    // The same account joined from another tab / device: this one plays alone until you come back to it.
    if (what === 'replaced') return void hud.toast('Playing in another tab! Tap here to play in this one.', '#ffd0d0')
    if (what !== 'progress') return
    hud.setCoins(save.coins, false)
    hud.setBabies(save.delivered)
    refreshShop()
    applyBelly()
    refreshDex()
    applyUpgrades()
    refreshUpg()
  })

  // --- avatar helpers (main.js calls G.onAvatar when the rig swaps) ---
  let avatar = null
  G.onAvatar = (a) => {
    avatar = a
    applyBelly()
  }
  let bellyOn = true
  function applyBelly() {
    if (!avatar) return
    if (bellyOn) attachBelly(avatar, { twins: !!save.twins })
    else removeBelly(avatar)
  }
  const setBelly = (on) => {
    bellyOn = on
    applyBelly()
  }

  // Babies carried in the arms (attached to the player group in front of the chest).
  const carried = []
  let carryText = '' // for the other moms: "type:Name,type:Name"
  function carryBabies(list) {
    for (const b of carried) b.parent?.remove(b)
    carried.length = 0
    carryText = list
      .slice(0, 2)
      .map((b) => `${b.type}${b.shiny ? '*' : ''}:${String(b.name).replace(/[^A-Za-z ]/g, '').slice(0, 20) || 'Baby'}`)
      .join(',')
    list.forEach((info, i) => {
      const baby = buildBaby(info.type, info.name, { shiny: !!info.shiny })
      baby.position.set(-0.08 + i * 0.16, 1.1 + i * 0.16, 0.5)
      baby.rotation.y = 0.15
      ctx.playerGroup.add(baby)
      carried.push(baby)
    })
    G.avatarInput.overlay = list.length ? OVERLAYS.carry : null
  }

  // Babies sleeping in the home crib.
  const cribBabies = []
  function fillCrib() {
    for (const b of cribBabies) scene.remove(b)
    cribBabies.length = 0
    save.babies.slice(-home.cribSlots.length).forEach((info, i) => {
      const s = home.cribSlots[i]
      const baby = buildBaby(info.type, info.name, { shiny: !!info.shiny })
      baby.position.set(s.x, s.y, s.z)
      baby.rotation.y = i % 2 ? Math.PI * 0.5 : -Math.PI * 0.5
      scene.add(baby)
      cribBabies.push(baby)
    })
  }

  // --- staff NPCs ---
  const staff = {}
  function addStaff(key, kind, name) {
    const g = buildStaff(kind, name)
    g.visible = false
    scene.add(g)
    staff[key] = { g, animator: makeAnimator(g.userData.avatar), pose: null, overlay: null }
    return staff[key]
  }
  addStaff('paramedic', 'paramedic', null).pose = POSES.sit
  addStaff('rec1', 'receptionist', null).overlay = POSES.typing
  addStaff('rec2', 'receptionist', 'Receptionist').overlay = POSES.typing
  addStaff('rec3', 'receptionist2', null).overlay = POSES.typing
  addStaff('nurse', 'nurse', 'Nurse')
  addStaff('coach', 'coach', 'Coach')
  addStaff('tech', 'tech', 'Sonographer')
  addStaff('nurse2', 'nurse', 'Nurse')
  addStaff('doctor', 'doctor', 'Dr. Bloom')
  const showStaff = (key, pos, facing, visible = true) => {
    const s = staff[key]
    s.g.visible = visible
    if (pos) s.g.position.set(pos.x, pos.y ?? 0, pos.z)
    if (facing !== undefined) s.g.rotation.y = facing
  }
  const hideAllStaff = () => {
    for (const k in staff) staff[k].g.visible = false
  }

  // --- camera scripting ---
  const cam = {
    from: { p: new Vector3(), l: new Vector3() },
    to: { p: new Vector3(), l: new Vector3() },
    t: 1,
    dur: 1,
    shake: 0,
    attach: null, // fn(dt) -> { p, l } for moving shots
    yawOff: 0,
    pitchOff: 0,
    free: false, // allow look offset (ride)
  }
  const curLook = new Vector3()
  function shot(p, l, dur = 0) {
    cam.attach = null
    if (dur <= 0) {
      cam.from.p.copy(p)
      cam.from.l.copy(l)
      cam.t = cam.dur = 1
    } else {
      cam.from.p.copy(camera.position)
      cam.from.l.copy(curLook)
      cam.t = 0
      cam.dur = dur
    }
    cam.to.p.copy(p)
    cam.to.l.copy(l)
  }
  // A slow push between two framings (Ken Burns style) over `dur`.
  function dolly(p0, l0, p1, l1, dur) {
    cam.attach = null
    cam.from.p.copy(p0)
    cam.from.l.copy(l0)
    cam.to.p.copy(p1)
    cam.to.l.copy(l1)
    cam.t = 0
    cam.dur = dur
  }
  const V = (x, y, z) => new Vector3(x, y, z)
  G.lookTarget = curLook
  G.updateCamera = (dt) => {
    let p
    let l
    if (cam.attach) {
      const a = cam.attach(dt)
      p = a.p
      l = a.l
    } else {
      cam.t = Math.min(cam.dur, cam.t + dt)
      const k = ease(cam.t / cam.dur)
      p = TMP_P.lerpVectors(cam.from.p, cam.to.p, k)
      l = TMP_L.lerpVectors(cam.from.l, cam.to.l, k)
    }
    camera.position.copy(p)
    curLook.copy(l)
    if (cam.free) {
      cam.yawOff = Math.max(-0.9, Math.min(0.9, cam.yawOff - inputState.look.dx * 0.004))
      cam.pitchOff = Math.max(-0.5, Math.min(0.5, cam.pitchOff - inputState.look.dy * 0.004))
      cam.yawOff *= Math.exp(-0.6 * dt)
      cam.pitchOff *= Math.exp(-0.6 * dt)
    }
    inputState.look.dx = inputState.look.dy = 0
    inputState.zoom = 0
    const dir = TMP_D.subVectors(l, p)
    if (cam.free && (cam.yawOff || cam.pitchOff)) {
      dir.applyAxisAngle(UP, cam.yawOff)
      const right = TMP_R.crossVectors(dir, UP).normalize()
      dir.applyAxisAngle(right, cam.pitchOff)
    }
    const target = TMP_T.addVectors(p, dir)
    if (cam.shake > 0) {
      cam.shake = Math.max(0, cam.shake - dt * 1.8)
      const s = cam.shake * 0.08
      target.x += (Math.random() - 0.5) * s
      target.y += (Math.random() - 0.5) * s
    }
    camera.lookAt(target)
  }
  const TMP_P = new Vector3()
  const TMP_L = new Vector3()
  const TMP_D = new Vector3()
  const TMP_R = new Vector3()
  const TMP_T = new Vector3()
  const UP = new Vector3(0, 1, 0)

  // --- cutscene runner ---
  let skipping = false
  let inCutscene = false
  const W = (sec) =>
    new Promise((res, rej) => {
      if (skipping) return rej(new Skip())
      const t0 = performance.now()
      const check = () => {
        if (skipping) return rej(new Skip())
        if (performance.now() - t0 >= sec * 1000) return res()
        requestAnimationFrame(check)
      }
      requestAnimationFrame(check)
    })
  async function cutscene(run, end, { skippable = true } = {}) {
    inCutscene = true
    skipping = false
    G.cameraMode = 'script'
    player.frozen = true
    hud.setGameplay(false)
    hud.cinema(true)
    if (skippable) hud.cutsceneSkip(() => (skipping = true))
    try {
      await run()
    } catch (e) {
      if (!(e instanceof Skip)) console.error(e)
    }
    hud.cutsceneSkip(null)
    skipping = false
    ringer.stop()
    home.phone.userData.ring(false)
    hud.subtitle(null)
    hud.title(null)
    await end?.()
    hud.cinema(false)
    inCutscene = false
  }

  // --- puppet helpers ---
  // Lie the avatar on its back with the feet at `feet`, head pointing along `headDir` yaw.
  function lieAt(feet, headYaw) {
    // character faces +Z; Rx(-90) lays it on its back with the head toward -Z; then yaw.
    G.puppet = { pos: new Vector3(feet.x, feet.y, feet.z), rot: new Euler(-Math.PI / 2, headYaw, 0, 'YXZ') }
    G.avatarInput.pose = POSES.lie
  }
  function standAt(x, z, facing, y = 0) {
    G.puppet = { pos: new Vector3(x, y, z), rot: new Euler(0, facing, 0) }
  }
  function releasePuppet(x, z, facing) {
    G.puppet = null
    G.avatarInput.pose = null
    resetPlayer({ x, y: 0.05, z }, facing)
    syncYawToPlayer()
  }

  // --- loops (audio) ---
  const ringer = phoneRing()
  const siren = makeSiren()
  const engine = makeEngine()

  // --- collectible star coins ---
  const pickups = []
  const coinGeo = (() => {
    const g = new Group()
    return g
  })()
  void coinGeo
  function spawnCoins(points) {
    clearCoins()
    for (const p of points) {
      const c = ctx.makeCoin()
      c.position.set(p.x, 1.0, p.z)
      scene.add(c)
      pickups.push(c)
    }
  }
  function clearCoins() {
    for (const c of pickups) scene.remove(c)
    pickups.length = 0
  }
  let pickupChain = 0
  let chainT = 0
  function updateCoins(dt, t) {
    chainT -= dt
    if (chainT <= 0) pickupChain = 0
    const pp = player.renderPosition
    for (let i = pickups.length - 1; i >= 0; i--) {
      const c = pickups[i]
      c.rotation.y += dt * (c.userData.pulled ? 14 : 3)
      const d = Math.hypot(c.position.x - pp.x, c.position.z - pp.z)
      if (!c.userData.pulled && d < magnetReach(save) && d >= 1.3 && Math.abs(c.position.y - pp.y - 1) < 1.6) {
        c.userData.pulled = true
        sound.magnet()
      }
      if (c.userData.pulled) {
        // Pulled in along a smooth arc: faster the closer it gets, a fading glow trail behind it.
        const k = Math.min(1, dt * (6 + 10 / Math.max(0.4, d)))
        c.position.x += (pp.x - c.position.x) * k
        c.position.z += (pp.z - c.position.z) * k
        c.position.y += (pp.y + 1.1 - c.position.y) * k
        fx.glow.spawn(c.position.x, c.position.y, c.position.z, 0, 0.3, 0, { color: '#ffe27a', size: 0.3, size1: 0, life: 0.35, drag: 1 })
      } else c.position.y = 1.0 + Math.sin(t * 2.5 + i) * 0.12
      if (Math.hypot(c.position.x - pp.x, c.position.z - pp.z) < 1.3 && Math.abs(c.position.y - pp.y - 1) < 1.6) {
        fx.sparkle(c.position, { color: '#ffd84a', count: 18 })
        fx.ring({ x: c.position.x, y: pp.y, z: c.position.z }, '#ffe066', 1.4, 0.4)
        sound.coin(1 + pickupChain * 0.06)
        pickupChain = Math.min(pickupChain + 1, 10)
        chainT = 1.2
        const s = ctx.project(c.position)
        addCoins(REWARDS.pickup, s.visible ? s : null)
        scene.remove(c)
        pickups.splice(i, 1)
      }
    }
  }

  // --- waypoint ---
  let waypoint = null // { pos, label }
  function setWaypoint(pos, label) {
    waypoint = pos ? { pos, label } : null
    if (!pos) {
      hud.removeAnchor('wp')
      ctx.marker.visible = false
    } else {
      ctx.marker.visible = true
      ctx.marker.position.set(pos.x, 0.12, pos.z) // above the highest ground layer (paths at 0.08)
    }
  }
  function updateWaypoint() {
    if (!waypoint) return
    const pp = player.renderPosition
    const d = Math.round(Math.hypot(waypoint.pos.x - pp.x, waypoint.pos.z - pp.z))
    hud.anchor('wp', hud.waypointHTML(`${waypoint.label}&nbsp;&nbsp;${d}m`), 'waypoint')
    const s = ctx.project(V(waypoint.pos.x, (waypoint.pos.y ?? 0) + 3.2, waypoint.pos.z))
    hud.place('wp', s.x, s.y, s.visible)
  }

  // --- trip state ---
  const trip = { name: null, names: [], twinsThisTrip: false }
  const tripLines = (id) => {
    const base = LINES[id]
    const v = save.trips % 3
    return Math.max(6, base + (v === 1 ? -3 : v === 2 ? 2 : 0))
  }

  // ======================================================================================
  // PHASE 1 - HOME
  // ======================================================================================
  async function introFirst() {
    setAmbience('room')
    setMusic('calm')
    const ph = home.phone.position
    const bed = home.bed
    setBelly(true)
    carryBabies([])
    lieAt({ x: bed.x, y: bed.y + 0.24, z: bed.z + 2.05 }, 0)
    await cutscene(
      async () => {
        await hud.fade(0, 700)
        // A: close on the ringing phone
        dolly(V(ph.x - 1.3, ph.y + 0.9, ph.z + 1.4), V(ph.x, ph.y + 0.3, ph.z), V(ph.x - 1.0, ph.y + 0.7, ph.z + 1.1), V(ph.x, ph.y + 0.3, ph.z), 3.4)
        home.phone.userData.ring(true)
        ringer.start()
        hud.subtitle('*RING RING RING*')
        await W(3.2)
        // B: high over the bed, mama answers
        dolly(V(bed.x, 4.2, bed.z + 5.4), V(bed.x, 0.9, bed.z + 1.4), V(bed.x, 4.0, bed.z + 4.7), V(bed.x, 0.9, bed.z + 1.4), 4)
        await W(0.5)
        ringer.stop()
        home.phone.userData.ring(false)
        home.phone.userData.lift(true)
        sound.phonePickup()
        G.avatarInput.pose = POSES.phone
        hud.subtitle("Hello?... The baby's coming? RIGHT NOW?!", { typeSpeed: 38 })
        await W(1.8)
        cam.shake = 0.8
        sound.gasp()
        await W(1.6)
        // C: standing beside the bed, the title
        home.phone.userData.lift(false)
        const s = home.standSpot
        standAt(s.x, s.z, s.facing)
        G.avatarInput.pose = POSES.shock
        dolly(V(s.x - 0.2, 2.3, s.z + 4.6), V(s.x, 1.5, s.z), V(s.x - 0.1, 2.1, s.z + 3.9), V(s.x, 1.5, s.z), 3.6)
        setMusic('tense')
        sound.title()
        hud.title("IT'S BABY TIME!", 'Get to the hospital!')
        fx.sparkle(V(s.x, 2.2, s.z), { count: 40, color: '#ff9fd6', speed: 4 })
        await W(1.2)
        G.avatarInput.pose = null
        await W(2.4)
      },
      async () => {
        await hud.fade(1, 250)
        home.phone.userData.lift(false)
        startWalkToAmbulance()
        await hud.fade(0, 400)
      },
    )
  }

  async function introLoop() {
    setAmbience('room')
    setMusic('calm')
    const bed = home.bed
    const last = save.babies[save.babies.length - 1]
    setBelly(false)
    carryBabies([])
    fillCrib()
    lieAt({ x: bed.x, y: bed.y + 0.24, z: bed.z + 2.05 }, 0)
    const ph = home.phone.position
    const cs = home.cribSlots[0]
    await cutscene(
      async () => {
        await hud.fade(0, 700)
        dolly(V(bed.x + 0.6, 4.2, bed.z + 4.6), V(bed.x, 0.9, bed.z + 1.2), V(bed.x + 0.3, 4.0, bed.z + 4.0), V(bed.x, 0.9, bed.z + 1.2), 3.6)
        hud.subtitle('Home sweet home. Nap time, finally...', { typeSpeed: 34 })
        await W(3.4)
        dolly(V(cs.x + 3.5, 4.1, cs.z + 5.2), V((cs.x + bed.x) / 2, 0.8, bed.z + 1.2), V(cs.x + 3.0, 3.8, cs.z + 4.4), V((cs.x + bed.x) / 2, 0.8, bed.z + 1.2), 3.4)
        hud.subtitle(`Sweet dreams, ${last?.name ?? 'little one'}.`, { typeSpeed: 40 })
        sound.babyCoo()
        await W(3.2)
        hud.subtitle(null)
        dolly(V(ph.x - 1.3, ph.y + 0.9, ph.z + 1.4), V(ph.x, ph.y + 0.3, ph.z), V(ph.x - 1.0, ph.y + 0.7, ph.z + 1.1), V(ph.x, ph.y + 0.3, ph.z), 3)
        home.phone.userData.ring(true)
        ringer.start()
        hud.subtitle('*RING RING RING*')
        await W(2.8)
        dolly(V(bed.x, 4.2, bed.z + 5.4), V(bed.x, 0.9, bed.z + 1.4), V(bed.x, 4.0, bed.z + 4.7), V(bed.x, 0.9, bed.z + 1.4), 5)
        ringer.stop()
        home.phone.userData.ring(false)
        home.phone.userData.lift(true)
        sound.phonePickup()
        G.avatarInput.pose = POSES.phone
        hud.subtitle('Hello? ...The hospital? You missed something on the scan?!', { typeSpeed: 34 })
        await W(2.8)
        setBelly(true)
        sound.pop()
        fx.sparkle(V(bed.x, 1.6, bed.z + 1.2), { count: 40, color: '#ffffff' })
        cam.shake = 1
        sound.gasp()
        hud.subtitle("...THERE'S ANOTHER ONE?!", { shout: true })
        await W(2.2)
        home.phone.userData.lift(false)
        const s = home.standSpot
        standAt(s.x, s.z, s.facing)
        G.avatarInput.pose = POSES.shock
        dolly(V(s.x - 0.2, 2.3, s.z + 4.6), V(s.x, 1.5, s.z), V(s.x - 0.1, 2.1, s.z + 3.9), V(s.x, 1.5, s.z), 3.6)
        setMusic('tense')
        sound.title()
        hud.title(`SURPRISE BABY #${save.delivered + 1}!`, 'Back to the hospital!', { color: 'blue' })
        await W(1.2)
        G.avatarInput.pose = null
        await W(2.4)
      },
      async () => {
        await hud.fade(1, 250)
        home.phone.userData.lift(false)
        setBelly(true)
        startWalkToAmbulance()
        await hud.fade(0, 400)
      },
    )
  }

  const AMB_PARK = { x: (ROOM.door[0] + ROOM.door[1]) / 2 - 6.2, z: STREET.laneZ }
  function placeAmbulance(x, z, yaw = 0) {
    ambulance.root.position.set(x, 0, z)
    ambulance.root.rotation.y = yaw
  }
  const ambRear = () => {
    const r = ambulance.root
    return V(r.position.x + ambulance.L.rear + 1.7, 0, r.position.z)
  }

  let ambDrive = null // { from, to, t, dur }
  function startWalkToAmbulance() {
    G.state = 'walk1'
    trip.name = null
    trip.twinsThisTrip = false
    G.shields = shieldsPerTrip(save)
    const s = home.standSpot
    releasePuppet(s.x, s.z + 0.5, Math.PI * 0.95)
    G.cameraMode = 'follow'
    player.frozen = false
    hud.setGameplay(true)
    hud.showKillAll(true)
    hud.showSkipEnd(true)
    hud.info(null)
    hud.action(null)
    hud.objective('Your ride is here! Climb aboard!', 'ambulance')
    setMusic('home')
    setAmbience('outdoor')
    // ambulance pulls up with its siren on
    placeAmbulance(AMB_PARK.x + 90, AMB_PARK.z)
    ambulance.setDoors(false, true)
    ambulance.setSiren(true)
    ambulance.setInterior(false)
    ambDrive = { from: AMB_PARK.x + 90, to: AMB_PARK.x, t: 0, dur: 5, openAfter: true }
    siren.start()
    engine.start()
    staff.paramedic.g.visible = false
    setWaypoint(ambRear(), 'Ambulance')
    const dx = home.doorX
    spawnCoins([
      { x: 2.5, z: 0 },
      { x: dx, z: 3.5 },
      { x: dx, z: 7.5 },
      { x: dx, z: 10.5 },
      { x: dx + 0.5, z: 13.5 },
      { x: dx - 2.5, z: 13.5 },
      { x: dx - 5, z: 13.5 },
      { x: -4, z: 1.5 },
      { x: dx + 4, z: 13.6 },
    ])
  }

  function updateWalk1(dt) {
    if (ambDrive) {
      ambDrive.t += dt
      const k = Math.min(1, ambDrive.t / ambDrive.dur)
      const e = 1 - Math.pow(1 - k, 3)
      const x = lerp(ambDrive.from, ambDrive.to, e)
      const speed = (ambDrive.from - ambDrive.to) * 3 * Math.pow(1 - k, 2) / ambDrive.dur
      ambulance.root.position.x = x
      ambulance.update(dt, speed)
      const d = ctx.camDistTo(ambulance.root.position)
      siren.set(Math.max(0, 1 - d / 120), 0)
      engine.set(Math.min(1, speed / 15), Math.max(0, 1 - d / 60))
      if (k >= 1) {
        ambDrive = null
        ambulance.setDoors(true)
        sound.door()
        engine.set(0.05, 0.4)
        setWaypoint(ambRear(), 'Ambulance')
      }
    } else {
      ambulance.update(dt, 0)
      const d = ctx.camDistTo(ambulance.root.position)
      siren.set(Math.max(0, 0.6 - d / 140), 0)
    }
    const r = ambRear()
    const pp = player.position
    if (!ambDrive && Math.hypot(pp.x - r.x, pp.z - r.z) < 1.7) startRide()
  }

  // --- ride ---
  async function startRide() {
    G.state = 'ride-start'
    setWaypoint(null)
    player.frozen = true
    sound.whoosh(0.4)
    await hud.fade(1, 300)
    clearCoins()
    sound.doorSlam()
    // move the ambulance onto the treadmill
    const o = treadmill.origin
    placeAmbulance(o.x, o.z)
    ambulance.setDoors(false, true)
    ambulance.setSiren(true)
    ambulance.setInterior(true)
    treadmill.setVisible(true)
    const A = ambulance.anchors
    const r = ambulance.root.position
    lieAt({ x: r.x + A.stretcherFeet.x, y: A.stretcherFeet.y, z: r.z + A.stretcherFeet.z }, Math.PI / 2)
    const pm = staff.paramedic
    showStaff('paramedic', { x: r.x + A.bench.x, y: 0.73, z: r.z + A.bench.z }, 0)
    pm.pose = POSES.sit
    G.cameraMode = 'script'
    cam.free = true
    cam.attach = () => ({ p: TMP_P.set(r.x + A.rideCam.x, A.rideCam.y + ambulance.body.position.y, r.z + A.rideCam.z), l: TMP_L.set(r.x + A.rideLook.x, A.rideLook.y, r.z + A.rideLook.z) })
    G.rideLeft = rideSeconds(save)
    G.rideMult = 1
    rideIncome = 0
    const turbo = upgLevel(save, 'ambulance')
    if (turbo) {
      setTimeout(() => {
        sound.turbo(turbo)
        hud.toast(`🚑 Turbo Ambulance: ${rideSeconds(save)}s ride!`, '#a8f0ff')
      }, 700)
    }
    hud.setGameplay(true)
    hud.objective('Tip: Speed Up makes the ambulance drive 2x faster!', null, true)
    updateSpeedButton()
    setMusic('ride')
    setAmbience('none')
    siren.start()
    engine.start()
    G.state = 'ride'
    await hud.fade(0, 500)
  }
  let rideIncome = 0
  let turboStreakT = 0
  function updateSpeedButton() {
    if (G.rideMult >= 4) hud.action('MAX SPEED', null, () => sound.error(), { disabled: true })
    else hud.action('Speed Up', PRICES.speedUp * G.rideMult, buySpeedUp)
  }
  function buySpeedUp() {
    if (G.state !== 'ride' || G.rideMult >= 4) return
    if (!spend(PRICES.speedUp * G.rideMult)) return
    G.rideMult *= 2
    sound.speedUp()
    cam.shake = 0.6
    hud.toast(`${G.rideMult}x SPEED!`, '#a8f0ff')
    const fwd = V(-1, 0, 0)
    fx.streaks(V(camera.position.x + 6, camera.position.y - 1, camera.position.z), fwd, 30)
    updateSpeedButton()
  }
  function updateRide(dt) {
    const speed = RIDE.speed * G.rideMult
    G.rideLeft -= dt * G.rideMult
    treadmill.scroll(speed * dt)
    ambulance.update(dt, speed, () => sound.beep(1050))
    ambulance.bpm = 126 + Math.sin(performance.now() / 1300) * 4
    siren.set(0.55, 0.75)
    engine.set(Math.min(1, speed / 30), 0.8)
    // exhaust + road dust behind the truck (visible through the rear windows)
    const r = ambulance.root.position
    rideIncome += dt
    if (rideIncome >= RIDE.incomeEvery) {
      rideIncome = 0
      // the notes rise just in front of the ride camera, over you on the stretcher
      const at = camera.getWorldDirection(V(0, 0, 0)).multiplyScalar(1.8).add(camera.position)
      at.y -= 0.35
      if (!waitIncome(REWARDS.rideTick, at)) sound.coin(1.2)
    }
    // Turbo Ambulance: blue sparks streaming off the exhaust, more with each level.
    const turbo = upgLevel(save, 'ambulance')
    if (turbo && Math.random() < dt * 6 * turbo) {
      const ex = ambulance.exhaust
      fx.glow.spawn(r.x + ex.x + 0.3, ex.y + 0.1, r.z + ex.z, speed * 0.25 + Math.random() * 2, 0.3 + Math.random() * 0.8, (Math.random() - 0.5) * 0.8, { color: Math.random() < 0.5 ? '#3fb8ff' : '#9fe8ff', size: 0.5, size1: 0.05, life: 0.6, drag: 1.6 })
    }
    // ...and every so often a few speed streaks rush past the rear windows
    turboStreakT -= dt
    if (turbo && turboStreakT <= 0) {
      turboStreakT = 2.4 - turbo * 0.3
      fx.streaks(V(camera.position.x + 6, camera.position.y - 1, camera.position.z), V(-1, 0, 0), 3 + turbo * 2)
    }
    if (Math.random() < dt * 8) fx.smoke(V(r.x + ambulance.exhaust.x + 0.5, ambulance.exhaust.y, r.z + ambulance.exhaust.z), V(speed * 0.35, 0.2, 0), { alpha: 0.25 })
    if (Math.random() < dt * 4 * G.rideMult) fx.dust(V(r.x + 5.5, 0.1, r.z + (Math.random() - 0.5) * 2.5), { count: 2, color: '#9a9aa6', size: 0.5, speed: 2 })
    hud.info(`Arriving in ${hud.fmt(G.rideLeft)}`, 'Hang on tight, mama!')
    if (G.rideLeft <= 0) arriveHospital()
  }

  // ======================================================================================
  // PHASE 2 - ARRIVAL
  // ======================================================================================
  async function arriveHospital() {
    G.state = 'arrive'
    cam.free = false
    hud.action(null)
    hud.info(null)
    hud.objective(null)
    clearCoins()
    setWaypoint(null)
    endQueue()
    hideRooms()
    hideAllStaff()
    const stop = HOSPITAL.ambulanceStop
    const H = HOSPITAL.x
    await cutscene(
      async () => {
        await hud.fade(1, 400)
        treadmill.setVisible(false)
        ambulance.setInterior(false)
        ambulance.setSiren(true)
        ambulance.setDoors(false, true)
        G.puppet = { pos: V(0, -50, 0), rot: new Euler() } // hidden inside the truck
        placeAmbulance(stop.x + 70, stop.z)
        setMusic('hospital')
        setAmbience('outdoor')
        let t = 0
        cam.attach = (dt) => {
          t += dt
          const k = Math.min(1, t / 6.5)
          const x = lerp(stop.x + 70, stop.x, 1 - Math.pow(1 - k, 2.4))
          const sp = k < 1 ? (70 * 2.4 * Math.pow(1 - k, 1.4)) / 6.5 : 0
          ambulance.root.position.x = x
          ambulance.update(dt, sp)
          siren.set(0.5, 0)
          engine.set(Math.min(1, sp / 15), 0.6)
          return { p: TMP_P.set(H + 34 - t * 1.2, 12 - t * 0.6, 58 - t * 1.5), l: TMP_L.set(H + 4 - t * 0.5, 2.5, -6) }
        }
        await hud.fade(0, 600)
        hud.subtitle(`${HOSPITAL_NAME}... we made it!`, { typeSpeed: 36 })
        await W(6.6)
        hud.subtitle(null)
        // doors open, mama climbs out
        ambulance.setDoors(true)
        sound.door()
        siren.stop()
        ambulance.setSiren(false)
        const rr = ambRear()
        standAt(rr.x + 0.4, rr.z - 0.3, Math.PI * 1.25)
        shot(V(rr.x + 3.2, 2.3, rr.z + 4.6), V(rr.x - 9, 2.2, rr.z - 15), 0)
        hud.subtitle('Time to check in!', { typeSpeed: 40 })
        await W(2.6)
      },
      async () => {
        await hud.fade(1, 250)
        cam.attach = null
        ambulance.root.position.x = stop.x
        ambulance.setDoors(true, true)
        ambulance.setSiren(false)
        siren.stop()
        engine.stop()
        startWalkToEntrance()
        await hud.fade(0, 400)
      },
    )
  }

  function startWalkToEntrance() {
    G.state = 'walk2'
    const rr = ambRear()
    releasePuppet(rr.x + 0.4, rr.z - 1.2, Math.PI * 1.25)
    G.cameraMode = 'follow'
    player.frozen = false
    hud.setGameplay(true)
    hud.showSkipEnd(true)
    hud.objective('Head inside and get in line!', 'hospital')
    setWaypoint(V(HOSPITAL.entrance.x, 0, HOSPITAL.entrance.z + 1.2), 'Check-in')
    const H = HOSPITAL.x
    spawnCoins([
      { x: rr.x - 3, z: 13.5 },
      { x: H + 4, z: 13.5 },
      { x: H, z: 10 },
      { x: H, z: 6 },
      { x: H, z: 2.5 },
    ])
  }
  function updateWalk2(dt) {
    ambulance.update(dt, 0)
    const e = HOSPITAL.entrance
    const pp = player.position
    if (Math.abs(pp.x - e.x) < 2.6 && pp.z < e.z + 1.0 && pp.z > e.z - 3) enterRoom('lobby')
  }

  // ======================================================================================
  // PHASES 3-5 - QUEUE ROOMS
  // ======================================================================================
  const ROOM_FLOW = {
    lobby: { objective: ['Get in line for check-in!', 'hospital'], wait: ['Head inside and get in line!', 'hospital'], label: 'Line', music: 'hospital' },
    waiting: { objective: ['Wait for your heartbeat check!', 'heart'], label: 'Line', music: 'hospital' },
    breathing: { objective: ['Wait for breathing practice!', 'breath'], label: 'Line', music: 'calm' },
    ultrasound: { objective: ['Wait for your ultrasound scan!', 'scan'], label: 'Line', music: 'hospital' },
    final: { objective: ['FINAL LINE! Next stop: your delivery room!', 'flag'], label: 'Line', music: 'tense' },
  }
  function hideRooms() {
    for (const id in rooms) {
      rooms[id].group.visible = false
      for (const e of rooms[id].extra ?? []) e.visible = false
    }
    G.room = null
  }
  async function enterRoom(id, { fadeIn = true } = {}) {
    G.state = 'transition'
    player.frozen = true
    setWaypoint(null)
    sound.door()
    if (fadeIn) await hud.fade(1, 350)
    clearCoins()
    endQueue()
    hideRooms()
    hideAllStaff()
    const room = rooms[id]
    room.group.visible = true
    G.room = room
    setAmbience('indoor')
    setMusic(ROOM_FLOW[id].music)
    releasePuppet(room.spawn.x, room.spawn.z, room.spawn.facing)
    G.cameraMode = 'follow'
    player.frozen = false
    player.autoTarget = null
    hud.setGameplay(true)
    hud.showSkipEnd(true)
    hud.info(null)
    hud.action(null)
    hud.objective(...ROOM_FLOW[id].objective)
    // staff per room
    const sp = room.staffSpots
    if (id === 'lobby') {
      showStaff('rec1', sp.counter[0], 0)
      showStaff('rec2', sp.counter[1], 0)
      showStaff('rec3', sp.counter[2], 0)
    } else if (id === 'waiting') showStaff('nurse', sp.door, 0)
    else if (id === 'breathing') {
      showStaff('coach', { x: sp.mat.x, z: sp.mat.z }, -Math.PI / 2)
    } else if (id === 'ultrasound') showStaff('tech', sp.door, 0)
    else if (id === 'final') showStaff('nurse2', sp.door, 0)
    // Real moms only (MOMS.bots off): no bot moms; with bots on they fill in while real ones are few.
    const bots = Math.round(tripLines(id) * (remote?.botShare() ?? (MOMS.bots ? 1 : 0)))
    G.queue = new Queue(room, npcPool, bots, {
      player,
      fx,
      sound,
      hud,
      remote,
      onPlayerTurn: (spot, route) => playerTurn(id, spot, route),
      onLeft: () => {
        hud.toast('You left the line', '#ffffff')
        setWaypoint(room.joinAt, 'Line')
      },
    })
    G.queue.roomId = id
    setWaypoint(room.joinAt, 'Line')
    G.state = 'queue'
    queueIncome = 0
    if (fadeIn) await hud.fade(0, 400)
  }
  function endQueue() {
    if (G.queue) {
      G.queue.release()
      G.queue = null
    }
    player.autoTarget = null
    hud.removeAnchor('kill')
  }
  let queueIncome = 0
  function updateQueue(dt) {
    const q = G.queue
    if (!q) return
    const pp = player.position
    if (!q.playerIn) {
      // Walk onto the LINE STARTS HERE mat: you're walked along the lanes to your place.
      if (Math.hypot(pp.x - q.room.joinAt.x, pp.z - q.room.joinAt.z) < QUEUE.joinRadius) {
        q.join()
        sound.success()
        fx.ring(V(pp.x, 0, pp.z), '#ffffff', 2, 0.5)
        setWaypoint(null)
        hud.toast('You joined the line!', '#ffffff')
      }
    }
    q.update(dt, (key, pos, h) => {
      const s = ctx.project(V(pos.x, h, pos.z))
      hud.place(key, s.x, s.y, s.visible && s.dist < 30)
    })
    if (q.playerIn && !q.done) {
      const i = q.playerIndex
      const ahead = i === 0 ? "You're next!" : `${i} ${i === 1 ? 'mom' : 'moms'} ahead of you`
      const shields = G.shields > 0 ? ` · 🛡️${G.shields}` : ''
      hud.info(`#${i + 1} in line`, (q.hasBots ? `about ${hud.fmt(q.eta())} to go` : ahead) + shields)
      hud.action('Cut Line', PRICES.cutLine, buyCutLine)
      queueIncome += dt
      if (queueIncome >= QUEUE.incomeEvery) {
        queueIncome = 0
        waitIncome(REWARDS.queueTick, V(pp.x, pp.y + 2.1, pp.z))
      }
      // Kill prompt above the mom right in front (a bot, or a real mom: relayed to her game)
      const ve = q.victim()
      const v = ve && (ve.npc ? ve.npc.g.position : ve.remote)
      if (v && Math.hypot(v.x - pp.x, v.z - pp.z) < QUEUE.killRange) {
        const a = hud.anchor('kill', `<button class="prompt"><span class="key">E</span>Kill <span class="price">${'🪙'}${PRICES.kill}</span></button>`, '')
        if (!a._wired) {
          a._wired = true
          a.addEventListener('pointerdown', (e) => {
            e.preventDefault()
            e.stopPropagation()
            buyKill()
          })
        }
        const s = ctx.project(V(v.x, 1.7, v.z))
        hud.place('kill', s.x, s.y, s.visible)
      } else hud.removeAnchor('kill')
      // No input for a minute (online): the server lets the others go ahead until you're back.
      const idleNow = !!net.room?.state?.players?.get?.(mySession())?.idle
      if (idleNow && !idleToast) hud.toast('Still there? Move or tap to keep your turn', '#fff3a0')
      idleToast = idleNow
    } else if (!q.playerIn) {
      const n = q.members.length
      hud.info(n ? `${n} ${n === 1 ? 'mom' : 'moms'} in line` : 'Nobody in line', 'Walk to the start of the line!')
      hud.action(null)
      hud.removeAnchor('kill')
    }
  }
  let idleToast = false
  function buyCutLine() {
    const q = G.queue
    if (!q || !q.playerIn || q.done) return
    if (q.playerIndex <= 0) {
      hud.toast("You're already first!", '#fff')
      return
    }
    if (!spend(PRICES.cutLine)) return
    const { moved, past } = q.cutLine(QUEUE.cutLinePlaces)
    cutLineOnServer(q.kind, past) // online: past the real moms among them too
    sound.speedUp()
    fx.sparkle(V(player.position.x, 1.5, player.position.z), { count: 30, color: '#c8a2ff' })
    hud.toast(`Skipped ${moved} moms! 😎`, '#e0c8ff')
  }
  function buyKill() {
    const q = G.queue
    const v = q?.victim()
    if (!v || !q.inLine) return
    if (v.remote && !net.connected) return
    // The server relays one Kill / Kill All a second: wait instead of paying for one it would drop.
    if (v.remote && !canTroll()) return void hud.toast('Catch your breath... one second!', '#ffd0ff')
    if (!spend(PRICES.kill)) return
    if (v.npc) q.kill(v.npc)
    else {
      // A real mom: her own game knocks her out and sends her to the end of the line.
      sendTroll('kill', v.remote.sid)
      remote?.poof(v.remote)
      sound.poof()
      hud.toast(`You knocked ${v.remote.name || 'a mom'} out of the line! 💀`, '#e5b0ff')
    }
    cam.shake = 0.4
  }
  G.onKey = (code) => {
    if (code === 'KeyE' && G.state === 'queue') buyKill()
  }
  async function buyKillAll() {
    const q = G.queue
    if (G.state !== 'queue' || !q || !q.playerIn || q.done) {
      hud.toast('Use Kill All while you wait in a line!', '#ffd0ff')
      sound.error()
      return
    }
    if (q.playerIndex <= 0) {
      hud.toast("Nobody's ahead of you!", '#fff')
      return
    }
    // Real moms ahead are knocked out by the relayed troll (one a second on the server).
    const realAhead = () => q.members.slice(0, Math.max(0, q.playerIndex)).some((e) => e.remote)
    if (realAhead() && !canTroll()) return void hud.toast('Catch your breath... one second!', '#ffd0ff')
    const ok = await hud.confirm('Kill All?', 'Clear everyone ahead of you in this line.', PRICES.killAll)
    if (!ok || G.queue !== q || !q.playerIn || q.done) return
    if (realAhead() && !canTroll()) return void hud.toast('Catch your breath... one second!', '#ffd0ff')
    if (!spend(PRICES.killAll)) return
    sound.boom()
    cam.shake = 1.2
    fx.ring(V(player.position.x, 0, player.position.z), '#c07bff', 14, 0.9)
    fx.burst(V(player.position.x, 1.5, player.position.z), ['#c07bff', '#ff6ad5', '#ffffff'], { count: 60, speed: 9 })
    const { remotes } = q.killAll()
    // Real moms ahead of you: each one's game knocks her out (backend relays the troll).
    if (remotes.length && sendTroll('killAll', q.kind)) for (const r of remotes) remote?.poof(r)
    hud.toast('KILL ALL! 💀', '#e5b0ff')
    q.cooldown = Math.min(q.cooldown, 1.2)
  }
  hud.onKillAll = buyKillAll

  // --- Permanent upgrades (upgrades.js, UPGRADES in config.js): coins only ---
  const refreshUpg = () => hud.setUpgrades({ alert: affordable(save) })
  coinsChanged = refreshUpg
  function applyUpgrades() {
    player.speedMult = walkMult(save)
  }
  hud.onUpgrades = () => {
    sound.pop()
    hud.upgrades(
      () => upgView(save),
      (id) => {
        const price = canBuy(save, id)
        if (!price) {
          sound.error()
          return 0
        }
        if (!spend(price, true)) return 0
        levelUp(save, id)
        persist()
        applyUpgrades()
        if (id === 'shield') G.shields++ // the new block works on this trip too
        const lvl = upgLevel(save, id)
        sound.levelUp(lvl)
        const pp = player.renderPosition
        fx.sparkle(V(pp.x, pp.y + 1.2, pp.z), { count: 30 + lvl * 6, color: '#9fe8ff', speed: 3 })
        fx.burst(V(pp.x, pp.y + 1.4, pp.z), ['#7fd8ff', '#ffffff', '#ffe14d', '#b47bff'], { count: 24, speed: 4, size: 0.4 })
        fx.ring(V(pp.x, pp.y + 0.15, pp.z), '#7fd8ff', 2.4, 0.7)
        refreshUpg()
        return lvl
      },
    )
  }
  applyUpgrades()
  refreshUpg()

  // Lullaby: the waiting income pays more, with soft pastel notes rising and a music-box chime.
  let lullStep = 0
  // Saturated, normally blended (fx.puff): they must read on the white ambulance interior too,
  // where additive glow would wash out.
  const NOTE_COLORS = ['#ff4fa3', '#3f8fff', '#9b5cff', '#21c46b']
  function waitIncome(base, at) {
    const extra = waitBonus(save)
    addCoins(base + extra)
    if (!extra) return false
    sound.lullaby(lullStep)
    lullStep += 2
    for (let i = 0; i < 5 + extra; i++) {
      const a = Math.random() * Math.PI * 2
      const o = { color: NOTE_COLORS[i % NOTE_COLORS.length], size: 0.22, size1: 0.1, life: 1.4 + Math.random() * 0.5, alpha: 0.95, drag: 0.6, spin: (Math.random() - 0.5) * 2 }
      fx.puff.spawn(at.x + Math.cos(a) * 0.3, at.y, at.z + Math.sin(a) * 0.3, Math.cos(a) * 0.2, 0.55 + Math.random() * 0.35, Math.sin(a) * 0.2, o)
      fx.glow.spawn(at.x + Math.cos(a) * 0.3, at.y, at.z + Math.sin(a) * 0.3, Math.cos(a) * 0.2, 0.55 + Math.random() * 0.35, Math.sin(a) * 0.2, { ...o, color: '#ffffff', size: 0.12, size1: 0 })
    }
    return true
  }

  // Line Shield: blocks per trip; a block raises a wobbling bubble around you that pops.
  G.shields = 0
  const shieldGeo = new SphereGeometry(1, 40, 24)
  // A soap-bubble shield: bright fresnel rim, nearly clear middle (you stay visible inside it), a slow
  // rainbow sheen sliding over it. Normal blending, so it reads on bright days and dark rooms alike.
  const shieldMaterial = () =>
    new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 } },
      transparent: true,
      depthWrite: false,
      vertexShader: `
        varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          vP = position;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uTime; uniform float uOpacity;
        varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main() {
          float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4);
          float band = 0.5 + 0.5 * sin(vP.y * 5.0 + vP.x * 3.0 + uTime * 2.2);
          vec3 sheen = 0.5 + 0.5 * cos(6.2831 * (band + vec3(0.0, 0.33, 0.67)));
          vec3 col = mix(vec3(0.62, 0.92, 1.0), vec3(1.0), rim * 0.6) + sheen * 0.18 * (1.0 - rim);
          float a = (0.07 + rim * 0.85 + band * 0.05) * uOpacity;
          gl_FragColor = vec4(col, a);
        }`,
    })
  const bubbles = [] // { m, t }
  function shieldBlock(from) {
    G.shields--
    const m = new Mesh(shieldGeo, shieldMaterial())
    // Around the avatar (about 1.8 m tall): 1.2 m wide, 1.05 m tall about y 1.1, so it clears the head
    // (top 2.15 m) and sits on the ground (bottom 0.05 m) instead of cutting into it.
    m.position.y = 1.1
    m.renderOrder = 2
    ctx.playerGroup.add(m)
    bubbles.push({ m, t: 0 })
    sound.shield()
    const pp = player.renderPosition
    fx.ring(V(pp.x, pp.y + 0.1, pp.z), '#9fe8ff', 2, 0.5)
    hud.toast(`🛡️ Shield blocked ${from || 'a mom'}'s Kill!${G.shields ? ` (${G.shields} left)` : ''}`, '#bfefff')
  }
  function updateBubbles(dt) {
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i]
      b.t += dt
      const t = b.t
      let s
      if (t < 0.3) s = (1 - Math.pow(1 - t / 0.3, 3)) * (1 + Math.sin((t / 0.3) * Math.PI) * 0.12) // pop in with overshoot
      else s = 1 + Math.sin(t * 9) * 0.03 * Math.max(0, 1.6 - t) // wobble, settling
      const w = Math.sin(t * 7) * 0.015 // jelly: wider as it squashes
      b.m.scale.set(1.2 * s * (1 + w), 1.0 * s * (1 - w), 1.2 * s * (1 + w))
      b.m.material.uniforms.uTime.value = t
      if (t > 1.6) {
        // pop: swell and fade fast, then sparkles where it was
        const k = Math.min(1, (t - 1.6) / 0.15)
        b.m.scale.multiplyScalar(1 + k * 0.15)
        b.m.material.uniforms.uOpacity.value = 1 - k
        if (k >= 1) {
          const pp = player.renderPosition
          fx.sparkle(V(pp.x, pp.y + 1.0, pp.z), { count: 36, color: '#dff8ff', speed: 3.5 })
          sound.shieldPop()
          b.m.parent?.remove(b.m)
          b.m.material.dispose()
          bubbles.splice(i, 1)
        }
      }
    }
  }

  // Comfy Shoes: a light sky-blue dust trail and the odd sparkle from your feet while you run.
  let trailT = 0
  function updateShoesTrail(dt) {
    const lvl = upgLevel(save, 'shoes')
    if (!lvl || player.frozen || G.puppet || player.autoTarget || !player.grounded) return
    const v = player.velocity
    if (Math.hypot(v.x, v.z) < 4) return
    trailT -= dt
    if (trailT > 0) return
    trailT = 0.11 - lvl * 0.012
    const pp = player.renderPosition
    fx.dust(V(pp.x - v.x * 0.03, pp.y + 0.02, pp.z - v.z * 0.03), { count: 2 + Math.floor(lvl / 2), color: '#8fcfff', size: 0.42, speed: 0.6, life: 0.7 })
    if (Math.random() < 0.25 * lvl) fx.glow.spawn(pp.x - v.x * 0.02, pp.y + 0.15, pp.z - v.z * 0.02, (Math.random() - 0.5) * 0.8, 0.9, (Math.random() - 0.5) * 0.8, { color: '#7fe0ff', size: 0.28, size1: 0, life: 0.55, drag: 1.5 })
  }

  // --- Babydex (dex.js): the collection book; its rewards are coins ---
  const refreshDex = () => hud.setDex({ found: dexFound(save), total: DEX_TOTAL, alert: dexView(save).claimable })
  hud.onDex = () => {
    sound.pop()
    hud.dex(
      () => dexView(save),
      (keys) => {
        const coins = claimDex(save, keys)
        if (!coins) return false
        addCoins(coins)
        sound.fanfare()
        refreshDex()
        return true
      },
    )
  }
  refreshDex()
  hud.onTwins = async () => {
    if (save.twins) {
      sound.click()
      hud.toast("You're having twins! 👶👶", '#ffd0ec')
      return
    }
    const ok = await hud.confirm('Twins!', 'Every delivery brings TWO babies from now on.', PRICES.twins)
    if (ok && spend(PRICES.twins)) unlockTwins()
  }
  function unlockTwins() {
    save.twins = true
    persist()
    refreshShop()
    applyBelly()
    fx.sparkle(V(player.renderPosition.x, 1.4, player.renderPosition.z), { count: 50, color: '#ffb3e0', speed: 4 })
    hud.toast('TWINS UNLOCKED! 👶👶', '#ffd0ec')
    sound.fanfare()
  }
  hud.onSkipEnd = async () => {
    const skippable = ['walk1', 'ride', 'walk2', 'queue'].includes(G.state)
    if (!skippable) {
      sound.error()
      return
    }
    const ok = await hud.confirm('Skip To End?', 'Go straight to the delivery room!', PRICES.skipToEnd)
    if (!ok || !skippable || !spend(PRICES.skipToEnd)) return
    siren.stop()
    engine.stop()
    treadmill.setVisible(false)
    cam.free = false
    ambDrive = null
    if (!trip.name) trip.name = pickNames(1)[0]
    startDelivery()
  }

  // The player reached the front: walk to the desk/door, then that room's scene.
  // spot: the one the line (offline) or the server (online) sent you to; route: the points to it.
  async function playerTurn(id, spot, route) {
    const q = G.queue
    hud.info(null)
    hud.action(null)
    hud.removeAnchor('kill')
    hud.objective("It's your turn!", null)
    sound.success()
    G.state = 'turn'
    for (let i = 0; i < route.length; i++) {
      const p = route[i]
      player.autoTarget = { x: p.x, z: p.z, speed: 3, facing: i === route.length - 1 ? spot.face : undefined }
      player.arrived = false
      const t0 = performance.now()
      while (!player.arrived && performance.now() - t0 < 6000 && G.queue === q) await new Promise((r) => setTimeout(r, 16))
    }
    player.autoTarget = null
    if (G.queue !== q) return // skipped to the end meanwhile
    G.spotStaff = spot.staff
    if (id === 'lobby') await checkInScene()
    else if (id === 'waiting') await heartbeatScene()
    else if (id === 'breathing') await breathingScene()
    else if (id === 'ultrasound') await scanScene()
    else if (id === 'final') startDelivery()
  }

  function pickNames(n) {
    const pool = NAMES.filter((x) => !save.babies.some((b) => b.name === x))
    const src = pool.length >= n ? pool : NAMES
    const out = []
    while (out.length < n) {
      const c = src[Math.floor(Math.random() * src.length)]
      if (!out.includes(c)) out.push(c)
    }
    return out
  }

  // Over-the-shoulder framing toward a staff member.
  function talkShot(npcKey) {
    const s = staff[npcKey].g.position
    const pp = player.position
    const dx = s.x - pp.x
    const dz = s.z - pp.z
    const d = Math.hypot(dx, dz) || 1
    G.cameraMode = 'script'
    shot(V(pp.x - (dx / d) * 2.6 + (dz / d) * 0.9, 2.6, pp.z - (dz / d) * 2.6 - (dx / d) * 0.9), V(s.x, 1.7, s.z), 0.8)
  }
  const say = (speaker, text, opts = {}) => hud.dialogue({ speaker, text, time: opts.time ?? Math.max(2.2, text.length * 0.055), ...opts })

  async function checkInScene() {
    G.state = 'talk'
    player.frozen = true
    hud.setGameplay(false)
    talkShot(G.spotStaff ?? 'rec2') // the window the line sent you to
    const R = 'Receptionist'
    await say(R, `Welcome to ${HOSPITAL_NAME}! Let's get you checked in, mama.`)
    const names = pickNames(3)
    const pick = await hud.dialogue({ speaker: R, text: "First things first... what's the little one's name?", choices: names.map((n) => ({ label: n })), time: DIALOGUE.choiceTime, fallback: 0 })
    trip.name = names[Math.max(0, pick)]
    addCoins(REWARDS.answer)
    await say(R, `Aww, ${trip.name}! That's adorable.`)
    if (save.twins) {
      await say(R, 'And I see TWO little heartbeats on your chart. Twins it is! 👶👶')
    } else {
      const poor = save.coins < PRICES.twins
      const c = await hud.dialogue({
        speaker: R,
        text: 'Wait... this chart shows... a second little foot?! Want TWINS?',
        choices: [{ label: 'YES! TWINS! 👶👶', price: PRICES.twins, poor }, { label: 'One is chaos enough 😅' }],
        time: DIALOGUE.choiceTime,
        fallback: 1,
      })
      if (c === 0 && spend(PRICES.twins)) {
        unlockTwins()
        await say(R, 'Double the cuddles! Congratulations, mama!')
      } else await say(R, 'Okay... but that second foot looks suspicious 👀')
    }
    await say(R, "You're all checked in! Head to the waiting room.")
    addCoins(REWARDS.phase)
    await enterRoom('waiting')
  }

  async function heartbeatScene() {
    G.state = 'talk'
    player.frozen = true
    hud.setGameplay(false)
    talkShot('nurse')
    const N = 'Nurse'
    const beats = (async () => {
      for (let i = 0; i < 6; i++) {
        sound.heartbeat()
        await new Promise((r) => setTimeout(r, 470))
      }
    })()
    await say(N, "Let's listen to that little heartbeat... *thump thump*", { time: 3 })
    await beats
    const c = await hud.dialogue({
      speaker: N,
      text: 'Strong little heartbeat! Off to breathing class! How are you feeling?',
      choices: [{ label: 'Excited!! 🥰' }, { label: 'Nervous... 😬' }, { label: 'HUNGRY 🍕' }],
      time: DIALOGUE.choiceTime,
      fallback: 0,
    })
    addCoins(REWARDS.answer)
    await say(N, ['Love that energy! Go get it, mama!', "Totally normal! You've got this. 💗", 'Snacks after class, I promise! 🍪'][Math.max(0, c)])
    addCoins(REWARDS.phase)
    await enterRoom('breathing')
  }

  async function breathingScene() {
    G.state = 'breathing'
    player.frozen = true
    const room = G.room
    const mat = room.staffSpots.mat
    // mama on the mat next to the coach
    releasePuppet(mat.x - 2.2, mat.z + 2.4, Math.PI * 0.75)
    standAt(mat.x - 2.2, mat.z + 2.4, Math.PI * 0.75, 0.06)
    hud.setGameplay(false)
    hud.cinema(true)
    G.cameraMode = 'script'
    shot(V(mat.x - 9, 4.2, mat.z + 7.5), V(mat.x - 1.2, 1.2, mat.z + 0.6), 0)
    setMusic('calm')
    const ui = hud.breathing()
    const total = BREATHING.breaths
    const cycle = BREATHING.cycle
    let good = 0
    let pressed = false
    let lastPhase = 0
    let breath = 0
    let t = 0
    let inhaling = null
    ui.set({ count: 0, total })
    ui.onGo(() => {
      if (pressed || breath >= total) return
      pressed = true
      const phase = (t % cycle) / cycle
      const off = Math.abs(phase - 0.5) * cycle
      if (off < BREATHING.perfectWindow) {
        good++
        ui.feedback('PERFECT!', 'perfect')
        sound.perfect()
        fx.sparkle(V(player.renderPosition.x, 2, player.renderPosition.z), { count: 20, color: '#c8f7e6' })
        addCoins(REWARDS.breath + 1)
      } else if (off < BREATHING.goodWindow + 0.18) {
        good++
        ui.feedback('GOOD!', 'good')
        sound.success()
        addCoins(REWARDS.breath)
      } else {
        ui.feedback('MISS', 'miss')
        sound.miss()
      }
      ui.set({ count: good, total })
    })
    await new Promise((res) => {
      breathTick = (dt) => {
        t += dt
        const phase = (t % cycle) / cycle
        if (phase < lastPhase) {
          if (!pressed) {
            ui.feedback('MISS', 'miss')
            sound.miss()
          }
          pressed = false
          breath++
          if (breath >= total) {
            breathTick = null
            res()
            return
          }
        }
        lastPhase = phase
        const inh = phase < 0.5
        if (inh !== inhaling) {
          inhaling = inh
          if (inh) sound.breathIn(cycle / 2)
          else sound.breathOut(cycle / 2)
          ui.set({ word: inh ? 'IN' : 'OUT', sub: inh ? '...and breathe in' : '...and breathe out' })
        }
        const k = inh ? phase / 0.5 : 1 - (phase - 0.5) / 0.5
        ui.set({ inner: 0.45 + ease(k) * 0.72, bar: phase })
        // the belly breathes too
        breatheBelly(avatar, ease(k) * 0.05)
      }
    })
    breatheBelly(avatar, 0)
    ui.remove()
    const great = good >= 5
    sound[great ? 'fanfare' : 'chime']()
    hud.title(great ? 'GREAT BREATHING!' : 'KEEP PRACTICING!', `${good} / ${total} breaths`, { color: 'mint' })
    hud.subtitle('Coach: Great job, mama! Next stop: your ultrasound!', { typeSpeed: 30 })
    if (great) fx.confettiRain(V(player.renderPosition.x, 0, player.renderPosition.z), { radius: 4 })
    await new Promise((r) => setTimeout(r, 3600))
    hud.title(null)
    hud.subtitle(null)
    hud.cinema(false)
    addCoins(REWARDS.phase)
    await enterRoom('ultrasound')
  }
  let breathTick = null

  async function scanScene() {
    G.state = 'talk'
    player.frozen = true
    hud.setGameplay(false)
    talkShot('tech')
    const T = 'Sonographer'
    await say(T, "Hop up! Let's take a peek at your little one...")
    const card = document.createElement('div')
    card.className = 'labor'
    card.style.background = 'rgba(7,13,22,0.92)'
    const img = ultrasoundImage(save.twins)
    img.className = 'us'
    card.innerHTML = '<div class="ttl outlined">ULTRASOUND</div>'
    card.appendChild(img)
    hud.root.appendChild(card)
    sound.reveal()
    for (let i = 0; i < 4; i++) setTimeout(() => sound.heartbeat(), 600 + i * 450)
    await say(T, save.twins ? 'Look! Tiny toes... times TWO! 👣👣' : 'Look! Tiny toes... and a little wave! 👋', { time: 3.4 })
    card.remove()
    await say(T, 'Everything looks perfect! Off to the final line!')
    addCoins(REWARDS.phase)
    await enterRoom('final')
  }

  // ======================================================================================
  // DELIVERY
  // ======================================================================================
  async function startDelivery() {
    G.state = 'delivery'
    player.frozen = true
    setWaypoint(null)
    await hud.fade(1, 400)
    clearCoins()
    endQueue()
    hideRooms()
    hideAllStaff()
    siren.stop()
    engine.stop()
    treadmill.setVisible(false)
    const room = rooms.delivery
    room.group.visible = true
    for (const e of room.extra) e.visible = true
    G.room = room
    hud.setGameplay(false)
    hud.cinema(true)
    setAmbience('room')
    setMusic('tense')
    lieAt({ x: room.bed.x, y: room.bed.y, z: room.bed.z }, 0)
    showStaff('doctor', room.doctorSpot, -Math.PI * 0.62)
    G.cameraMode = 'script'
    shot(room.quizCam.pos, room.quizCam.look, 0)
    if (!trip.name) trip.name = pickNames(1)[0]
    await hud.fade(0, 500)
    const D = 'Doctor'
    await say(D, "Hi mama! I'm Dr. Bloom. A few quick questions before we meet your baby!")
    const QUIZ = [
      ['How are you feeling right now?', ['Excited!', 'A little scared', 'Ready to rock!']],
      ["Who's the first person you'll call?", ['Grandma!', 'My best friend', 'EVERYONE!!']],
      ['Favourite lullaby style?', ['Soft & sleepy', 'Pop hits 🎤', 'Silly songs']],
      ["Diaper duty: who's on it?", ['Me, of course!', 'Pip the pet 🐝', 'Rock-paper-scissors']],
      ['Ready to meet your little one?', ['SO ready!!', 'Can we wait a bit?', 'Born ready!']],
    ]
    for (let i = 0; i < QUIZ.length; i++) {
      const [q, opts] = QUIZ[i]
      const c = await hud.dialogue({ speaker: D, text: `Q${i + 1} of ${QUIZ.length}: ${q}`, choices: opts.map((label) => ({ label })), time: DIALOGUE.quizTime, fallback: 0, color: 'green' })
      if (c >= 0) addCoins(REWARDS.answer)
    }
    await say(D, "Here we go! When I say push... PUSH! 💪", { time: 2.4 })
    await laborScreen()
    await reveal()
  }

  async function laborScreen() {
    const ui = hud.labor(ultrasoundImage(save.twins, 512, 91))
    let progress = 0
    let bpm = 120
    let lastPush = 0
    ui.onPush(() => {
      const now = performance.now()
      if (now - lastPush < 90) return
      lastPush = now
      progress += 0.035
      sound.push()
      cam.shake = 0.3
    })
    await new Promise((res) => {
      laborTick = (dt) => {
        progress += dt * 0.045
        bpm = 120 + progress * 55 + Math.sin(performance.now() / 300) * 2
        ui.set(progress, bpm)
        ui.draw(dt, bpm)
        rooms.delivery.setBpm(bpm)
        if (progress >= 1) {
          laborTick = null
          res()
        }
      }
    })
    sound.reveal()
    await hud.fade(1, 700, true)
    ui.remove()
  }
  let laborTick = null

  // One delivered baby: { name, type, shiny?, pity? } (pity: the Babydex pity timer made it Epic+).
  const rollBaby = (name, pity = false) => {
    const b = { name, type: rollBabyType(Math.random, { minRarity: pity ? DEX.pityRarity : 0, luck: luck(save) }).id }
    if (Math.random() < DEX.shinyChance) b.shiny = true
    if (pity) b.pity = true
    return b
  }
  async function reveal() {
    const room = rooms.delivery
    const count = save.twins ? 2 : 1
    const names = [trip.name, ...pickNames(3).filter((n) => n !== trip.name)].slice(0, count)
    let babies = names.map((name, i) => rollBaby(name, pityDue(save, i)))
    setBelly(false)
    standAt(room.standSpot.x, room.standSpot.z, 0)
    G.avatarInput.pose = null
    carryBabies(babies)
    staff.doctor.g.visible = true
    shot(room.revealCam.pos, room.revealCam.look, 0)
    setMusic('celebrate')
    rooms.delivery.setBpm(120)
    await hud.fade(0, 600, true)
    sound.babyCoo()
    sound.fanfare()
    fx.confettiRain(V(room.standSpot.x, 0, room.standSpot.z), { radius: 4, count: 220 })
    hud.title(`MEET ${names.join(' & ').toUpperCase()}!`)
    if (luck(save)) {
      // Lucky Charm: a ring of green clover sparkles spirals up around you before the reveal.
      setTimeout(() => {
        sound.lucky()
        const c = room.standSpot
        for (let i = 0; i < 24 + luck(save) * 6; i++) {
          const a = (i / 12) * Math.PI * 2
          fx.glow.spawn(c.x + Math.cos(a) * 0.9, 0.2 + i * 0.05, c.z + Math.sin(a) * 0.9, -Math.sin(a) * 1.4, 1.2, Math.cos(a) * 1.4, { color: i % 3 ? '#6dff8a' : '#e6ffb0', size: 0.34, size1: 0, life: 1.2, drag: 0.8 })
        }
      }, 900)
    }
    await new Promise((r) => setTimeout(r, 2400))
    for (let i = 0; i < babies.length; i++) {
      let reroll = true
      while (reroll) {
        reroll = false
        const b = babies[i]
        const type = BABY_TYPES.find((t) => t.id === b.type)
        const rar = RARITIES[type.rarity]
        const kind = `${b.shiny ? 'SHINY ' : ''}${type.name.toUpperCase()}`
        const article = /^[AEIOU]/i.test(kind) ? 'AN' : 'A'
        const isNew = isNewType(save, type.id)
        const proud = babyCoinMult(save)
        const gain = Math.round((type.coins * (b.shiny ? DEX.shinyCoins : 1) + (isNew ? type.coins * DEX.newBonus : 0)) * proud)
        hud.title(`IT'S ${article} ${kind}!`, b.pity ? 'Lucky streak! Guaranteed Epic or better' : '', {
          color: 'blue',
          tag: b.shiny ? `✨ SHINY ${rar.name} ✨` : rar.name,
          tagColor: b.shiny ? '#ffd23a' : rar.color,
        })
        sound.rarity(type.rarity)
        fx.burst(V(room.standSpot.x, 1.6, room.standSpot.z + 0.4), [rar.color, '#ffffff', '#ffd84a'], { count: 40 + type.rarity * 20 + (b.shiny ? 60 : 0) })
        if (type.rarity >= 3 || b.shiny) fx.confettiRain(V(room.standSpot.x, 0, room.standSpot.z), { radius: 4, count: 200 })
        await new Promise((r) => setTimeout(r, 2200))
        hud.title(null)
        const res = await hud.reward({
          rarity: b.shiny ? `✨ SHINY ${rar.name} ✨` : rar.name,
          color: b.shiny ? '#ffc21a' : rar.color,
          name: type.name,
          emoji: type.emoji ?? '🍼',
          quote: type.quote.replace('{n}', b.name),
          coins: gain,
          bonus: [isNew ? 'NEW BABY BONUS!' : b.shiny ? 'SHINY BONUS!' : '', proud > 1 ? `PROUD PARENT +${Math.round((proud - 1) * 100)}%` : ''].filter(Boolean).join(' · '),
          price: PRICES.newBaby,
          isNew,
        })
        if (res === 'again' && spend(PRICES.newBaby)) {
          babies[i] = rollBaby(b.name)
          carryBabies(babies)
          sound.reveal()
          reroll = true
          continue
        }
        // Kept (or the re-roll was not affordable): coins, then into the Babydex.
        addCoins(gain)
        if (proud > 1) {
          // Proud Parent: a fountain of gold coins bursting up from the baby.
          const c = room.standSpot
          // Solid gold coins (normal blend: they stay gold instead of blowing out to white where they
          // overlap), launched in a ring from the baby, with a few glints on top.
          const n = 12 + upgLevel(save, 'parent') * 4
          for (let k = 0; k < n; k++) {
            const a = (k / n) * Math.PI * 2 + Math.random() * 0.3
            const sp = 1.6 + Math.random() * 1.2
            const x = c.x + Math.cos(a) * 0.25
            const z = c.z + 0.4 + Math.sin(a) * 0.25
            fx.puff.spawn(x, 1.4, z, Math.cos(a) * sp, 4.2 + Math.random() * 1.8, Math.sin(a) * sp, { color: k % 3 ? '#ffc21a' : '#ffe27a', size: 0.2, size1: 0.16, life: 1.2, alpha: 1, gravity: -9, drag: 0.3, spin: 5 })
            if (k % 3 === 0) fx.glow.spawn(x, 1.4, z, Math.cos(a) * sp, 4.6, Math.sin(a) * sp, { color: '#fff3b0', size: 0.22, size1: 0, life: 0.8, gravity: -9, drag: 0.3 })
          }
          ;[0, 120, 240].forEach((ms, k) => setTimeout(() => sound.coin(1 + k * 0.12), ms))
          await new Promise((r) => setTimeout(r, 1100)) // let the fountain land before the walk home
        }
        recordBaby(save, b)
        if (isNew) hud.toast(`📖 New in your Babydex! ${dexFound(save)}/${DEX_TOTAL}`, '#bfe6ff')
      }
    }
    save.babies.push(...babies.map(({ name, type, shiny }) => (shiny ? { name, type, shiny } : { name, type })))
    save.trips++
    save.delivered += babies.length
    persist()
    hud.setBabies(save.delivered)
    refreshDex()
    if (dexView(save).claimable) setTimeout(() => hud.toast('🎁 Babydex reward ready to claim!', '#ffe14d'), 1800)
    await headingHome(babies)
  }

  async function headingHome(babies) {
    const H = HOSPITAL.x
    const fz = HOSPITAL.facadeZ
    let t = 0
    // The delivery room goes away only once the screen is black (hiding it first flashed open sky).
    const leaveRoom = () => {
      hideRooms()
      hideAllStaff()
    }
    await cutscene(
      async () => {
        await hud.fade(1, 400)
        leaveRoom()
        hud.cinema(true)
        setAmbience('outdoor')
        setMusic('celebrate')
        placeAmbulance(HOSPITAL.ambulanceStop.x, HOSPITAL.ambulanceStop.z)
        ambulance.setDoors(false, true)
        standAt(H, fz - 1, 0)
        G.puppetSpeed = 1.3
        cam.attach = (dt) => {
          t += dt
          const z = Math.min(fz + 7, fz - 1 + t * 1.3)
          G.puppet.pos.set(H, 0, z)
          if (Math.random() < dt * 30) fx.confettiRain(V(H, 0, z), { count: 4, radius: 4, height: 4 })
          return { p: TMP_P.set(H, 2.3, fz + 13), l: TMP_L.set(H, 1.6, z) }
        }
        await hud.fade(0, 500)
        // The Bloxity results screen ad (declared in bloxity.js, middle-right) while you walk home.
        if (ADS.resultsScreen) showScreenAd('results')
        fx.confettiRain(V(H, 0, fz + 2), { count: 200, radius: 6 })
        sound.cheer()
        hud.subtitle(`Heading home with ${babies.map((b) => b.name).join(' & ')} ❤️`, { typeSpeed: 40 })
        await W(5.5)
      },
      async () => {
        leaveRoom() // also when the walk out was skipped before the fade finished
        hideScreenAd()
        G.puppetSpeed = 0
        cam.attach = null
        await hud.fade(1, 500)
        await introLoop()
      },
    )
  }

  // ======================================================================================
  // START + UPDATE
  // ======================================================================================
  G.start = async () => {
    hud.setMuted(false)
    await hud.fade(1, 0)
    if (save.babies.length) await introLoop()
    else await introFirst()
  }
  // Back to a safe spot for the current phase (R key / portal respawn).
  G.respawn = () => {
    if (G.puppet || player.frozen) return
    if (G.state === 'turn' || G.queue?.done) return // walking to / at your spot
    if (G.queue?.inLine) {
      G.queue.leave() // back to the entrance: join the line again from its start
      setWaypoint(G.room.joinAt, 'Line')
    }
    if (G.room?.spawn) releasePuppet(G.room.spawn.x, G.room.spawn.z, G.room.spawn.facing)
    else if (G.state === 'walk2') {
      const rr = ambRear()
      releasePuppet(rr.x, rr.z - 1.2, Math.PI)
    } else releasePuppet(home.standSpot.x, home.standSpot.z, Math.PI)
  }
  G.puppetSpeed = 0
  placeAmbulance(AMB_PARK.x + 90, AMB_PARK.z)
  // Title screen backdrop: mama asleep, a slow look across the bedroom.
  lieAt({ x: home.bed.x, y: home.bed.y + 0.24, z: home.bed.z + 2.05 }, 0)
  dolly(V(4.5, 3.6, 4.2), V(-1.2, 1.0, -3.2), V(3.2, 3.2, 3.6), V(-1.6, 1.0, -3.4), 30)

  // ======================================================================================
  // MULTIPLAYER + BLOXITY
  // ======================================================================================
  // Where you are, for who the other moms see (net.js trip.zone): the hospital forecourt and each
  // line room are shared; home, the walk out to the ambulance, cutscenes, the ride and the
  // delivery room are yours alone (the other moms first appear once you reach the hospital).
  const SHARED_STATES = new Set(['queue', 'turn', 'talk', 'breathing', 'ko'])
  G.zone = () => {
    if (inCutscene) return 'solo'
    if (G.state === 'walk2') return 'street'
    if (G.room && G.room.id !== 'delivery' && SHARED_STATES.has(G.state)) return G.room.id
    return 'solo'
  }
  const ANIM_OF = new Map([
    [POSES.sit, 'sit'],
    [POSES.phone, 'phone'],
    [POSES.shock, 'shock'],
    [POSES.lie, 'lie'],
  ])
  // What the others draw of you (main.js presence source).
  G.presence = () => ({
    anim: G.state === 'ko' ? 'ko' : ANIM_OF.get(G.avatarInput.pose) ?? '',
    trip: { zone: G.zone(), hold: G.queue?.hold ?? '', belly: bellyOn, twins: !!save.twins, carry: carryText },
  })
  // The line you stand in right now ('' = none), for the server's order (net.wantLine).
  G.lineKind = () => (G.state === 'queue' && G.queue?.inLine ? G.queue.kind : '')

  // Another mom's Kill / Kill All (net.onTrolled). Kill: aimed at your session. Kill All: everyone
  // ahead of her in that line, i.e. with a lower server ticket than hers.
  G.onTrolled = ({ id, from, sid, text }) => {
    const q = G.queue
    if (G.state !== 'queue' || !q?.inLine) return
    const hit = () => (G.shields > 0 ? shieldBlock(from) : knockedOut(from))
    if (id === 'kill' && text === mySession()) return void hit()
    if (id === 'killAll' && text === q.kind) {
      const by = rosterOf(sid)
      if (by && by.line === q.kind && myTicket(q.kind) < by.ticket) hit()
    }
  }
  // Knocked out of the line: down on the floor, Boxity's death screen, then back at the room's
  // entrance to queue again from the start.
  async function knockedOut(from) {
    const q = G.queue
    if (!q?.kickOut()) return
    const room = G.room
    G.state = 'ko'
    player.frozen = true
    hud.setGameplay(false)
    hud.info(null)
    hud.action(null)
    hud.removeAnchor('kill')
    const pp = player.position
    lieAt({ x: pp.x, y: 0.25, z: pp.z }, player.facing)
    fx.poof({ x: pp.x, y: 0.4, z: pp.z })
    sound.poof()
    cam.shake = 0.9
    hud.toast(`${from} knocked you out of the line! 💀`, '#e5b0ff')
    await new Promise((r) => setTimeout(r, REMOTE.knockout * 1000))
    await deathScreen() // resolves when its countdown lets you up (at once without the SDK)
    if (G.state !== 'ko' || G.room !== room) return
    releasePuppet(room.spawn.x, room.spawn.z, room.spawn.facing)
    player.frozen = false
    G.state = 'queue'
    hud.setGameplay(true)
    hud.showSkipEnd(true)
    setWaypoint(room.joinAt, 'Line')
    hud.toast('Back to the end of the line!', '#ffffff')
  }

  // Rewarded ad (the Free Coins button): coins only once the backend has verified the reward token
  // with Bloxity. Without a server (offline / dev) a completed ad is trusted.
  // Online the server takes one ad every ADS.reward.cooldown s: no ad is played before that ran
  // out, so a watched ad is never refused.
  let adBusy = false
  let adClaimedAt = -1e9
  G.watchAd = async () => {
    if (adBusy) return
    const wait = Math.ceil(ADS.reward.cooldown - (performance.now() - adClaimedAt) / 1000)
    if (net.connected && wait > 0) {
      hud.toast(`Next free coins in ${wait}s!`, '#ffd0d0')
      return
    }
    adBusy = true
    try {
      const r = await showRewarded(ADS.reward.placement)
      if (r.status !== 'completed') {
        if (r.status !== 'skipped') hud.toast('No ad available right now. Try again later!', '#ffd0d0')
        return
      }
      let coins = ADS.reward.coins
      if (net.connected) {
        const v = await claimAdReward(r.rewardToken)
        if (v.ok || v.reason === 'cooldown') adClaimedAt = performance.now()
        if (!v.ok) {
          hud.toast(v.reason === 'cooldown' ? 'One ad a minute! Try again soon.' : 'That ad reward could not be verified.', '#ffd0d0')
          return
        }
        coins = v.coins ?? coins
      }
      addCoins(coins)
      sound.fanfare()
      hud.toast(`+${coins} COINS!`, '#ffe14d')
    } finally {
      adBusy = false
    }
  }

  // dev: jump to a phase from the console
  G.debug = { wearCharacter: (c) => setDevCharacter(c), enterRoom, startDelivery, arriveHospital, startRide, save, introLoop, breathingScene: async () => { await enterRoom('breathing'); breathingScene() } }

  G.update = (dt, t) => {
    hud.tick(dt)
    for (const b of carried) b.userData.animate?.(t)
    for (const b of cribBabies) b.userData.animate?.(t)
    updateBubbles(dt)
    updateShoesTrail(dt)
    home.update(dt)
    for (const k in staff) {
      const s = staff[k]
      if (!s.g.visible) continue
      s.animator.update(dt, { grounded: true, speed: 0, verticalVelocity: 0, pose: s.pose, overlay: s.overlay })
    }
    if (G.room?.update) G.room.update(dt)
    updateCoins(dt, t)
    updateWaypoint()
    if (breathTick) breathTick(dt)
    if (laborTick) laborTick(dt)
    switch (G.state) {
      case 'walk1':
        updateWalk1(dt)
        break
      case 'ride':
        updateRide(dt)
        break
      case 'walk2':
        updateWalk2(dt)
        break
      case 'queue':
        updateQueue(dt)
        break
      case 'turn':
        G.queue?.update(dt, (key, pos, h) => {
          const s = ctx.project(V(pos.x, h, pos.z))
          hud.place(key, s.x, s.y, s.visible && s.dist < 30)
        })
        break
      default:
        if (!inCutscene && G.state !== 'ride') ambulance.update(dt, 0)
        // the line keeps shuffling while you talk at the desk
        G.queue?.update(dt, (key, pos, h) => {
          const s = ctx.project(V(pos.x, h, pos.z))
          hud.place(key, s.x, s.y, s.visible && s.dist < 30)
        })
    }
    // the yellow join marker pulses
    if (ctx.marker.visible) {
      const s = 1 + Math.sin(t * 4) * 0.06
      ctx.marker.scale.set(s, 1, s)
    }
  }
  return G
}
