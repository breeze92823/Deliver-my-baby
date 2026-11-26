// The save. Where it lives is net.js's call: a signed-in player's progress is kept on the server
// (../Deliver-my-baby-backend), a guest's (or everyone's without a server) in this browser.
// `snapshot()` is the saved shape, `hydrate(doc)` loads one; every change calls the save hook.
//
// data: coins, twins (the twins pass), babies [{ name, type, shiny? }] (oldest first, the latest
// BABIES_MAX), trips (hospital trips finished), delivered (babies delivered in total), dex (the
// Babydex: { [typeId]: { n, s } } babies of each type ever delivered / shiny, never cut like babies),
// dexClaimed (Babydex rewards taken: "t:<type>:<tier>", "r:<rarity>", "all") and pity (deliveries
// since the last Epic or better baby) and upg (permanent upgrades: { [id]: level }, upgrades.js).
import { START_COINS } from './config.js'

const KEY = 'dmb.save.v1'
const BABIES_MAX = 300 // backend constants.ts BABIES_MAX
const defaults = () => ({ coins: START_COINS, twins: false, babies: [], trips: 0, delivered: 0, dex: {}, dexClaimed: [], pity: 0, upg: {} })

const data = defaults()
const listeners = new Set()
const emit = (e) => {
  for (const fn of listeners) fn(e)
}

let onSave = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(store.snapshot()))
  } catch {
    // storage blocked: this session only
  }
}

const int = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : d)
const babyList = (v) =>
  Array.isArray(v) ? v.filter((b) => b && typeof b.name === 'string' && typeof b.type === 'string').map((b) => (b.shiny === true ? { name: b.name, type: b.type, shiny: true } : { name: b.name, type: b.type })) : []
// The Babydex as saved, topped up from the babies list (an old save has no dex; the list is the floor).
function dexFrom(v, babies) {
  const out = {}
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const [k, e] of Object.entries(v)) {
      const n = int(e?.n)
      if (n > 0 && k !== '__proto__') out[k] = { n, s: Math.min(n, int(e?.s)) }
    }
  }
  const seen = {}
  for (const b of babies) {
    const c = (seen[b.type] ||= { n: 0, s: 0 })
    c.n++
    if (b.shiny) c.s++
  }
  for (const [k, c] of Object.entries(seen)) {
    const e = (out[k] ||= { n: 0, s: 0 })
    e.n = Math.max(e.n, c.n)
    e.s = Math.max(e.s, c.s)
  }
  return out
}
// Upgrade levels by id (whole numbers above 0; upgrades.js caps them at each one's max).
function upgFrom(v) {
  const out = {}
  if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k, n] of Object.entries(v)) if (k !== '__proto__' && int(n) > 0) out[k] = int(n)
  return out
}
const claimList = (v) => (Array.isArray(v) ? [...new Set(v.filter((c) => typeof c === 'string'))] : [])

export const store = {
  data,
  KEY,
  on(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  setSaveHook(fn) {
    onSave = fn
  },
  // Call after changing `data`.
  save() {
    if (data.babies.length > BABIES_MAX) data.babies.splice(0, data.babies.length - BABIES_MAX)
    onSave()
  },
  snapshot() {
    return {
      coins: data.coins,
      twins: data.twins,
      babies: data.babies.slice(-BABIES_MAX),
      trips: data.trips,
      delivered: data.delivered,
      dex: data.dex,
      dexClaimed: data.dexClaimed,
      pity: data.pity,
      upg: data.upg,
    }
  },
  // Loads a saved doc (server or browser) over the defaults; listeners get { type: 'hydrate' }.
  hydrate(doc) {
    const d = defaults()
    const src = doc && typeof doc === 'object' ? doc : {}
    data.coins = int(src.coins, d.coins)
    data.twins = src.twins === true
    data.babies = babyList(src.babies)
    data.trips = int(src.trips)
    data.delivered = Math.max(int(src.delivered), data.babies.length)
    data.dex = dexFrom(src.dex, data.babies)
    data.dexClaimed = claimList(src.dexClaimed)
    data.pity = int(src.pity)
    data.upg = upgFrom(src.upg)
    emit({ type: 'hydrate' })
  },
  // A browser save, or null. `key` = KEY (guests / no server) or a per-account mirror (net.js).
  localLoad(key = KEY) {
    try {
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  },
  localSave(key = KEY) {
    try {
      localStorage.setItem(key, JSON.stringify(store.snapshot()))
    } catch {
      // storage blocked
    }
  },
}

// Start from this browser's save (the guest one); net.js swaps in the account's once it answers.
const local = store.localLoad()
if (local) store.hydrate(local)
