// The other real players, drawn as fellow moms (the Don't Miss Your Flight multiplayer, remote.js).
// Every client in the room is on the server's roster (net.room.state.players, backend presence.ts);
// each one is drawn here with her own Bloxity look (base rig + equipped cosmetics + proportions),
// the baby bump (bigger with the twins pass), the babies in her arms on the way home, her walk cycle,
// pose (sitting, on the phone, shocked, knocked out), the emote she plays, a name tag and her chat
// bubble. Positions are drawn REMOTE.delay behind real time, interpolated between the poses she
// sends ~10 a second.
//
// Where she is decides who sees her: `street` (the hospital forecourt) is shared
// by everyone there, each line room by the moms in it; `solo` (home and the walk to the ambulance,
// cutscenes, the ambulance ride, the delivery room) is drawn for nobody.
//
// The lines: a mom standing in a room's line takes a place in every client's copy of that line
// (queue.js reads `lineMembers`; online in the server's ticket order), and the spot she holds at its
// head is `held` so no one else is sent to it (an idle mom's spot isn't).
import { Group, Vector3 } from 'three'
import { MOMS, PLAYER_DIMS, REMOTE } from './config.js'
import { net } from './net.js'
import { characterAccessoryMatrix, getCharacterFor, playerInRoom, playerJoined, skinTextureUrlFor } from './bloxity.js'
import { buildDefaultCharacter, loadBaseCharacter } from './avatar/character.js'
import { applyProportions, attachEquippedAccessories } from './avatar/loader.js'
import { loadCustomCharacter } from './avatar/customCharacter.js'
import { isEquipped } from './avatar/cdn.js'
import { disposeAnimator, makeAnimator } from './avatar/animator.js'
import { OVERLAYS, POSES, buildBaby } from './characters.js'
import { attachBelly, removeBelly } from './avatar/belly.js'
import { label } from './propkit.js'
import { createEmotePlayer } from './emotes.js'

const POSE_OF = { sit: POSES.sit, phone: POSES.phone, shock: POSES.shock, ko: POSES.lie, lie: POSES.lie }
const LYING = new Set(['ko', 'lie'])
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const tagColor = (s) => (s.away || s.idle ? '#a9b2c2' : '#ffd0ec')

// me: () => the local player's zone. project(Vector3) -> { x, y, visible, dist } (main.js), hud for
// the chat bubbles, fx for the knock-out poof.
export function createRemoteMoms({ scene, me, hud, project, fx }) {
  const people = new Map() // sessionId -> mom
  const lines = {}
  const holds = new Set()
  let roomRef = null
  let clock = 0
  let hospitalCount = 0 // real moms in the line rooms (botShare)

  // name + their Babydex count (📖 types found) + (away) / (idle)
  const tagText = (s) => `${s.username || 'Mama'}${s.dex > 0 ? ` 📖${s.dex}` : ''}${s.away ? ' (away)' : s.idle ? ' (idle)' : ''}`

  // --- One mom -----------------------------------------------------------------------------------
  function create(sid, s, announce) {
    const group = new Group()
    group.rotation.order = 'YXZ'
    group.visible = false
    scene.add(group)
    const tag = label(tagText(s), 0.24, { color: tagColor(s), outline: '#2b2b3a', outlineWidth: 10 })
    tag.visible = false
    tag.renderOrder = 19
    scene.add(tag)
    const p = {
      sid,
      group,
      tag,
      tagText: tagText(s),
      avatar: null,
      animator: null,
      look: null, // the avatar JSON loaded (null = not yet)
      gen: 0,
      belly: '', // the bump drawn: '' none | 'one' | 'twins'
      carry: '', // the babies drawn ("type:Name,...")
      babies: [],
      emote: createEmotePlayer(),
      emoteId: '',
      bubble: null, // { text, t }
      // Interpolation buffer: [{ t, x, y, z, yaw, speed }]
      buf: [],
      last: '',
      // Drawn state (also what lines read).
      x: s.x,
      y: s.y,
      z: s.z,
      yaw: s.yaw,
      speed: 0,
      active: true,
      shown: false,
      uid: s.uid,
      name: s.username,
      state: s,
    }
    setAvatar(p, buildDefaultCharacter())
    loadLook(p, s.avatar)
    people.set(sid, p)
    if (announce) playerJoined(s.username)
    else playerInRoom(s.username)
    return p
  }

  function setAvatar(p, next) {
    if (p.avatar) p.group.remove(p.avatar)
    disposeAnimator(p.animator)
    p.avatar = next
    p.group.add(next)
    p.animator = makeAnimator(next)
    next.rotation.set(0, 0, 0)
    next.position.y = 0
    p.belly = '' // re-attached by draw()
  }

  async function loadLook(p, json) {
    p.look = json || ''
    const gen = ++p.gen
    let look = null
    try {
      look = json ? JSON.parse(json) : null
    } catch {
      look = null
    }
    try {
      const equipped = look?.equipped && typeof look.equipped === 'object' ? look.equipped : null
      // Her custom character (replicated as its id in `equipped`), else the regular avatar.
      if (equipped && isEquipped(equipped.characterId)) {
        const character = await getCharacterFor(equipped)
        if (gen !== p.gen || !p.active) return
        const custom = await loadCustomCharacter(character, equipped, { accessoryMatrix: characterAccessoryMatrix })
        if (gen !== p.gen || !p.active) return
        if (custom) return void setAvatar(p, custom)
      }
      const root = await loadBaseCharacter()
      if (gen !== p.gen || !p.active) return
      if (equipped) await attachEquippedAccessories(root, equipped, { skinTextureUrl: skinTextureUrlFor(equipped) })
      if (gen !== p.gen || !p.active) return
      applyProportions(root, look?.proportions ?? null)
      setAvatar(p, root)
    } catch (err) {
      console.warn('[remote] avatar load failed; default look', err)
    }
  }

  function setBabies(p, carry) {
    p.carry = carry
    for (const b of p.babies) p.group.remove(b)
    p.babies.length = 0
    if (!carry) return
    carry.split(',').forEach((item, i) => {
      const [type, name] = item.split(':')
      const shiny = type.endsWith('*') // a shiny baby's type carries a trailing "*"
      const baby = buildBaby(shiny ? type.slice(0, -1) : type, name || null, { shiny })
      baby.position.set(-0.08 + i * 0.16, 1.1 + i * 0.16, 0.5)
      baby.rotation.y = 0.15
      p.group.add(baby)
      p.babies.push(baby)
    })
  }

  function dispose(p) {
    p.active = false
    p.gen++
    disposeAnimator(p.animator)
    scene.remove(p.group, p.tag)
    p.tag.material.map?.dispose()
    p.tag.material.dispose()
    hud.removeAnchor(`chat:${p.sid}`)
  }

  // --- Sync from the roster -----------------------------------------------------------------------------
  function sync() {
    const room = net.room
    if (room !== roomRef) {
      // New room (or none): everyone is new.
      for (const p of people.values()) dispose(p)
      people.clear()
      roomRef = room
    }
    if (!room?.state?.players) return
    const seen = new Set()
    const first = !people.size && clock < 2
    room.state.players.forEach((s, sid) => {
      if (sid === room.sessionId) return
      seen.add(sid)
      let p = people.get(sid)
      if (!p) p = create(sid, s, !first)
      p.state = s
      p.uid = s.uid
      p.name = s.username
      // A new pose sample when the reported one changed.
      const key = `${s.x}|${s.y}|${s.z}|${s.yaw}|${s.speed}`
      if (key !== p.last) {
        p.last = key
        p.buf.push({ t: clock, x: s.x, y: s.y, z: s.z, yaw: s.yaw, speed: s.speed })
        if (p.buf.length > 20) p.buf.shift()
      }
    })
    for (const [sid, p] of people) {
      if (seen.has(sid)) continue
      dispose(p)
      people.delete(sid)
    }
  }

  // Position at render time (REMOTE.delay behind): between the two samples around it.
  function interpolate(p) {
    const b = p.buf
    if (!b.length) return
    const t = clock - REMOTE.delay
    while (b.length > 2 && b[1].t <= t) b.shift()
    const a = b[0]
    const c = b[1]
    if (!c || t <= a.t) {
      // Only one sample (or not yet due): ease toward the newest.
      const n = b[b.length - 1]
      const k = 0.25
      p.x += (n.x - p.x) * k
      p.y += (n.y - p.y) * k
      p.z += (n.z - p.z) * k
      p.yaw += wrap(n.yaw - p.yaw) * k
      p.speed = n.speed
      return
    }
    const k = Math.min(1, (t - a.t) / (c.t - a.t || 1))
    p.x = a.x + (c.x - a.x) * k
    p.y = a.y + (c.y - a.y) * k
    p.z = a.z + (c.z - a.z) * k
    p.yaw = a.yaw + wrap(c.yaw - a.yaw) * k
    p.speed = a.speed + (c.speed - a.speed) * k
    // Teleports (Cut Line, a room change, respawn): snap.
    if (Math.hypot(c.x - a.x, c.z - a.z) > 8) {
      p.x = c.x
      p.y = c.y
      p.z = c.z
    }
  }

  const camPos = new Vector3()
  const at = new Vector3()
  const order = []
  const animIn = { grounded: true, speed: 0, verticalVelocity: 0, turn: 0, pose: null, overlay: null }

  function draw(p, dt) {
    const s = p.state
    const g = p.group
    const lying = LYING.has(s.anim)
    g.visible = true
    g.position.set(p.x, p.y, p.z)
    g.rotation.set(lying ? -Math.PI / 2 : 0, p.yaw, 0)
    // Look changes.
    if (s.avatar !== p.look) loadLook(p, s.avatar)
    const belly = s.belly ? (s.twins ? 'twins' : 'one') : ''
    if (belly !== p.belly && p.avatar) {
      p.belly = belly
      if (belly) attachBelly(p.avatar, { twins: belly === 'twins' })
      else removeBelly(p.avatar)
    }
    if (s.carry !== p.carry) setBabies(p, s.carry)
    const text = tagText(s)
    if (text !== p.tagText) {
      p.tagText = text
      scene.remove(p.tag)
      p.tag.material.map?.dispose()
      p.tag.material.dispose()
      p.tag = label(text, 0.24, { color: tagColor(s), outline: '#2b2b3a', outlineWidth: 10 })
      p.tag.renderOrder = 19
      scene.add(p.tag)
    }
    // Animation: walk cycle + the reported pose / carrying the babies.
    animIn.grounded = s.grounded
    animIn.speed = s.anim ? 0 : p.speed
    animIn.pose = POSE_OF[s.anim] ?? null
    animIn.overlay = p.babies.length ? OVERLAYS.carry : null
    p.animator?.update(dt, animIn)
    for (const b of p.babies) b.userData.animate?.(clock) // breathing, sparkles, bubbles...
    if (s.emote !== p.emoteId) {
      p.emoteId = s.emote
      if (s.emote) p.emote.play(s.emote)
      else p.emote.stop()
    }
    p.emote.apply(p.avatar, p.animator, dt, 0) // their own client stops it on movement
  }

  function hide(p) {
    p.group.visible = false
    p.tag.visible = false
  }

  function placeBubble(p, dt, visible) {
    const key = `chat:${p.sid}`
    if (!p.bubble) return
    p.bubble.t -= dt
    if (p.bubble.t <= 0) {
      p.bubble = null
      hud.removeAnchor(key)
      return
    }
    at.set(p.x, p.y + PLAYER_DIMS.height + 0.95, p.z)
    const sc = project(at)
    hud.place(key, sc.x, sc.y, visible && sc.visible && sc.dist < 30)
  }

  return {
    // Every frame, before the lines update (they read lineMembers / held).
    update(dt, camera) {
      clock += dt
      sync()
      const mine = me()
      camera.getWorldPosition(camPos)
      for (const k in lines) lines[k].length = 0
      holds.clear()
      order.length = 0
      hospitalCount = 0
      for (const p of people.values()) {
        interpolate(p)
        const s = p.state
        if (s.zone !== 'street' && s.zone !== 'solo') hospitalCount++
        const here = mine !== 'solo' && s.zone === mine
        p.shown = here
        if (!here) {
          hide(p)
          placeBubble(p, dt, false)
          continue
        }
        // Shared lines and held spots. Away moms (their game stopped) hold nothing: nobody waits
        // behind them. Idle ones (no input for a minute) keep their place in line but hold no spot.
        if (!s.away) {
          if (s.line) (lines[s.line] ??= []).push(p)
          if (s.hold && !s.idle) holds.add(s.hold)
        }
        const d = Math.hypot(p.x - camPos.x, p.z - camPos.z)
        if (d > REMOTE.drawDist) {
          hide(p)
          placeBubble(p, dt, false)
          continue
        }
        order.push([d, p])
      }
      order.sort((a, b) => a[0] - b[0])
      for (let i = 0; i < order.length; i++) {
        const [d, p] = order[i]
        if (i >= REMOTE.maxDrawn) {
          hide(p)
          placeBubble(p, dt, false)
          continue
        }
        draw(p, dt)
        p.tag.visible = d < REMOTE.tagDist && !LYING.has(p.state.anim)
        p.tag.position.set(p.x, p.y + PLAYER_DIMS.height + 0.55, p.z)
        placeBubble(p, dt, true)
      }
    },
    // Real moms standing in `kind` line (a room id): [{ x, y, z, state }] (state.ticket = their
    // place in the server's order, state.idle = passed over).
    lineMembers: (kind) => lines[kind] ?? [],
    // Spots in use by real moms: "lobby:N", "waiting:0", ...
    held: (key) => holds.has(key),
    count: () => people.size,
    // Share of the usual bot moms a new line should get (1 = all, 0 = none): none unless MOMS.bots,
    // and then fewer the more real moms are in the hospital (none from MOMS.fullAt).
    botShare: () => (MOMS.bots ? Math.max(0, 1 - hospitalCount / Math.max(1, MOMS.fullAt)) : 0),
    get: (sid) => people.get(sid) ?? null,
    // Chat bubble over a mom: by Bloxity user id, else by name.
    find(userId, username) {
      for (const p of people.values()) if (p.shown && ((userId && p.uid === userId) || (!userId && username && p.name === username))) return p
      return null
    },
    say(p, text) {
      p.bubble = { text, t: 4 }
      const a = hud.anchor(`chat:${p.sid}`, '<div class="bubble chat"></div>', '')
      a.firstChild.textContent = text
    },
    // The poof over a mom someone just knocked out of the line (her own client does the rest).
    poof(p) {
      fx.poof({ x: p.x, y: 0.4, z: p.z })
    },
  }
}
