// Daily missions (MISSIONS in config.js): MISSIONS.perDay picked for each UTC day (the server's clock,
// daily.js), seeded by the day and the account so every device shows the same three. game.js reports
// what happens with track(event, n); a finished mission waits to be claimed (coins), and claiming all
// of them opens a bonus chest. Kept in the save (store.data.missions { day, ids, prog, claimed, bonus }).
import { MISSIONS } from './config.js'
import { store } from './store.js'
import { net } from './net.js'
import { today } from './daily.js'

const def = (id) => MISSIONS.pool.find((m) => m.id === id)

// A small seeded generator (mulberry32) so a day's pick is the same everywhere.
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const hash = (s) => [...String(s)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7)

// Today's missions, rolled when the day changed. Never two with the same event.
export function ensureToday() {
  const d = today()
  const cur = store.data.missions
  if (cur && cur.day === d && Array.isArray(cur.ids) && cur.ids.every(def)) return cur
  // the account id (or, for guests, the name) so friends don't all get the same three
  const rand = rng(d * 7919 + hash(net.you?.uid || net.you?.username || 'local'))
  const pool = [...MISSIONS.pool]
  const ids = []
  const events = new Set()
  while (ids.length < MISSIONS.perDay && pool.length) {
    const m = pool.splice(Math.floor(rand() * pool.length), 1)[0]
    if (events.has(m.event)) continue
    events.add(m.event)
    ids.push(m.id)
  }
  store.data.missions = { day: d, ids, prog: ids.map(() => 0), claimed: ids.map(() => false), bonus: false }
  store.save()
  return store.data.missions
}

// Something happened (`event`, n times): the missions that just finished, as their defs.
export function track(event, n = 1) {
  const m = ensureToday()
  const done = []
  m.ids.forEach((id, i) => {
    const d = def(id)
    if (d.event !== event || m.prog[i] >= d.goal) return
    m.prog[i] = Math.min(d.goal, m.prog[i] + n)
    if (m.prog[i] >= d.goal) done.push(d)
  })
  store.save()
  return done
}

// Claims mission i (finished, not yet claimed): its coins, or 0.
export function claimMission(i) {
  const m = ensureToday()
  const d = def(m.ids[i])
  if (!d || m.claimed[i] || m.prog[i] < d.goal) return 0
  m.claimed[i] = true
  store.save()
  return d.coins
}
// The bonus chest once every mission today is claimed: its coins, or 0.
export function claimBonus() {
  const m = ensureToday()
  if (m.bonus || !m.claimed.every(Boolean)) return 0
  m.bonus = true
  store.save()
  return MISSIONS.bonusCoins
}

// What can be claimed right now (the Daily button's dot counts it with the calendar).
export function missionsReady() {
  const m = ensureToday()
  let n = m.ids.filter((id, i) => !m.claimed[i] && m.prog[i] >= def(id).goal).length
  if (!m.bonus && m.claimed.every(Boolean)) n++
  return n
}

export function missionsView() {
  const m = ensureToday()
  return {
    list: m.ids.map((id, i) => {
      const d = def(id)
      return { i, text: d.text, goal: d.goal, prog: m.prog[i], coins: d.coins, state: m.claimed[i] ? 'done' : m.prog[i] >= d.goal ? 'ready' : 'going' }
    }),
    bonus: { coins: MISSIONS.bonusCoins, state: m.bonus ? 'done' : m.claimed.every(Boolean) ? 'ready' : 'locked' },
  }
}
