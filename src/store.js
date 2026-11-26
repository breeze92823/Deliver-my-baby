// The save. Where it lives is net.js's call: a signed-in player's progress is kept on the server
// (../Deliver-my-baby-backend), a guest's (or everyone's without a server) in this browser.
// `snapshot()` is the saved shape, `hydrate(doc)` loads one; every change calls the save hook.
//
// data: coins, twins (the twins pass), babies [{ name, type }] (oldest first, the latest
// BABIES_MAX), trips (hospital trips finished) and delivered (babies delivered in total).
import { START_COINS } from './config.js'

const KEY = 'dmb.save.v1'
const BABIES_MAX = 300 // backend constants.ts BABIES_MAX
const defaults = () => ({ coins: START_COINS, twins: false, babies: [], trips: 0, delivered: 0 })

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
const babyList = (v) => (Array.isArray(v) ? v.filter((b) => b && typeof b.name === 'string' && typeof b.type === 'string').map((b) => ({ name: b.name, type: b.type })) : [])

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
    return { coins: data.coins, twins: data.twins, babies: data.babies.slice(-BABIES_MAX), trips: data.trips, delivered: data.delivered }
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
