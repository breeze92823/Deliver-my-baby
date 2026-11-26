// Daily Reward calendar (DAILY in config.js): one more day unlocks each UTC day, up to DAILY.days;
// unlocked days stay claimable until claimed; once all are claimed the next day starts a new week.
// Signed-in players: the server's calendar (backend daily.ts, its clock, so a changed device clock
// unlocks nothing). Guests / serverless play: the same rules kept in the save (store.data.dailyLocal).
// claimDay() only says yes or no and which prize; the caller pays it out.
import { DAILY } from './config.js'
import { store } from './store.js'
import { claimDailyOnServer, dailyOnServer, onDailyState } from './net.js'

const DAY_MS = 86_400_000
const DAYS = DAILY.days.length
export const utcDay = (ms) => Math.floor(ms / DAY_MS)

let server = null // { unlocked, claimed, nextAt } from the last `daily` / `dailyResult`
let offset = 0 // server clock - this clock (ms), from the server's `serverTime`
const listeners = new Set()
export const onDailyChange = (fn) => listeners.add(fn)
const emit = () => listeners.forEach((fn) => fn())

onDailyState((m) => {
  if (!m || !Number.isInteger(m.unlocked) || !Array.isArray(m.claimed)) return
  server = { unlocked: m.unlocked, claimed: m.claimed.filter(Number.isInteger), nextAt: Number(m.nextAt) || 0 }
  if (Number.isFinite(m.serverTime)) offset = m.serverTime - Date.now()
  emit()
})

// Now / today on the server's clock when we have heard it (missions use it too).
export const nowMs = () => Date.now() + offset
export const today = () => utcDay(nowMs())

// The local calendar, rolled forward to today (same rules as the backend's rollDaily).
function localState() {
  const raw = store.data.dailyLocal
  const s = {
    day: Number.isInteger(raw?.day) ? Math.min(DAYS, Math.max(0, raw.day)) : 0,
    last: Number.isInteger(raw?.last) ? raw.last : -1,
    claimed: Array.isArray(raw?.claimed) ? raw.claimed.filter(Number.isInteger) : [],
  }
  const t = today()
  if (s.last < t) {
    if (s.day === 0 || s.claimed.length >= DAYS) {
      s.day = 1
      s.claimed = []
    } else s.day = Math.min(DAYS, s.day + 1)
    s.last = t
    store.data.dailyLocal = s
    store.save()
  }
  return s
}

// { unlocked, claimed, nextAt }: days 0..unlocked-1 can be claimed unless in `claimed`.
export function dailyState() {
  if (dailyOnServer() && server) return server
  const s = localState()
  return { unlocked: s.day, claimed: s.claimed, nextAt: (today() + 1) * DAY_MS }
}
export const dailyReady = () => {
  const s = dailyState()
  let n = 0
  for (let i = 0; i < s.unlocked; i++) if (!s.claimed.includes(i)) n++
  return n
}

// Claims day i (0-based): its DAILY.days prize, or null when it can't be claimed.
export async function claimDay(i) {
  if (dailyOnServer() && server) {
    const r = await claimDailyOnServer(i)
    return r?.ok ? DAILY.days[i] : null
  }
  const s = localState()
  if (!Number.isInteger(i) || i < 0 || i >= s.day || s.claimed.includes(i)) return null
  s.claimed.push(i)
  store.data.dailyLocal = s
  store.save()
  emit()
  return DAILY.days[i]
}

// Everything the calendar draws.
export function dailyView() {
  const s = dailyState()
  return {
    days: DAILY.days.map((d, i) => ({ i, ...d, state: s.claimed.includes(i) ? 'done' : i < s.unlocked ? 'ready' : 'locked' })),
    nextIn: Math.max(0, s.nextAt - nowMs()),
  }
}
