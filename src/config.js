// Every tunable constant lives here; the rest of src/ holds no theme values.

// --- Identity -------------------------------------------------------------
export const GAME_SLUG = 'deliver-my-baby' // slug registered on bloxity.io
export const GAME_TITLE = 'Deliver My Baby'

// Forces the Bloxity SDK and avatar CDN to be treated as unavailable (see .env.example).
export const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true'

// --- World (metres: +X east, +Z south, +Y up) -------------------------------
export const GROUND_Y = 0
export const SPAWN = { x: -1.5, y: 0.05, z: 1.5 } // beside the bed in the bedroom
export const SPAWN_FACING = Math.PI // yaw the character faces on spawn (PI = toward -Z)

// --- Player modes (modes.js) -------------------------------------------------
// 'character' = third-person chase cam with the avatar on screen.
// 'player' = first-person, the camera is the player's eyes and the avatar is hidden.
export const MODES = ['character', 'player']
export const START_MODE = 'character'

// --- Physics (physics.js, player.js) ------------------------------------------
export const PHYSICS = {
  gravity: -22, // m/s^2 for dynamic bodies and the player
  fixedStep: 1 / 60, // s per physics tick; rendering interpolates between ticks
  maxSubSteps: 5, // a long frame never runs more ticks than this
  walkSpeed: 8, // m/s
  sprintSpeed: 14, // m/s with Shift held
  accel: 70, // m/s^2 toward the target velocity on the ground
  airAccel: 22, // m/s^2 steering while airborne
  decel: 60, // m/s^2 when no key is held
  turnSpeed: 12, // rad/s the body turns toward its heading
  jumpSpeed: 8.5, // m/s
  coyoteTime: 0.1, // s after leaving a ledge a jump still counts
  jumpBuffer: 0.12, // s a jump pressed before landing is remembered
  stepHeight: 0.45, // m autostep
  maxSlope: 50, // degrees the player can walk up
  snapToGround: 0.4, // m the controller stays glued to downward steps and slopes
  pushMass: 80, // kg the character weighs when shoving crates
  killY: -6, // sank this far: respawn
}
export const PLAYER_DIMS = { radius: 0.75, height: 1.8 } // capsule the character controller moves

// --- Look ------------------------------------------------------------------
export const RENDER = { exposure: 1.0 }
export const FOG = { near: 140, far: 560 }
// The two lighting moods lighting.js blends between (key N toggles).
export const TIME_OF_DAY = {
  transition: 2.5, // s to blend day <-> night
  day: {
    zenith: '#2f8fff',
    horizon: '#bfe8ff',
    sunColor: '#fff4de',
    // Sun + hemi + env together keep the pale sand (#eed39c) near its own tan;
    // much more and ACES washes it (and the props) out to grey-white.
    sunIntensity: 2.4,
    sunElevation: 55, // degrees above the horizon
    sunAzimuth: 35, // degrees, 0 = from +Z
    hemiSky: '#e4f2ff',
    hemiGround: '#cdbfae',
    hemiIntensity: 1.05,
    envIntensity: 0.55,
    lampIntensity: 0,
    stars: 0,
    exposure: 0.95,
  },
  night: {
    zenith: '#050b22',
    horizon: '#24345e',
    sunColor: '#9fb4ff', // the moon
    sunIntensity: 0.55,
    sunElevation: 38,
    sunAzimuth: -60,
    hemiSky: '#3a4c80',
    hemiGround: '#1a1a22',
    hemiIntensity: 0.35,
    envIntensity: 0.25,
    lampIntensity: 30,
    stars: 1,
    exposure: 1.15,
  },
}
export const LIGHT = {
  shadowRange: 34, // half-width of the sun's shadow box around the player
  lampColor: '#ffb35c',
  lampDistance: 22,
}

// Default (fallback) character look, used only when player.glb cannot load.
export const CHARACTER_COLORS = { skin: '#f2c79a', suit: '#2f6fd0', hair: '#4a2f1c' }

export const MATERIAL_PBR = {
  PLAYER: { roughness: 0.7, metalness: 0 },
  GROUND: { roughness: 0.95, metalness: 0 },
}

// --- Graphics presets, picked by the Bloxity graphics_quality setting ----------
export const GRAPHICS_PRESETS = {
  Low: { shadows: false, shadowMap: 512, antialias: false, dpr: 1, bloom: false, particles: 0.35 },
  Medium: { shadows: true, shadowMap: 1024, antialias: false, dpr: 1.25, bloom: false, particles: 0.6 },
  High: { shadows: true, shadowMap: 2048, antialias: true, dpr: 2, bloom: true, particles: 1 },
  Ultra: { shadows: true, shadowMap: 4096, antialias: true, dpr: 2, bloom: true, particles: 1 },
}

// Bloom (postfx.js): only HDR-bright pixels (above threshold, linear, before
// tone mapping) glow: neon rails, waterfall, VIP gate, particles. Sunlit sand
// stays under the threshold.
export const BLOOM = { strength: 0.6, radius: 0.35, threshold: 2.0 }
// Neon materials (propkit.js): k = HDR colour multiplier with bloom on; with
// bloom off they are capped at plainMax so they stay coloured, not white.
export const NEON = { k: 3.5, plainMax: 1.2 }

// Phones and tablets default to a lighter preset when the portal sends no value,
// and any preset is capped there (a phone at DPR 3 renders 9x the pixels; bloom
// is a full-screen multi-pass blur, so it stays off on phones).
export const COARSE_POINTER = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
export const DEFAULT_GRAPHICS = COARSE_POINTER ? 'Medium' : 'High'
export const MOBILE_GRAPHICS_CAP = { dpr: 1.5, shadowMap: 1024, particles: 0.6 }

// The preset to render with on this device.
export function graphicsPreset(name) {
  const p = GRAPHICS_PRESETS[name] ?? GRAPHICS_PRESETS[DEFAULT_GRAPHICS]
  if (!COARSE_POINTER) return p
  const cap = MOBILE_GRAPHICS_CAP
  return { ...p, dpr: Math.min(p.dpr, cap.dpr), shadowMap: Math.min(p.shadowMap, cap.shadowMap), bloom: false, particles: Math.min(p.particles, cap.particles) }
}

// --- Touch controls (touch.js) --------------------------------------------------
export const TOUCH = {
  deadZone: 0.12, // fraction of the joystick radius that does nothing
  lookScale: 1.5, // touch drag pixels -> look, relative to a mouse pixel
  pinchPixelsPerNotch: 30, // finger spread change that equals one wheel notch
}

// --- Camera (camera.js) -------------------------------------------------------
export const CAMERA = {
  fov: 70,
  near: 0.2, // 0.1 left too little depth precision at range (z-fighting on far ground layers)
  far: 1200,
  startPitch: 0.32, // radians above the horizon
  minPitch: -0.35,
  maxPitch: 1.25,
  firstPersonPitch: 1.45, // |pitch| limit looking up/down in player mode
  eyeHeight: 0.92, // eye height as a fraction of player height (player mode)
  distance: 9, // resting boom length, m
  minDistance: 2.5, // wheel in past this enters player mode
  maxDistance: 26,
  followLerp: 14, // 1/s: the one smoothing stage, on the point the camera follows
  targetHeight: 1.2, // look-at point as a fraction of player height
  lookSensitivity: 0.0026, // rad per pixel of mouse movement
  zoomStep: 0.9, // m per wheel notch
  zoomEase: 12, // 1/s the zoom glides to its target
  speedFov: 6, // degrees the FOV widens at sprint speed
  speedEase: 3, // 1/s the speed framing eases in and out
  clearEase: 6, // 1/s the boom eases back out once a wall stops blocking it
}

// --- Bloxity (bloxity.js, avatar/) -------------------------------------------------
// SDK setting keys this game listens for; registering a listener makes the control
// appear in the portal's settings menu.
export const SETTINGS = {
  graphics_quality: { def: DEFAULT_GRAPHICS, type: 'enum', values: ['Low', 'Medium', 'High', 'Ultra'] },
  camera_sensitivity: { def: '1', type: 'number', min: 0.1, max: 5 },
  show_fps: { def: 'false', type: 'bool' },
  fullscreen: { def: 'false', type: 'bool' },
}

// The base rig, measured from player.glb: origin at the feet, 6.4 units tall at bind pose.
export const RIG_HEIGHT = 6.4
// Bind-pose values of the rig nodes the SDK proportions drive.
export const RIG = { armOffsetX: 2, legOffsetX: 0.6, neckOffsetY: 0.6 }
// The player's belly (avatar/belly.js), built into the avatar's own torso. Sizes are fractions of
// the torso's measured box (width w, height h) so every body / torso part gets a bump to its own scale:
// half-width = width * w, half-height = height * h, forward bulge = depth * min(w, h).
export const BELLY = {
  one: { width: 0.5, height: 0.52, depth: 0.62 },
  twins: { width: 0.56, height: 0.6, depth: 0.8 },
  centerY: 0.38, // bump centre, as a fraction of the torso height up from its bottom
  edge: 0.2, // subdivision target edge length, as a fraction of the smaller bump half-axis
  maxPasses: 8,
  minTorsoVerts: 4, // fewer vertices weighted to Spine1/Spine2 than this = no usable torso
  sphere: { one: 1.45, twins: 1.75 }, // fallback sphere radius (rig units) when no torso can be bulged
  color: '#c9d8cf', // fallback sphere colour when the torso texture can't be sampled
}
// getProportions() ranges, straight from the SDK spec; clamped before they reach the scene graph.
export const PROPORTIONS = {
  height: { def: 1, min: 0.5, max: 1.6 },
  shoulderWidth: { def: 1, min: 0.5, max: 1.5 },
  armLength: { def: 1, min: 0.05, max: 3 },
  legOffsetX: { def: 1, min: -0.7, max: 5 },
  torsoScaleX: { def: 1, min: 0.3, max: 2 },
  neckHeight: { def: 1, min: 0.94, max: 1.2 },
  headScale: { def: 1, min: 0.3, max: 2.6 },
}

// Procedural animation (avatar/animator.js), ported from Clean Leaves for Loot.
// Rotations are radians in CHARACTER space: +X swings a limb backward, +Y yaws, +Z rolls.
const deg = (d) => (d * Math.PI) / 180
export const ANIM = {
  airborneDelay: 0.07, // s off the ground before the air pose (ignores a step down a ledge)
  // Walk -> run is one cycle at two depths; phase advances with distance travelled.
  locomotion: {
    minFrequency: 0.7,
    maxFrequency: 3.6,
    strideDistance: 3.8, // m per cycle
    idleSpeed: 0.6,
    walkSpeed: 2.5,
    runSpeed: 8,
    sprintSpeed: 13,
    hipSwing: { walk: deg(22), run: deg(42), sprint: deg(56) },
    kneeBend: { walk: deg(30), run: deg(58), sprint: deg(72) },
    armSwing: { walk: deg(18), run: deg(36), sprint: deg(52) },
    elbowBend: { walk: deg(14), run: deg(44), sprint: deg(70) },
    torsoTwist: { walk: deg(4), run: deg(7), sprint: deg(9) },
    torsoLean: { walk: deg(3), run: deg(10), sprint: deg(18) },
    headCounterTwist: { walk: deg(2), run: deg(4), sprint: deg(5) },
    torsoRoll: { walk: deg(2), run: deg(3), sprint: deg(3) },
    bob: { walk: 0.03, run: 0.07, sprint: 0.09 }, // m, on the avatar root
    bankAngle: deg(9),
    bankRate: 8,
  },
  idle: {
    breathFrequency: 0.35,
    breathAmount: deg(1.8),
    breathBob: 0.007,
    basePose: {
      ArmL1: { x: deg(-4), z: deg(8) },
      ArmL2: { x: deg(12) },
      ArmR1: { x: deg(-4), z: deg(-8) },
      ArmR2: { x: deg(12) },
      LegL1: { x: deg(-4) },
      LegR1: { x: deg(4) },
    },
  },
  airborne: {
    rise: {
      LegL1: { x: deg(-38) }, LegR1: { x: deg(8) }, LegL2: { x: deg(62) }, LegR2: { x: deg(40) },
      ArmL1: { x: deg(-40), z: deg(34) }, ArmR1: { x: deg(-30), z: deg(-34) },
      ArmL2: { x: deg(30) }, ArmR2: { x: deg(30) }, Spine1: { x: deg(6) },
    },
    fall: {
      LegL1: { x: deg(-14) }, LegR1: { x: deg(10) }, LegL2: { x: deg(22) }, LegR2: { x: deg(18) },
      ArmL1: { x: deg(-70), z: deg(40) }, ArmR1: { x: deg(-60), z: deg(-40) },
      ArmL2: { x: deg(20) }, ArmR2: { x: deg(20) }, Spine1: { x: deg(-4) },
    },
    velocityReference: 8, // m/s vertical speed that reads as fully rising / falling
  },
  landing: {
    duration: 0.16,
    pose: {
      LegL1: { x: deg(-34) }, LegR1: { x: deg(-34) }, LegL2: { x: deg(58) }, LegR2: { x: deg(58) },
      ArmL1: { x: deg(-18), z: deg(20) }, ArmR1: { x: deg(-18), z: deg(-20) }, Spine1: { x: deg(14) },
    },
    bobY: -0.2,
  },
  transitions: { toLocomotion: 0.14, toAirborne: 0.12, toLanding: 0.06 }, // s to blend a pose change
}

export const FONT_FAMILY = 'Fredoka'

export function clamp(n, min, max) {
  return n < min ? min : n > max ? max : n
}

// Coerce one raw SDK string against its SETTINGS entry.
export function coerceSetting(key, raw) {
  const spec = SETTINGS[key]
  if (!spec) return raw
  const value = raw === '' || raw == null ? spec.def : raw
  if (spec.type === 'bool') return value === 'true' || value === true
  if (spec.type === 'enum') return spec.values.includes(value) ? value : spec.def
  const n = Number(value)
  return clamp(Number.isFinite(n) ? n : Number(spec.def), spec.min, spec.max)
}

// --- Game: economy, prices, timings ----------------------------------------------
// Nothing is ever sold for premium currency: every product costs in-game coins
// (earned by playing), priced a little high on purpose.
export const START_COINS = 12
export const PRICES = {
  speedUp: 15, // ambulance drives 2x faster (stacks once more to 4x at double price)
  skipToEnd: 150, // jump straight to the delivery room
  cutLine: 20, // move 5 places up the current line
  kill: 12, // knock the mom in front of you out of the line
  killAll: 120, // clear everyone ahead of you in the line
  twins: 350, // twins pass: every delivery brings two babies
  newBaby: 45, // re-roll the baby you just got
  revenge: 8, // Kill the mom who just knocked you out, wherever she is in the line
}
export const REWARDS = {
  pickup: 1, // star coins lying around
  rideTick: 1, // every RIDE.incomeEvery seconds in the ambulance
  queueTick: 1, // every QUEUE.incomeEvery seconds in a line
  answer: 2, // per dialogue answer
  breath: 3, // per good breath
  phase: 10, // finishing a phase
}
// The Babydex (dex.js, hud.dex): the baby collection book. Every reward is coins.
export const DEX = {
  shinyChance: 1 / 40, // a delivered (or re-rolled) baby is the shimmering shiny variant
  shinyCoins: 2, // a shiny baby pays this many times its type's coins
  newBonus: 2, // the first baby of a type pays this many extra times its coins
  pityAfter: 15, // at the latest every 15th delivery is Epic or better...
  pityRarity: 3, // ...this rarity (EPIC) or above
  tiers: [5, 15, 40], // babies of one type for its bronze / silver / gold star
  tierCoins: [25, 75, 200],
  rowCoins: [100, 200, 400, 800, 1500], // finding every type of a rarity (COMMON..LEGENDARY)
  allCoins: 5000, // the full Babydex
}
// Permanent upgrades (upgrades.js, hud.upgrades): coins only, never premium currency, priced a little
// high. Level 1 costs `base`, each next level `grow` times more. Their effects live in upgrades.js.
export const UPGRADES = [
  { id: 'ambulance', icon: '🚑', name: 'Turbo Ambulance', about: 'A shorter ride to the hospital', max: 5, base: 200, grow: 2.2 },
  { id: 'shoes', icon: '👟', name: 'Comfy Shoes', about: 'Walk and run faster', max: 5, base: 200, grow: 2.2 },
  { id: 'magnet', icon: '🧲', name: 'Coin Magnet', about: 'Grab star coins from further away', max: 4, base: 200, grow: 2.2 },
  { id: 'lullaby', icon: '🎵', name: 'Lullaby', about: 'More coins while you ride and wait in line', max: 5, base: 200, grow: 2.2 },
  { id: 'lucky', icon: '🍀', name: 'Lucky Charm', about: 'Better odds of rare babies', max: 5, base: 300, grow: 2.2 },
  { id: 'parent', icon: '💰', name: 'Proud Parent', about: 'More coins for every baby', max: 5, base: 200, grow: 2.2 },
  { id: 'shield', icon: '🛡️', name: 'Line Shield', about: "Shrug off other moms' Kills in line", max: 3, base: 300, grow: 2.2 },
]
// Daily Reward calendar (daily.js; the backend's daily.ts unlocks one day per UTC day, DAILY_DAYS =
// days.length). Coins only; day 7 adds a Lucky Swaddle (the next baby is Rare or better).
export const DAILY = {
  days: [
    { coins: 30 },
    { coins: 50 },
    { coins: 75 },
    { coins: 100 },
    { coins: 150 },
    { coins: 200 },
    { coins: 400, swaddles: 1 },
  ],
  swaddleRarity: 2, // RARE
}
// Daily missions (missions.js): MISSIONS.perDay picked each UTC day from the pool, the same on every
// device (seeded by the day + the account). `event` is what game.js reports (missions.track).
export const MISSIONS = {
  perDay: 3,
  bonusCoins: 150, // all of today's missions claimed
  pool: [
    { id: 'deliver2', text: 'Deliver 2 babies', event: 'baby', goal: 2, coins: 60 },
    { id: 'deliver3', text: 'Deliver 3 babies', event: 'baby', goal: 3, coins: 90 },
    { id: 'perfect5', text: 'Get 5 PERFECT breaths', event: 'perfect', goal: 5, coins: 50 },
    { id: 'stars15', text: 'Collect 15 star coins', event: 'star', goal: 15, coins: 50 },
    { id: 'rare1', text: 'Get a Rare or better baby', event: 'rare', goal: 1, coins: 80 },
    { id: 'newdex', text: 'Discover a new Babydex baby', event: 'newdex', goal: 1, coins: 100 },
    { id: 'quiz5', text: "Answer all of Dr. Bloom's questions", event: 'quizAll', goal: 1, coins: 40 },
    { id: 'nospeed', text: 'Finish a trip without Speed Up', event: 'calmTrip', goal: 1, coins: 60 },
    { id: 'cutline', text: 'Cut the line once', event: 'cutLine', goal: 1, coins: 40 },
    { id: 'upgrade', text: 'Buy an upgrade level', event: 'upgrade', goal: 1, coins: 50 },
    { id: 'decor', text: 'Buy a nursery decoration', event: 'decor', goal: 1, coins: 50 },
    { id: 'tripevent', text: 'Complete a trip event', event: 'tripEvent', goal: 1, coins: 60 },
  ],
}
// Kill balance (game.js): a knocked-out mom is protected for `grace` s back in line, gets
// `compensation` coins, and may take Revenge on whoever did it for `revengeFor` s (PRICES.revenge).
export const KILLS = { grace: 30, compensation: 15, revengeFor: 120 }
// Trip events (tripEvents.js): at most one per trip, `chance` of one at all; the first trip has none.
export const TRIP_EVENTS = {
  chance: 0.7,
  goldenStars: { coins: 5 }, // star coins on the walk to the ambulance pay this much each
  flatTire: { taps: 14, time: 7, coins: 40, penalty: 12 }, // pump taps in `time` s; miss = +penalty s ride
  greenLights: { mult: 2 }, // the ride drives this much faster for free
  rain: {},
  early: {}, // the baby's coming early: one line room is skipped
}
// The first trip is short: a quick ride and two rooms skipped, so the first baby comes in ~3 minutes.
export const FIRST_TRIP = { ride: 40, skipRooms: ['waiting', 'ultrasound'] }
// The breathing class varies per trip (breathingScene).
export const BREATHING_STYLES = [
  { name: 'Steady breathing', cycle: 4 },
  { name: 'Slow & deep', cycle: 4.8 },
  { name: 'Quick puffs', cycle: 3.1 },
]
// Nursery decorations (decor.js, built at home): coins only, kept forever.
export const DECOR = [
  { id: 'nightlight', icon: '🌙', name: 'Star Night-light', about: 'A glowing moon that softly pulses', price: 250 },
  { id: 'balloons', icon: '🎈', name: 'Balloon Bunch', about: 'Bobbing balloons by the crib', price: 300 },
  { id: 'garland', icon: '✨', name: 'Twinkle Garland', about: 'Fairy lights that twinkle on the wall', price: 400 },
  { id: 'horse', icon: '🐴', name: 'Rocking Horse', about: 'Rocks gently all by itself', price: 600 },
  { id: 'fishtank', icon: '🐠', name: 'Fish Tank', about: 'Little fish swimming laps', price: 900 },
  { id: 'train', icon: '🚂', name: 'Toy Train', about: 'Chugs around its track with a toot', price: 1500 },
]
export const RIDE = { duration: 120, speed: 17, incomeEvery: 6 } // s, m/s
// The lines (queue.js, the line approach of linepath.js): the line is a distance `s` along each
// room's serpentine path (back of the line 0, head of the line = its length). Bot moms shuffle up,
// never closer than `slotSpacing` to the one ahead; the head goes to a free spot at the front (the
// lobby's 3 windows, one station in the other rooms) and frees it `serve` s later.
export const QUEUE = {
  secondsPerPerson: 6, // s between bot moms sent from the head of a line (MOMS.bots only: the pace of a bot line)
  realGap: 0.7, // s between moms sent to the spots when the line holds real moms only
  slotSpacing: 1.15, // m between moms in line
  lineSpeed: 1.6, // m/s moms shuffle forward (3.3 to catch up a gap)
  serve: 1.6, // s a bot mom stays at the spot before leaving through the exit
  autoSpeed: 3.2, // m/s the player is walked to their place along the lanes
  joinRadius: 1.8, // m from the LINE STARTS HERE mat that joins you
  leaveHold: 1.0, // s of pushing the stick to step out of a line (short nudges keep your place)
  incomeEvery: 8,
  cutLinePlaces: 5,
  killRange: 4,
  block: { radius: 0.38, height: 1.8 }, // solid capsule around every bot mom in a line: no walking through it
  // A real mom in a line who stopped moving with free room ahead of her (`room` m past the spot she
  // could step up to) for `after` s is stalled: offline, this client drops her from its copy of the
  // line until she moves `moved` m. Away moms (tab hidden, game stopped) are dropped at once.
  stall: { after: 6, moved: 0.3, room: 1.2 },
  // Online the server keeps every line's order (join tickets, backend lines.ts) and calls the moms to
  // the spots: the first `callDepth` may be called at once (one per free spot), asked at most every
  // `callEvery` s. (Away / idle real moms are passed over.)
  callDepth: 3,
  callEvery: 0.4,
}
// Who stands in the lines (the Don't Miss Your Flight rule, its PASSENGERS): real players only.
// The staff are bots, the line moms are not. bots: true brings back bot moms that fill in while real
// ones are few (LINES of them on the first trip, scaled by remote.botShare(): none from `fullAt`
// real moms in the hospital rooms).
export const MOMS = { bots: false, fullAt: 6 }
// Bot moms per line on the first trip (MOMS.bots only; later trips vary a little).
export const LINES = { lobby: 23, waiting: 19, breathing: 18, ultrasound: 18, final: 30 }
export const BREATHING = { breaths: 8, cycle: 4, goodWindow: 0.16, perfectWindow: 0.07 } // cycle s per in+out
export const DIALOGUE = { choiceTime: 10, quizTime: 9 }
export const AUDIO = { master: 0.8, sfx: 0.9, music: 0.32, ambience: 0.6 }
export const NAMES = ['Maple', 'Biscuit', 'Peanut', 'Pickle', 'Clover', 'Waffles', 'Juniper', 'Bean', 'Poppy', 'Nugget', 'Willow', 'Sprout', 'Mochi', 'Pebble', 'Honey', 'Olive', 'Dumpling', 'Button', 'Sunny', 'Pudding']
export const HOSPITAL_NAME = 'Little Bloom Maternity'

// --- Multiplayer (net.js + remote.js) --------------------------------------------------------------
// Dev talks to a local `npm start` backend (VITE_SERVER_URL_DEV overrides); production resolves the
// Bloxity Legion endpoint through the SDK. Without a server the game plays on the browser save.
export const SERVER_URL = import.meta.env.DEV ? import.meta.env.VITE_SERVER_URL_DEV || 'ws://localhost:2567' : ''
export const NET = {
  saveEvery: 4, // s between saves while something changed
  requestTimeout: 6, // s a request (callMe, ad reward) waits for the server's answer
  retry: 3, // s before the first reconnect attempt (doubles up to retryMax)
  retryMax: 60,
  rejoin: 2, // s after a dropped room before rejoining
  trollCooldown: 1.2, // s between two Kill / Kill All relays on real moms (a little over the backend's TROLL_COOLDOWN_MS, for jitter)
  avatarMax: 8000, // longest look JSON the others are sent (backend AVATAR_MAX_LEN)
}
// The other real players are moms in the same rooms (remote.js); the staff and the line moms are bots.
export const REMOTE = {
  poseEvery: 0.1, // s between pose updates sent
  tripEvery: 0.5, // s between checks for a changed trip (zone / hold / belly / babies / look)
  delay: 0.15, // s others are drawn behind real time (smooth interpolation)
  drawDist: 70, // m: moms further away are hidden
  maxDrawn: 24, // full avatars drawn at once (the nearest)
  tagDist: 26, // m: name tags shown this close
  aliveEvery: 1, // s between `alive` beats from the game loop (no beat for 5 s = away for the others)
  activeEvery: 2, // s between `active` messages while the player gives input (none for 60 s = idle: passed over in lines)
  knockout: 2.2, // s a mom lies knocked out by another player's Kill before the death screen lets her up
}
// --- Bloxity ads (bloxity.js): rewarded ad for coins (verified by the backend), the results screen
// ad shown while you head home with the baby. Coins per ad = the backend's AD_REWARD_COINS, cooldown (s)
// = its AD_REWARD_COOLDOWN_MS: online no ad is played before it ran out (the server would refuse it).
export const ADS = {
  reward: { placement: 'free-coins', coins: 40, cooldown: 60 },
  resultsScreen: true,
}
// --- Bloxity leaderboards: the ids the backend reports to (constants.ts BOARDS). define() makes the
// portal's trophy button show them.
export const LEADERBOARDS = [
  { id: 'babies', label: 'Babies Delivered', order: 'desc', mode: 'best', format: 'number', reset: 'none' },
  { id: 'babies_week', label: 'Babies This Week', order: 'desc', mode: 'sum', format: 'number', reset: 'weekly' },
  { id: 'trips', label: 'Hospital Trips', order: 'desc', mode: 'best', format: 'number', reset: 'none' },
  { id: 'earned', label: 'Top Earners', order: 'desc', mode: 'best', format: 'compact', reset: 'none' },
  { id: 'coins', label: 'Richest Moms', order: 'desc', mode: 'latest', format: 'compact', reset: 'none' },
]
// --- Bloxity emotes (emotes.js): the portal's emote wheel; an emote stops when you move.
export const EMOTES = {
  blendIn: 0.12, // s
  stopSpeed: 0.6, // m/s of movement that cancels an emote
}
