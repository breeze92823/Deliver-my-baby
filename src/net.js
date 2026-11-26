// Colyseus link to ../Deliver-my-baby-backend (room "world"). Never throws and never blocks play:
// without a server the game runs on the browser save and the hospital is yours alone.
//
// Identity: a signed-in player sends their Bloxity game token (Legion.SDK.auth.getToken()); the
// server verifies it with Bloxity and only then loads / saves that account. Guests (and local dev
// without the SDK, `dev-...` ids the dev server trusts) play unsaved on the server.
//
// Saves: a signed-in player's progress lives on the server. On join it answers `progress` (the
// saved doc -> store.hydrate), `noProgress` (new account, guest or no database: keep the current
// state and save it) or `serverError` (the save could not be read: never overwrite it). From then on
// store.snapshot() goes up as `saveProgress` whenever it changed (at most every NET.saveEvery s, and
// when the tab hides). Guests, and everyone while the server has not answered, keep the browser
// save (localStorage) instead.
//
// Fellow moms: everyone in the room is on the roster (room.state.players, drawn by remote.js).
// This client keeps its own entry current: `pose` ~10/s, `trip` (zone / held spot / belly / babies)
// and `setAvatar` when they change, `emote` when you play one (sendPresence each frame).
//
// Lines: the server keeps their order and hands out the spots at their heads (wantLine, myTicket,
// skipLineOnServer, cutLineOnServer, callMe); `active` reports player input so an idle player is
// passed over instead of holding everyone up.
//
// Trolls: `sendTroll(id, text)` relays to everyone else (Kill / Kill All on real moms); theirs arrive
// through `onTrolled` with the sender's session. Rewarded ads: `claimAdReward(token)` -> the server
// verifies the token with Bloxity -> { ok, coins }.
import { Client } from '@colyseus/sdk'
import { DEV_MODE, NET, REMOTE, SERVER_URL } from './config.js'
import { store } from './store.js'
import { authState, canResolveServer, getPfp, getToken, launchRoomId, locateRoom, lookJson, resolveServerEndpoint, subscribeAuth, updateRoom } from './bloxity.js'

// replaced: this account joined from another tab / device (server REPLACED_REASON); no auto-rejoin
// until the player comes back to this tab (`resume`), or the two would keep evicting each other.
export const net = { room: null, connected: false, hydrated: false, you: null, replaced: false }

// --- Identity ---------------------------------------------------------------------
function storedId(key, make) {
  try {
    let id = localStorage.getItem(key)
    if (!id) localStorage.setItem(key, (id = make()))
    return id
  } catch {
    return make()
  }
}
const rand = () => Math.random().toString(36).slice(2, 8)
const GUEST = storedId('dmb.guest', () => `guest-${rand()}`)
// Dev mode (no SDK) plays as a per-browser dev id, so a local server with Mongo keeps its save.
// `?dev=<name>` picks another dev player (two tabs of one browser as two moms).
const devParam = DEV_MODE ? new URLSearchParams(location.search).get('dev')?.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20) : ''
const DEV = DEV_MODE ? (devParam ? `dev-${devParam}` : storedId('dmb.dev', () => `dev-${rand()}`)) : ''

// { userId (this browser's key for the account), username, token (proof for the server) }
function identity() {
  if (DEV) return { userId: DEV, username: `Dev ${DEV.slice(4)}`, token: '' }
  const u = authState.user
  const id = u && (u._id || u.id || u.userId || u.uid)
  if (!id) return { userId: GUEST, username: authState.guest?.displayName || authState.guest?.username || 'Guest', token: '' }
  return { userId: String(id), username: String(u.displayName || u.username || u.name || 'Player'), token: getToken() }
}
// What the server is sent: the token for accounts, a trusted dev id locally, a name for guests.
const wire = (id) => ({ token: id.token || undefined, userId: id.token ? undefined : id.userId, username: id.username, pfp: getPfp() })
const isGuestId = (id) => id.startsWith('guest-')
export const hasServer = () => !!(SERVER_URL || canResolveServer())
let sentId = ''
export const isGuest = () => isGuestId(sentId || identity().userId)
// Progress goes to the server only once it has answered for this identity (and never for guests).
const onServer = () => net.connected && net.hydrated && !isGuest()

// --- Saving -----------------------------------------------------------------------
let lastSaved = ''
let dirty = false
function send(type, payload) {
  try {
    net.room?.send(type, payload)
  } catch (err) {
    console.warn('[net] send failed', type, err)
  }
}
function serverSave() {
  const snap = JSON.stringify(store.snapshot())
  if (snap === lastSaved) return
  lastSaved = snap
  send('saveProgress', JSON.parse(snap))
}
// The browser copy: a guest's (or a serverless session's) only save, and for an account a mirror
// that brings its progress back when the server has none. Each account mirrors under its own key.
const accountKey = () => `${store.KEY}:${sentId}`
let loadedId = ''
const localKey = () => (!hasServer() || isGuest() || loadedId !== sentId ? store.KEY : accountKey())
export function saveNow() {
  dirty = false
  if (onServer()) serverSave()
  if (authState.ready || !hasServer()) store.localSave(localKey())
}
store.setSaveHook(() => {
  dirty = true
  if (!onServer()) saveNow()
  else store.localSave(localKey())
})

// Who listens for a fresh save (`progress`) or a new room (`room`).
const listeners = new Set()
export function onNetChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const changed = (what) => {
  for (const fn of listeners) fn(what)
}

const waiting = {}
function request(type, payload, answer, needHydrated = true) {
  return new Promise((resolve) => {
    if (!net.connected || (needHydrated && !net.hydrated)) return resolve({ ok: false, reason: 'offline' })
    if (waiting[answer]) return resolve({ ok: false, reason: 'busy' })
    const timer = setTimeout(() => {
      delete waiting[answer]
      resolve({ ok: false, reason: 'timeout' })
    }, NET.requestTimeout * 1000)
    waiting[answer] = (msg) => {
      clearTimeout(timer)
      delete waiting[answer]
      resolve(msg)
    }
    send(type, payload)
  })
}

// --- Rewarded ads -----------------------------------------------------------------------------
// The server checks the reward token with Bloxity: { ok, coins?, reason? }. Offline: { ok: false, reason: 'offline' }.
export const claimAdReward = (rewardToken) => request('adReward', { rewardToken }, 'adRewardResult', false)

// --- Trolls ------------------------------------------------------------------------------
// Kill on a real mom: sendTroll('kill', her session). Kill All: sendTroll('killAll', the line).
let onTroll = () => {}
export const onTrolled = (fn) => (onTroll = fn)
// The server relays one per NET.trollCooldown s and silently drops the rest: check canTroll() before charging.
let trollAt = -1e9
export const canTroll = () => net.connected && performance.now() - trollAt >= NET.trollCooldown * 1000
export function sendTroll(id, text = '') {
  if (!canTroll()) return false
  trollAt = performance.now()
  send('troll', { id, text })
  return true
}
export const mySession = () => net.room?.sessionId ?? ''
// Someone's roster entry by session (the line they stand in and their ticket).
export const rosterOf = (sid) => net.room?.state?.players?.get?.(sid) ?? null

// --- Presence (this client's roster entry) ------------------------------------------------------
// main.js hands over what to report: () => { pose: {x,y,z,yaw,speed,grounded,anim}, trip: {...} }.
let presenceSource = null
export const setPresenceSource = (fn) => (presenceSource = fn)
const sentPresence = { pose: '', trip: '', avatar: null, emote: '' }
let poseIn = 0
let tripIn = 0
let aliveIn = 0
const round = (v, k = 100) => Math.round(v * k) / k
function currentPresence() {
  try {
    const p = presenceSource?.()
    if (!p) return null
    const q = p.pose
    return { pose: { x: round(q.x), y: round(q.y), z: round(q.z), yaw: round(q.yaw, 1000), speed: round(q.speed, 10), grounded: !!q.grounded, anim: q.anim || '' }, trip: p.trip }
  } catch {
    return null
  }
}
// Every frame: sends what changed, throttled. Plus the `alive` beat: it only goes out while the game
// loop runs, so a hidden tab / stopped game turns `away` on the server and the others stop waiting
// behind this player in a line.
export function sendPresence(dt) {
  if (!net.connected) return
  aliveIn -= dt
  if (aliveIn <= 0) {
    aliveIn = REMOTE.aliveEvery
    send('alive', {})
  }
  const now = performance.now()
  if (inputAt > activeAt && now - activeAt > REMOTE.activeEvery * 1000) {
    activeAt = now
    send('active', {})
  }
  poseIn -= dt
  tripIn -= dt
  if (poseIn > 0 && tripIn > 0) return
  const p = currentPresence()
  if (!p) return
  if (poseIn <= 0) {
    poseIn = REMOTE.poseEvery
    const s = JSON.stringify(p.pose)
    if (s !== sentPresence.pose) {
      sentPresence.pose = s
      send('pose', p.pose)
    }
  }
  if (tripIn <= 0) {
    tripIn = REMOTE.tripEvery
    const s = JSON.stringify(p.trip)
    if (s !== sentPresence.trip) {
      sentPresence.trip = s
      send('trip', p.trip)
    }
    const look = lookJson()
    if (look !== sentPresence.avatar) {
      sentPresence.avatar = look
      send('setAvatar', { avatar: look })
    }
  }
}
// --- Lines (server-ordered, backend lines.ts) ----------------------------------------------------
// Online, the server keeps every room's line order (a ticket per mom, join order) and hands out the
// spots at their heads one at a time. Offline the game runs its own lines (queue.js falls back to
// the local order).
const me = () => net.room?.state?.players?.get?.(net.room.sessionId) ?? null
// (Only a server that syncs `ticket` runs the lines: an older one leaves them to this client.)
export const linesOnServer = () => net.connected && typeof me()?.ticket === 'number'
let skipped = null // { kind, until }: a Skip Line the server may not have applied yet
let calling = 0 // callMe requests in flight: no line reconcile meanwhile (the answer moves you on)
let wantSent = { kind: null, at: -1e9 }
// Each frame (main): the line this client stands in ('' = none). Keeps the server's line in step.
export function wantLine(kind) {
  if (!linesOnServer() || calling) return
  if ((me().line || '') === kind) return
  const now = performance.now()
  if (wantSent.kind === kind && now - wantSent.at < 1000) return
  wantSent = { kind, at: now }
  send(kind ? 'joinLine' : 'leaveLine', kind ? { kind } : {})
}
// This client's ticket in `kind` (Infinity = none yet: behind every real mom).
export function myTicket(kind) {
  if (skipped?.kind === kind && performance.now() < skipped.until) return -Infinity
  const p = me()
  return p && p.line === kind && p.ticket ? p.ticket : Infinity
}
function ensureJoined(kind) {
  if ((me().line || '') !== kind) {
    send('joinLine', { kind })
    wantSent = { kind, at: performance.now() }
  }
}
export function skipLineOnServer(kind) {
  if (!linesOnServer()) return
  ensureJoined(kind)
  skipped = { kind, until: performance.now() + 1500 }
  send('skipLine', { kind })
}
// Cut Line: ahead of the `past` real moms right in front of you (the bots are this client's own).
export function cutLineOnServer(kind, past) {
  if (!linesOnServer() || past < 1) return
  ensureJoined(kind)
  send('cutLine', { kind, past })
}
// Is it this client's turn in `kind`? Resolves to the spot key the server sends you to, or ''.
export async function callMe(kind, keys) {
  calling++
  try {
    const r = await request('callMe', { kind, keys }, 'called', false)
    return r?.kind === kind && typeof r.key === 'string' ? r.key : ''
  } finally {
    calling--
  }
}
// No input for a while (server `idle`): the others pass you over in lines.
export const meIdle = () => !!me()?.idle

// Player input (keys, mouse, touch) goes up as `active` every REMOTE.activeEvery s while it happens.
let inputAt = 0
let activeAt = -1e9
const touched = () => (inputAt = performance.now())

export function sendEmote(id) {
  sentPresence.emote = id || ''
  if (net.connected) send('emote', { id: sentPresence.emote })
}

// --- Connection -----------------------------------------------------------------------------
function attach(room) {
  net.room = room
  net.connected = true
  const you = (msg) => {
    if (msg?.you && typeof msg.you === 'object') net.you = msg.you
  }
  room.onMessage('progress', (doc) => {
    net.hydrated = true
    lastSaved = ''
    you(doc)
    // A reconnect under the same identity: this tab is newer than the save, so push it instead.
    if (loadedId === sentId || !doc || isGuest()) return saveNow()
    loadedId = sentId
    const { you: _you, serverTime: _t, ...save } = doc
    store.hydrate(save)
    saveNow()
    changed('progress')
  })
  room.onMessage('noProgress', (msg) => {
    net.hydrated = true
    you(msg)
    const mirror = loadedId !== sentId && !isGuest() ? store.localLoad(accountKey()) : null
    if (mirror) store.hydrate(mirror)
    loadedId = sentId
    lastSaved = ''
    saveNow()
    changed('progress')
  })
  room.onMessage('serverError', () => {
    net.hydrated = false
    console.warn('[net] the server could not read the saved progress; saving is off for this session')
  })
  room.onMessage('adRewardResult', (r) => waiting.adRewardResult?.(r))
  room.onMessage('called', (r) => waiting.called?.(r))
  room.onMessage('trolled', (m) => {
    if (typeof m?.id === 'string') onTroll({ id: m.id, from: String(m.from || 'Someone').slice(0, 32), sid: typeof m.sid === 'string' ? m.sid : '', text: String(m.text || '') })
  })
  room.onLeave((_code, reason) => {
    if (net.room !== room) return
    net.room = null
    net.connected = false
    net.hydrated = false
    sentPresence.pose = sentPresence.trip = ''
    sentPresence.avatar = null
    wantSent = { kind: null, at: -1e9 }
    activeAt = -1e9
    updateRoom('')
    if (reason === 'replaced') {
      // Playing somewhere else now. The save there is newer: load the server's when this tab takes over.
      net.replaced = true
      loadedId = ''
      changed('replaced')
      return
    }
    changed('room')
    setTimeout(connect, NET.rejoin * 1000)
  })
  changed('room')
}

let launchRoom = launchRoomId()
async function joinLaunchRoom(options) {
  const id = launchRoom
  launchRoom = ''
  if (!id) return null
  try {
    if (SERVER_URL) return { room: await new Client(SERVER_URL).joinById(id.split('~').pop(), options), relay: '' }
    const at = await locateRoom(id)
    if (at) return { room: await new Client(at.endpoint).joinById(at.roomId, options), relay: at.relayRoomId }
  } catch (err) {
    console.info('[net] the invited room is gone or full; matchmaking instead', err?.message ?? err)
  }
  return null
}
async function joinAnyRoom(options, userId) {
  if (SERVER_URL) return { room: await new Client(SERVER_URL).joinOrCreate('world', options), relay: '' }
  const { endpoint, relayRoomId } = await resolveServerEndpoint(/^(guest|dev)-/.test(userId) ? undefined : userId)
  return { room: await new Client(endpoint).joinOrCreate('world', options), relay: relayRoomId }
}

let connecting = false
let retryIn = NET.retry
async function connect() {
  if (!hasServer() || connecting || net.connected || net.replaced) return
  connecting = true
  try {
    const id = identity()
    sentId = id.userId
    const p = currentPresence()
    const look = lookJson()
    const options = { ...wire(id), ...(p && { pose: p.pose, trip: p.trip }), avatar: look }
    const { room, relay } = (await joinLaunchRoom(options)) ?? (await joinAnyRoom(options, id.userId))
    retryIn = NET.retry
    if (p) {
      sentPresence.pose = JSON.stringify(p.pose)
      sentPresence.trip = JSON.stringify(p.trip)
    }
    sentPresence.avatar = look
    attach(room)
    updateRoom(relay ? `${relay}~${room.roomId}` : room.roomId)
  } catch (err) {
    console.info(`[net] could not reach the server (retrying in ${retryIn}s); playing on the browser save`, err?.message ?? err)
    setTimeout(connect, retryIn * 1000)
    retryIn = Math.min(retryIn * 2, NET.retryMax)
  } finally {
    connecting = false
  }
}

// The player is back on a replaced tab (focus / a tap / it shows again): this one takes over.
function resume() {
  if (!net.replaced || document.hidden) return
  net.replaced = false
  changed('resumed')
  connect()
}

export function initNet() {
  window.addEventListener('pagehide', saveNow)
  window.addEventListener('focus', resume)
  window.addEventListener('pointerdown', resume, { passive: true, capture: true })
  for (const ev of ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart']) window.addEventListener(ev, touched, { passive: true, capture: true })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveNow()
    else resume()
    // Tell the others at once (the missing beats would take a few seconds).
    if (net.connected) send(document.hidden ? 'away' : 'alive', document.hidden ? { on: true } : {})
  })
  setInterval(() => dirty && saveNow(), NET.saveEvery * 1000)
  if (!hasServer()) return console.info('[net] no server configured; progress is kept in this browser')
  subscribeAuth((s) => {
    if (!s.ready) return
    if (!net.connected) return void connect()
    const id = identity()
    // Same account (a name / picture update): the token again, so the server keeps it signed in.
    if (id.userId === sentId) return send('identify', wire(id))
    // Save under the OLD identity before switching.
    saveNow()
    net.hydrated = false
    // Signed out: back to this browser's guest save (the account's progress stays on the server).
    if (isGuestId(id.userId)) {
      store.hydrate(store.localLoad(store.KEY))
      changed('progress')
    }
    sentId = id.userId
    send('identify', wire(id))
  })
}
