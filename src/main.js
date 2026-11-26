import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  CircleGeometry,
  Clock,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  RingGeometry,
  Scene,
  Shape,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three'
import { ADS, CAMERA, MOMS, GAME_TITLE, graphicsPreset, RENDER } from './config.js'
import * as bloxity from './bloxity.js'
import { install as installInput, onKey } from './input.js'
import { installTouch } from './touch.js'
import { createPlayerBody, interpolate as interpolatePlayer, player } from './player.js'
import { setCameraSensitivity, syncYawToPlayer, update as updateCamera } from './camera.js'
import { onModeChanged, toggleMode } from './modes.js'
import { initPhysics, stepPhysics } from './physics.js'
import { createLighting } from './lighting.js'
import { buildWorld, createTreadmill, STREET } from './world.js'
import { createPostFx } from './postfx.js'
import { setNeonBloom } from './propkit.js'
import { buildDefaultCharacter, loadBaseCharacter } from './avatar/character.js'
import { applyProportions, attachEquippedAccessories } from './avatar/loader.js'
import { loadCustomCharacter } from './avatar/customCharacter.js'
import { disposeAnimator, makeAnimator } from './avatar/animator.js'
import { buildHome, ROOM } from './home.js'
import { buildHospitalExterior, buildHospitalInterior } from './hospital.js'
import { createAmbulance } from './ambulance.js'
import { createFx } from './fx.js'
import { createHud } from './hud.js'
import { createGame } from './game.js'
import { createNpcPool } from './queue.js'
import { buildPet } from './characters.js'
import { isMuted, setAdMute, setMuted, sound, unlock } from './audio.js'
import { initNet, onTrolled, sendEmote, sendPresence, setPresenceSource, wantLine } from './net.js'
import { createRemoteMoms } from './remote.js'
import { createLineBlockers } from './lineBlockers.js'
import { createEmotePlayer } from './emotes.js'

// Boot order: Bloxity SDK -> renderer -> Rapier -> world (street, home, hospital,
// rooms, treadmill, ambulance, NPCs) -> player + avatar -> HUD + other moms + game director -> net
// -> loop. Multiplayer + Bloxity platform features follow Don't Miss Your Flight: net.js (server link,
// saves, server-ordered lines), remote.js (the other real moms), lineBlockers.js (solid line moms),
// emotes.js (portal emote wheel), chat bubbles, ad breaks, rewarded / screen ads, death screen.
let lighting = null
let renderer = null
let postfx = null
let fx = null

function applySetting(key, value) {
  if (key === 'camera_sensitivity') setCameraSensitivity(value)
  else if (key === 'fullscreen') bloxity.requestFullscreen(value)
  else if (key === 'graphics_quality' && renderer) {
    const next = graphicsPreset(value)
    renderer.shadowMap.enabled = next.shadows
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, next.dpr))
    lighting?.setShadows(next)
    postfx?.configure(next)
    setNeonBloom(next.bloom)
    fx?.setQuality(next.particles)
    postfx?.setSize(window.innerWidth, window.innerHeight)
  }
}
bloxity.onSetting(applySetting)
bloxity.init()

// --- Renderer ---------------------------------------------------------------
const preset = graphicsPreset(bloxity.settings.graphics_quality)
renderer = new WebGLRenderer({ antialias: preset.antialias, powerPreference: 'high-performance' })
renderer.outputColorSpace = SRGBColorSpace
renderer.toneMapping = ACESFilmicToneMapping
renderer.toneMappingExposure = RENDER.exposure
renderer.shadowMap.enabled = preset.shadows
renderer.shadowMap.type = PCFSoftShadowMap
renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.dpr))
document.body.appendChild(renderer.domElement)
installInput(() => bloxity.showMenu(), renderer.domElement)

const scene = new Scene()
const camera = new PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far)
camera.position.set(4, 3, 4)
postfx = createPostFx(renderer, scene, camera)
postfx.configure(preset)

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight)
  postfx.setSize(window.innerWidth, window.innerHeight)
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', resize)
resize()

// --- Physics + world ----------------------------------------------------------
bloxity.loadingStep('Starting physics')
await initPhysics()
lighting = createLighting(scene, renderer, preset)
fx = createFx(scene)
for (const key of Object.keys(bloxity.settings)) applySetting(key, bloxity.settings[key])

bloxity.loadingStep('Building the neighbourhood')
const world = buildWorld(scene)
const home = buildHome(scene)
buildHospitalExterior(scene)
bloxity.loadingStep('Building the hospital')
const rooms = buildHospitalInterior(scene)
const treadmill = createTreadmill(scene)
treadmill.setVisible(false)
const ambulance = createAmbulance(scene)
const npcPool = MOMS.bots ? createNpcPool(scene) : [] // real moms only: no bot pool to build
createPlayerBody()
syncYawToPlayer()

// Yellow waypoint disc on the ground.
const marker = new Group()
const disc = new Mesh(new CircleGeometry(1.3, 40), new MeshBasicMaterial({ color: '#ffe23a', transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }))
disc.rotation.x = -Math.PI / 2
const halo = new Mesh(new RingGeometry(1.3, 1.6, 40), new MeshBasicMaterial({ color: '#fff3a0', transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }))
halo.rotation.x = -Math.PI / 2
marker.add(disc, halo)
marker.visible = false
scene.add(marker)

// Star coin pickup model (shared geometry).
const starShape = new Shape()
for (let i = 0; i < 10; i++) {
  const r = i % 2 ? 0.13 : 0.3
  const a = (i / 10) * Math.PI * 2 + Math.PI / 2
  if (i === 0) starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r)
  else starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r)
}
starShape.closePath()
const starGeo = new ExtrudeGeometry(starShape, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 })
starGeo.translate(0, 0, -0.02)
const coinGeo = new CylinderGeometry(0.42, 0.42, 0.1, 32)
coinGeo.rotateX(Math.PI / 2)
const gold = new MeshStandardMaterial({ color: '#ffc531', metalness: 0.75, roughness: 0.25, emissive: '#5a3800', emissiveIntensity: 0.4 })
const goldDark = new MeshStandardMaterial({ color: '#e08a10', metalness: 0.7, roughness: 0.3, emissive: '#3a2000', emissiveIntensity: 0.3 })
function makeCoin() {
  const g = new Group()
  const c = new Mesh(coinGeo, gold)
  c.castShadow = true
  const s1 = new Mesh(starGeo, goldDark)
  s1.position.z = 0.06
  const s2 = new Mesh(starGeo, goldDark)
  s2.position.z = -0.06
  g.add(c, s1, s2)
  return g
}

// --- Player avatar ----------------------------------------------------------
const playerGroup = new Group()
scene.add(playerGroup)
let avatar = null
let animator = null
let generation = 0
let avatarReady = false
let game = null

function setAvatar(next) {
  if (avatar) playerGroup.remove(avatar)
  disposeAnimator(animator)
  avatar = next
  playerGroup.add(avatar)
  game?.onAvatar(avatar)
  animator = makeAnimator(avatar)
}
setAvatar(buildDefaultCharacter())

async function loadAvatar() {
  const mine = ++generation
  try {
    const equipped = bloxity.authState.user ? bloxity.getEquippedAvatar() : null
    // A worn custom character replaces the whole regular avatar; null / a failed load = regular.
    const character = await bloxity.getCharacter()
    if (mine !== generation) return
    if (character) {
      const custom = await loadCustomCharacter(character, equipped, { accessoryMatrix: bloxity.characterAccessoryMatrix })
      if (mine !== generation) return
      if (custom) return void setAvatar(custom)
    }
    const group = await loadBaseCharacter()
    if (mine !== generation) return
    await attachEquippedAccessories(group, equipped, { skinTextureUrl: bloxity.getSkinTextureUrl() })
    if (mine !== generation) return
    applyProportions(group, bloxity.authState.user ? bloxity.getProportions() : null)
    setAvatar(group)
  } finally {
    if (mine === generation) avatarReady = true
  }
}
let signedIn = null
bloxity.subscribeAuth((s) => {
  const now = !!s.user
  if (now !== signedIn) {
    signedIn = now
    loadAvatar()
  }
})
bloxity.onAvatarChanged(loadAvatar)
bloxity.onProportionsChanged(() => {
  applyProportions(avatar, bloxity.getProportions())
  game?.onAvatar(avatar)
})

const pet = buildPet()
scene.add(pet)

// --- HUD + game -------------------------------------------------------------
const hud = createHud()
bloxity.onReservedAreas((areas) => hud.setReserved(areas))
hud.setMuted(isMuted())
hud.onMute = () => {
  unlock()
  setMuted(!isMuted())
  hud.setMuted(isMuted())
  sound.click()
}

const projV = new Vector3()
function project(p) {
  projV.set(p.x, p.y, p.z).project(camera)
  const visible = projV.z < 1 && projV.z > -1 && Math.abs(projV.x) < 1.2 && Math.abs(projV.y) < 1.2
  return { x: (projV.x * 0.5 + 0.5) * window.innerWidth, y: (-projV.y * 0.5 + 0.5) * window.innerHeight, visible, dist: camera.position.distanceTo(p) }
}
const camDistTo = (p) => camera.position.distanceTo(p)

// The other real players: moms in the same rooms (remote.js). Created before the game, which hands
// them to each line.
const remote = createRemoteMoms({ scene, me: () => game?.zone() ?? 'solo', hud, project, fx })
game = createGame({ scene, camera, hud, fx, home, rooms, ambulance, treadmill, npcPool, remote, playerGroup, marker, makeCoin, project, camDistTo })
game.onAvatar(avatar)
hud.setAdCoins(ADS.reward.coins)
hud.onWatchAd = () => {
  unlock()
  sound.click()
  game.watchAd()
}
const lineBlockers = createLineBlockers() // bot moms in lines are solid: no walking through to cut ahead

// --- Multiplayer + Bloxity platform features ---------------------------------------------------
// What the others see of you (net.js sends what changed): the drawn avatar's pose + your trip.
let drawnSpeed = 0
setPresenceSource(() => {
  const g = game.presence()
  return {
    pose: { x: playerGroup.position.x, y: playerGroup.position.y, z: playerGroup.position.z, yaw: playerGroup.rotation.y, speed: drawnSpeed, grounded: game.puppet ? true : player.grounded, anim: g.anim },
    trip: g.trip,
  }
})
onTrolled((m) => game.onTrolled(m))
// Emotes from the portal's emote wheel: played on your avatar and relayed to everyone.
const emote = createEmotePlayer()
bloxity.onEmote((id) => {
  if (id) emote.play(id)
  else emote.stop()
  sendEmote(id)
})
// Chat bubbles over whoever spoke (you or a fellow mom).
let myBubble = 0
bloxity.onChat((m) => {
  if (m.mine) {
    myBubble = 4
    const a = hud.anchor('chat:me', '<div class="bubble chat"></div>', '')
    a.firstChild.textContent = m.text
    return
  }
  const p = remote.find(m.userId, m.username)
  if (p) remote.say(p, m.text)
})
const bubbleAt = new Vector3()
function placeMyBubble(dt) {
  if (myBubble <= 0) return
  myBubble -= dt
  if (myBubble <= 0) return hud.removeAnchor('chat:me')
  bubbleAt.set(playerGroup.position.x, playerGroup.position.y + 2.75, playerGroup.position.z)
  const s = project(bubbleAt)
  hud.place('chat:me', s.x, s.y, s.visible && playerGroup.visible && game.zone() !== 'solo')
}
// Ad breaks: the game pauses and goes quiet until the ad ends.
let adBreak = false
let afterAd = false
bloxity.onAdBreak((on) => {
  adBreak = on
  setAdMute(on)
  if (!on) afterAd = true // don't count the ad as game time
})
initNet()

// --- Modes + keys --------------------------------------------------------------
onModeChanged((mode) => {
  playerGroup.visible = mode !== 'player'
})
onKey('KeyV', toggleMode)
onKey('KeyN', () => lighting.toggleDayNight())
onKey('KeyE', () => game.onKey('KeyE'))
bloxity.onRespawnRequest(() => game.respawn?.())
onKey('KeyR', () => game.respawn?.())
installTouch({ mode: toggleMode })

hud.start(GAME_TITLE, () => {
  unlock()
  sound.click()
  game.start()
})

// --- Loop -------------------------------------------------------------------
const clock = new Clock()
let shownLoading = true
let readySince = 0
let stepDist = 0
const lastFeet = new Vector3()
const focus = new Vector3()

function surfaceAt(x, z) {
  if (x > ROOM.x0 - 0.5 && x < ROOM.x1 + 0.5 && z > ROOM.z0 - 0.5 && z < ROOM.z1 + 0.5) return 'wood'
  if (x > 2000) return 'tile'
  if (z > STREET.walkN[0] && z < STREET.walkS[1]) return 'concrete'
  if (Math.abs(x - home.doorX) < 1.1 && z > ROOM.z1 && z < STREET.walkN[0]) return 'concrete'
  return 'grass'
}

renderer.setAnimationLoop(() => {
  if (adBreak) return void postfx.render() // Bloxity ad break: the game pauses
  if (afterAd) {
    afterAd = false
    clock.getDelta()
  }
  tick(Math.min(clock.getDelta(), 0.1))
  postfx.render()
})

// One step of the game (the loop above; dev `__game.advance` steps it by hand while the tab isn't painting).
let elapsed = 0
function tick(dt) {
  elapsed += dt

  stepPhysics(dt)
  interpolatePlayer()

  const pz = game.puppet
  let speed = Math.hypot(player.velocity.x, player.velocity.z)
  if (pz) {
    playerGroup.position.copy(pz.pos)
    playerGroup.rotation.copy(pz.rot)
    speed = game.puppetSpeed ?? 0
  } else {
    const p = player.renderPosition
    playerGroup.position.set(p.x, p.y, p.z)
    playerGroup.rotation.set(0, player.facing, 0)
    // footsteps
    if (player.grounded && speed > 1) {
      stepDist += lastFeet.distanceTo(playerGroup.position)
      const stride = speed > 10 ? 1.9 : 1.35
      if (stepDist > stride) {
        stepDist = 0
        const surf = surfaceAt(p.x, p.z)
        sound.footstep(surf)
        if (surf === 'grass' && Math.random() < 0.5) fx.dust({ x: p.x, y: p.y, z: p.z }, { count: 2, color: '#b9d9a0', size: 0.35, speed: 0.6 })
      }
    }
  }
  lastFeet.copy(playerGroup.position)
  animator?.update(dt, {
    grounded: pz ? true : player.grounded,
    speed,
    verticalVelocity: pz ? 0 : player.velocity.y,
    turn: 0,
    pose: game.avatarInput.pose,
    overlay: game.avatarInput.overlay,
  })
  // Bloxity emote on top of the pose; moving (or a scripted pose) stops it.
  if (emote.apply(avatar, animator, dt, pz || game.avatarInput.pose ? 99 : speed + (player.grounded ? 0 : 99))) sendEmote('')
  drawnSpeed = speed
  pet.userData.update(dt, playerGroup.position, pz ? pz.rot.y : player.facing)

  // Fellow moms (before the lines, which give them their places) + the server's line order.
  remote.update(dt, camera)
  sendPresence(dt)
  wantLine(game.lineKind())
  game.update(dt, elapsed)
  lineBlockers.update([game.queue]) // after the lines moved
  placeMyBubble(dt)
  if (game.cameraMode === 'follow') updateCamera(camera, dt)
  else game.updateCamera(dt)
  document.body.classList.toggle('no-touch-controls', player.frozen || game.cameraMode !== 'follow')

  if (game.cameraMode === 'follow') focus.copy(playerGroup.position)
  else focus.copy(game.lookTarget)
  world.clouds.position.set(camera.position.x, 0, camera.position.z)
  fx.update(dt, camera, renderer.domElement.clientHeight)
  lighting.update(dt, focus)

  if (shownLoading) {
    readySince += dt
    if (avatarReady || readySince > 5) {
      shownLoading = false
      bloxity.notifyFirstFrame()
    }
  }
}

window.addEventListener('beforeunload', bloxity.teardown)

if (import.meta.env.DEV) {
  // advance(seconds): steps the game by hand (use it when the preview tab is not painting).
  const advance = (seconds) => {
    for (let t = 0; t < seconds; t += 1 / 30) tick(1 / 30)
    postfx.render()
  }
  window.__game = { player, scene, renderer, camera, game, hud, fx, rooms, ambulance, home, sound, remote, advance }
}
