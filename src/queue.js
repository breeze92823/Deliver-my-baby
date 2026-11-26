// A waiting line along a room's serpentine path, built on the line approach of Don't Miss Your
// Flight (linepath.js, lineBlockers.js, backend lines.ts):
//  - The line is a distance `s` along the path (makePath: 0 = the back of the line at the LINE
//    STARTS HERE mat, `total` = the head of the line). Entries are front first: { player: true, s }
//    (you) and { remote, s } (the other real moms, remote.js). Like the flight game the lines hold
//    real players only (MOMS.bots false); with MOMS.bots on, { npc, s } bot moms fill in while real
//    ones are few.
//  - Bot moms shuffle forward, never closer than QUEUE.slotSpacing to the one ahead, and wait instead
//    of walking into the player (lineStepClear); they're solid (lineBlockers.js), so nobody walks
//    through the line to cut ahead.
//  - Joining (walking onto the mat) walks you along the lanes to your place (player.autoTarget, a
//    carrot that never runs far ahead): no shortcut, walking the line is the game. Pushing the stick
//    for QUEUE.leaveHold s steps you out of the line.
//  - The head of the line goes to a free spot (room.spots: the lobby's 3 check-in windows, one
//    station elsewhere) as soon as one is free (QUEUE.realGap apart; with bots one every
//    QUEUE.secondsPerPerson s). Offline you're sent when you reach the
//    head; online the server keeps the real moms' order (tickets, syncRemoteLine) and calls you
//    (lineTurn -> callMe, from 2nd / 3rd place too when enough spots are free) to the spot it hands
//    you, so two moms never get the same one.
//  - Cut Line jumps QUEUE.cutLinePlaces places (online past the real moms among them too), Kill
//    knocks out the mom right in front, Kill All everyone ahead (real moms ahead of you get knocked
//    out on their own screen: game.js relays it). NPCs chat in speech bubbles.
import { QUEUE } from './config.js'
import { makeAnimator } from './avatar/animator.js'
import { OVERLAYS, buildCharacter } from './characters.js'
import { inputState } from './input.js'
import { resetPlayer } from './player.js'
import { syncYawToPlayer } from './camera.js'
import { lineStepClear } from './lineBlockers.js'
import { angTo, lineTurn, linesOnServer, makePath, myTicket, syncRemoteLine } from './linepath.js'

const CHATTER = [
  'Do they have snacks here?',
  'Kick, kick, kick! Ouch.',
  'My feet are SO tired...',
  "I can't wait to see those cheeks!",
  "We're naming her Pickle!",
  'This line is taking forever!',
  'Is it my turn yet?!',
  "I hope it's a golden one!",
  'I already bought 40 onesies.',
  'Look at that tiny hat!',
  'Name ideas, anyone?',
  'Baby just did a backflip!',
  'Who brought the stroller?',
  'Hiccups again... 😅',
  "Pretty sure it's a dino baby.",
  'Breathe in... breathe out...',
]
// Moms further than this from the player skip the shadow pass (CLAUDE.md, Detail vs. performance).
const SHADOW_DIST = 16
const NAME_A = ['Mama', 'sunny', 'bloomy', 'cocoa', 'twinkle', 'jelly', 'honey', 'starry', 'peachy', 'bubble', 'cozy', 'lil', 'mochi', 'berry', 'sprinkle', 'pudding', 'daisy', 'luna']
const NAME_B = ['Bean', '_bump', 'Bee', '.mama', 'Tum', 'Bear', 'Pop', 'Belly', 'Moon', 'Puff', 'Sprout', 'Cakes', 'Toes', 'Waddle']

// Bot moms. Each one exposes x / y / z / active for lineBlockers.js (its model is the position).
export function createNpcPool(scene, count = 44) {
  const pool = []
  for (let i = 0; i < count; i++) {
    const name = NAME_A[(i * 7) % NAME_A.length] + NAME_B[(i * 5 + 3) % NAME_B.length] + (i % 3 === 0 ? String(10 + ((i * 37) % 89)) : '')
    const g = buildCharacter({ seed: 1000 + i * 77, belly: true, name })
    g.visible = false
    scene.add(g)
    let mesh = null
    g.traverse((o) => {
      if (o.isSkinnedMesh && !mesh) mesh = o
    })
    pool.push({
      g,
      mesh, // one merged SkinnedMesh per mom (characters.js): its shadow is switched by distance
      avatar: g.userData.avatar,
      animator: makeAnimator(g.userData.avatar),
      name,
      busy: false,
      get x() {
        return this.g.position.x
      },
      get y() {
        return this.g.position.y
      },
      get z() {
        return this.g.position.z
      },
      get active() {
        return this.g.visible && this.state === 'line'
      },
    })
  }
  return pool
}

export class Queue {
  // room: { id, path (front->back Vector3), spots [{ key, stand, face }], exitRoute }
  // ctx: { player, fx, sound, hud, remote, secondsPerPerson?, onPlayerTurn(spot, route), onLeft() }
  constructor(room, pool, count, ctx) {
    this.room = room
    this.kind = room.id // the server line + zone of this room
    this.ctx = ctx
    // Bot moms only while MOMS.bots fills in (count > 0); otherwise the line is real moms only and the
    // head goes to a spot as soon as one is free (QUEUE.realGap apart), as in Don't Miss Your Flight.
    this.hasBots = count > 0 && pool.some((n) => !n.busy)
    this.seconds = this.hasBots ? ctx.secondsPerPerson ?? QUEUE.secondsPerPerson : QUEUE.realGap
    this.path = makePath(room.path.slice().reverse().map((p) => [p.x, p.z])) // back -> front
    this.total = this.path.total
    this.line = [] // front first
    this.leaving = [] // bots walking to a spot / out the exit, or flying off after a Kill
    this.entry = null // yours while you stand in the line
    this.playerIn = false
    this.done = false // your turn: walking to / at your spot
    this.spot = null // the spot you were sent to
    this.cooldown = this.seconds * 0.6 // s until the head may go to a spot
    this.leaveHeld = 0
    this.turn = lineTurn(this.kind)
    this.bubbleT = 2
    this.bubbles = new Map()
    this.tmp = {}
    this.busy = new Set() // spot keys a bot uses
    const free = pool.filter((n) => !n.busy)
    const maxSlots = Math.floor(this.total / QUEUE.slotSpacing)
    const n = Math.min(count, free.length, maxSlots - 2)
    for (let i = 0; i < n; i++) {
      const npc = free[i]
      npc.busy = true
      npc.state = 'line'
      npc.dead = null
      npc.g.visible = true
      npc.g.rotation.set(0, 0, 0)
      npc.g.scale.setScalar(1)
      npc.overlay = Math.random() < 0.35 ? OVERLAYS.holdBelly : null
      npc.speed = 0
      const e = { npc, s: this.slotS(i) }
      this.place(npc, e.s, true)
      this.line.push(e)
    }
  }

  slotS(i) {
    return this.total - i * QUEUE.slotSpacing
  }

  place(npc, s, snap = false, dt = 0) {
    const p = this.path.at(s, this.tmp)
    npc.g.position.set(p.x, 0, p.z)
    npc.g.rotation.y = snap ? p.yaw : angTo(npc.g.rotation.y, p.yaw, dt * 7)
  }

  // --- what game.js reads -------------------------------------------------------------------
  get members() {
    return this.line
  }
  get playerIndex() {
    return this.entry ? this.line.indexOf(this.entry) : -1
  }
  // For the other moms (net trip): the spot you hold while it's your turn.
  get hold() {
    return this.done && this.spot ? this.spot.key : ''
  }
  get inLine() {
    return this.playerIn && !this.done
  }
  // Bot moms standing in the line (solid to the player, lineBlockers.js); with solidOnly false the
  // real ones too.
  lineNpcs(out, solidOnly = false) {
    for (const e of this.line) if (e.npc || (e.remote && !solidOnly)) out.push(e.npc ?? e.remote)
    return out
  }
  // About how long until your turn (or the whole line's length).
  eta() {
    const i = this.playerIn ? this.playerIndex : this.line.length
    return Math.max(0, i * this.seconds + Math.max(0, this.cooldown))
  }
  freeSpots() {
    return this.room.spots.filter((s) => !this.busy.has(s.key) && !this.ctx.remote?.held(s.key) && this.spot !== s)
  }

  // --- the player -----------------------------------------------------------------------------
  join() {
    if (this.playerIn) return
    const pp = this.ctx.player.position
    this.playerIn = true
    this.done = false
    this.entry = { player: true, s: this.path.project(pp.x, pp.z) }
    this.line.push(this.entry)
    this.leaveHeld = 0
  }
  leave() {
    const i = this.line.indexOf(this.entry)
    if (i >= 0) this.line.splice(i, 1)
    this.entry = null
    this.playerIn = false
    this.done = false
    this.ctx.player.autoTarget = null
  }
  // Your turn: off to `spot`. Called from 2nd / 3rd place (online, enough spots free): up the last
  // lane to the head of the line first.
  goToSpot(spot, place = 0) {
    const i = this.line.indexOf(this.entry)
    if (i >= 0) this.line.splice(i, 1)
    this.entry = null
    this.done = true
    this.spot = spot
    this.cooldown = this.seconds
    const head = this.path.at(this.total, {})
    const route = [this.leadOut(), { x: spot.stand.x, z: spot.stand.z }]
    if (place > 0) route.unshift({ x: head.x, z: head.z })
    this.ctx.onPlayerTurn?.(spot, route)
  }
  // Out of the head of the line: straight ahead into the open floor in front of the lanes (every
  // room's front is -Z), clear of the next mom stepping up, before heading for a spot.
  leadOut() {
    const h = this.path.at(this.total, {})
    return { x: h.x, z: h.z - 2.4 }
  }
  teleport(s) {
    const { player, fx, sound } = this.ctx
    const pp = player.position
    fx.poof?.({ x: pp.x, y: 0.4, z: pp.z })
    const p = this.path.at(s, this.tmp)
    resetPlayer({ x: p.x, y: 0.05, z: p.z }, p.yaw)
    syncYawToPlayer()
    fx.sparkle?.({ x: p.x, y: 1.4, z: p.z }, { count: 24, color: '#c8a2ff', speed: 4 })
    sound.whoosh?.(0.4)
  }

  // The entry right in front of you, if it can be knocked out (a bot, or a real mom: game.js relays it).
  victim() {
    const i = this.playerIndex
    if (i <= 0) return null
    const e = this.line[i - 1]
    if (e.npc && !e.npc.dead) return e
    if (e.remote) return e
    return null
  }
  // Knocks a bot out of the line: it spins off and poofs.
  kill(npc, delay = 0) {
    const i = this.line.findIndex((e) => e.npc === npc)
    if (i < 0) return
    this.line.splice(i, 1)
    npc.dead = { t: -delay, spin: (Math.random() - 0.5) * 14, vx: (Math.random() - 0.5) * 6, vz: (Math.random() - 0.5) * 6, vy: 9 + Math.random() * 3 }
    npc.state = 'dying'
    this.leaving.push(npc)
  }
  // Everyone ahead of you: the bots are knocked out here, the real moms are returned (game.js relays).
  killAll() {
    const i = this.playerIndex
    const ahead = this.line.slice(0, i < 0 ? this.line.length : i)
    const remotes = ahead.filter((e) => e.remote).map((e) => e.remote)
    ahead.filter((e) => e.npc).forEach((e, k) => this.kill(e.npc, k * 0.08))
    return { bots: ahead.length - remotes.length, remotes }
  }
  // Up to `n` places forward (teleported there, the ones passed shuffle back). Returns { moved, past }
  // (past = the real moms jumped, for the server's order).
  cutLine(n) {
    const i = this.playerIndex
    if (i <= 0) return { moved: 0, past: 0 }
    const to = Math.max(0, i - n)
    const past = this.line.slice(to, i).filter((e) => e.remote).length
    this.line.splice(i, 1)
    this.line.splice(to, 0, this.entry)
    this.entry.s = this.slotS(to)
    this.teleport(this.entry.s)
    return { moved: i - to, past }
  }
  // Knocked out of the line by another mom's Kill: gone from it, back to the room's entrance.
  kickOut() {
    if (!this.playerIn || this.done) return false
    this.leave()
    return true
  }

  release() {
    for (const e of this.line) if (e.npc) this.free(e.npc)
    for (const m of this.leaving) this.free(m)
    for (const key of this.bubbles.keys()) this.ctx.hud.removeAnchor(key)
    this.bubbles.clear()
    this.line = []
    this.leaving = []
    this.entry = null
    this.ctx.player.autoTarget = null
  }
  free(m) {
    m.busy = false
    m.g.visible = false
    m.state = 'idle'
  }

  // --- every frame ------------------------------------------------------------------------------
  update(dt, projector) {
    const { player, remote } = this.ctx
    const tmp = this.tmp
    const online = linesOnServer()
    // Real moms take their places in the line (online in the server's ticket order).
    if (remote) syncRemoteLine(this.line, remote.lineMembers(this.kind), this.path.project, this.total, online ? myTicket(this.kind) : undefined)

    // Bot moms shuffle forward (never closer than slotSpacing to the one ahead, and nobody walks into you).
    const pp = player.position
    const playerS = this.path.project(pp.x, pp.z)
    for (let i = 0; i < this.line.length; i++) {
      const e = this.line[i]
      if (!e.npc) continue
      const n = e.npc
      const gap = this.slotS(i) - e.s
      const speed = gap > 3 ? 3.3 : QUEUE.lineSpeed
      let ds = Math.max(-speed * dt, Math.min(gap, speed * dt))
      if (ds > 0 && i > 0) ds = Math.min(ds, Math.max(0, this.line[i - 1].s - QUEUE.slotSpacing - e.s))
      this.path.at(e.s + ds, tmp)
      if (this.playerIn && !lineStepClear(n, tmp.x, tmp.z, playerS > e.s)) ds = 0 // you're in the way: wait
      e.s += ds
      n.speed = Math.abs(ds) / Math.max(dt, 1e-4)
      this.place(n, e.s, false, dt)
      n.animator.update(dt, { grounded: true, speed: n.speed, verticalVelocity: 0, overlay: n.speed < 0.2 ? n.overlay : null })
    }

    // The head of the line goes to a free spot, one every `seconds` (online only bots are sent from
    // here: the server calls the real moms).
    this.cooldown -= dt
    const head = this.line[0]
    if (head && this.cooldown <= 0 && head.s >= this.total - 0.2) {
      const free = this.freeSpots()
      if (free.length && head.npc) {
        const spot = free[Math.floor(Math.random() * free.length)]
        this.line.shift()
        this.cooldown = this.seconds
        this.sendBot(head.npc, spot)
      } else if (free.length && head.player && !online) {
        this.goToSpot(free[Math.floor(Math.random() * free.length)])
      }
    }
    // Online the server calls you (one of the first QUEUE.callDepth with enough spots free for your
    // place; with bot moms only from the head, keeping their pace).
    if (online && this.inLine && this.cooldown <= 0 && (!this.hasBots || this.line[0] === this.entry)) {
      const i = this.line.indexOf(this.entry)
      this.turn.update(dt, this.line, this.entry, this.slotS(i), () => this.freeSpots().map((s) => s.key), (key, place) => {
        if (!this.inLine) return
        this.goToSpot(this.room.spots.find((s) => s.key === key) ?? this.room.spots[0], place)
      })
    }

    // You: the carrot runs ahead of you along the lanes, never far ahead, never past a real mom ahead.
    if (this.inLine) {
      const i = this.line.indexOf(this.entry)
      let target = this.slotS(i)
      const ahead = this.line[i - 1]
      if (ahead?.remote) target = Math.min(target, ahead.s - QUEUE.slotSpacing)
      this.entry.s = Math.max(Math.min(target, this.entry.s + QUEUE.autoSpeed * dt, playerS + 1.6), Math.min(this.entry.s, target))
      const p = this.path.at(this.entry.s, tmp)
      player.autoTarget = { x: p.x, z: p.z, speed: QUEUE.autoSpeed, facing: p.yaw }
      // Pushing the stick for a moment steps out of line.
      const pushing = Math.hypot(inputState.move.x, inputState.move.z) > 0.5
      this.leaveHeld = pushing ? this.leaveHeld + dt : 0
      if (this.leaveHeld > QUEUE.leaveHold) {
        this.leave()
        this.ctx.onLeft?.()
      }
    }

    // Bots walking to their spot, waiting there, then out the exit; or flying off after a knock-out.
    for (let k = this.leaving.length - 1; k >= 0; k--) {
      const m = this.leaving[k]
      if (m.state === 'dying') {
        const d = m.dead
        d.t += dt
        if (d.t < 0) continue
        if (!d.poofed) {
          d.poofed = true
          this.ctx.fx.poof({ x: m.g.position.x, y: 0.2, z: m.g.position.z })
          this.ctx.sound.poof()
        }
        d.vy -= 22 * dt
        m.g.position.x += d.vx * dt
        m.g.position.z += d.vz * dt
        m.g.position.y += d.vy * dt
        m.g.rotation.x += d.spin * dt
        m.g.rotation.z += d.spin * 0.6 * dt
        m.g.scale.setScalar(Math.max(0.01, 1 - d.t * 0.9))
        if (d.t > 1.1) {
          this.free(m)
          this.dropBubble(m)
          this.leaving.splice(k, 1)
        }
        continue
      }
      const goal = m.route[m.leg]
      const dx = goal.x - m.g.position.x
      const dz = goal.z - m.g.position.z
      const dist = Math.hypot(dx, dz)
      if (dist < 0.3) {
        if (m.leg === m.spotLeg && m.dwell > 0) {
          m.dwell -= dt
          m.g.rotation.y = angTo(m.g.rotation.y, m.spot.face, dt * 6)
          m.animator.update(dt, { grounded: true, speed: 0, verticalVelocity: 0 })
          if (m.dwell <= 0) this.busy.delete(m.spot.key)
          continue
        }
        if (m.leg < m.route.length - 1) m.leg++
        else {
          this.free(m)
          this.dropBubble(m)
          this.leaving.splice(k, 1)
          continue
        }
      }
      const sp = Math.min(2.6, dist * 4)
      m.g.position.x += (dx / dist) * sp * dt
      m.g.position.z += (dz / dist) * sp * dt
      m.g.rotation.y = angTo(m.g.rotation.y, Math.atan2(dx, dz), dt * 8)
      m.animator.update(dt, { grounded: true, speed: sp, verticalVelocity: 0 })
    }

    // Far moms cast no shadow (the biggest share of a line room's draw calls).
    for (const e of this.line) if (e.npc?.mesh) e.npc.mesh.castShadow = Math.hypot(e.npc.x - pp.x, e.npc.z - pp.z) < SHADOW_DIST
    for (const m of this.leaving) if (m.mesh) m.mesh.castShadow = Math.hypot(m.x - pp.x, m.z - pp.z) < SHADOW_DIST

    // Chatter
    this.bubbleT -= dt
    if (this.bubbleT <= 0 && this.line.length > 1) {
      this.bubbleT = 2.2 + Math.random() * 2.5
      const candidates = this.line.filter((e) => e.npc && !this.bubbles.has('bub' + e.npc.name))
      if (candidates.length) {
        const pi = this.playerIn ? this.playerIndex : this.line.length
        candidates.sort((a, b) => Math.abs(this.line.indexOf(a) - pi) - Math.abs(this.line.indexOf(b) - pi))
        const m = candidates[Math.floor(Math.random() * Math.min(6, candidates.length))].npc
        const key = 'bub' + m.name
        this.ctx.hud.anchor(key, `<div class="bubble">${CHATTER[Math.floor(Math.random() * CHATTER.length)]}</div>`, '')
        this.bubbles.set(key, { m, t: 3.6 })
        this.ctx.sound.bubble()
      }
    }
    for (const [key, b] of this.bubbles) {
      b.t -= dt
      if (b.t <= 0 || !b.m.g.visible) {
        this.ctx.hud.removeAnchor(key)
        this.bubbles.delete(key)
        continue
      }
      projector(key, b.m.g.position, 2.75)
    }
  }

  // A bot leaves the head of the line for `spot`, waits there, then walks out the exit.
  sendBot(npc, spot) {
    this.busy.add(spot.key)
    npc.state = 'leaving'
    npc.spot = spot
    npc.leg = 0
    npc.route = [this.leadOut(), { x: spot.stand.x + (Math.random() - 0.5) * 0.4, z: spot.stand.z }, ...this.room.exitRoute]
    npc.spotLeg = 1 // the leg that waits at the spot
    npc.dwell = QUEUE.serve
    this.leaving.push(npc)
  }
  dropBubble(m) {
    this.ctx.hud.removeAnchor('bub' + m.name)
    this.bubbles.delete('bub' + m.name)
  }
}
