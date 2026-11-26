// The Babydex: every baby type you have ever delivered (store.data.dex { [typeId]: { n, s } }), the
// collection rewards (all coins: DEX in config.js) and the pity timer. Pure save logic; the window is
// hud.dex and game.js wires the two.
//
// Rewards (claimed by key into store.data.dexClaimed, the backend's DEX_CLAIM_PATTERN):
//   "t:<type>:<tier>" - DEX.tiers[tier - 1] babies of one type (bronze / silver / gold star)
//   "r:<rarity>"      - every type of that rarity found
//   "all"             - every type found
import { DEX } from './config.js'
import { BABY_TYPES, RARITIES } from './characters.js'

export const DEX_TOTAL = BABY_TYPES.length
const NONE = Object.freeze({ n: 0, s: 0 })
export const dexEntry = (save, id) => (Object.hasOwn(save.dex, id) ? save.dex[id] : NONE)
export const dexFound = (save) => BABY_TYPES.filter((t) => dexEntry(save, t.id).n > 0).length
export const isNewType = (save, id) => dexEntry(save, id).n === 0
// Stars a type has earned (0..3).
export const starsOf = (save, id) => DEX.tiers.filter((at) => dexEntry(save, id).n >= at).length

// Every reward with its state: { key, coins, reached, claimed, ...where }.
export function dexRewards(save) {
  const out = []
  for (const t of BABY_TYPES) {
    const n = dexEntry(save, t.id).n
    DEX.tiers.forEach((at, i) => out.push({ key: `t:${t.id}:${i + 1}`, coins: DEX.tierCoins[i], reached: n >= at, type: t.id, tier: i + 1 }))
  }
  RARITIES.forEach((r, i) => {
    const row = BABY_TYPES.filter((t) => t.rarity === i)
    out.push({ key: `r:${i}`, coins: DEX.rowCoins[i], reached: row.length > 0 && row.every((t) => dexEntry(save, t.id).n > 0), rarity: i })
  })
  out.push({ key: 'all', coins: DEX.allCoins, reached: dexFound(save) === DEX_TOTAL })
  const taken = new Set(save.dexClaimed)
  for (const r of out) r.claimed = taken.has(r.key)
  return out
}
export const dexClaimable = (save) => dexRewards(save).filter((r) => r.reached && !r.claimed)

// Takes the given rewards (those reached and not yet taken); returns the coins they pay (the caller
// adds them and saves).
export function claimDex(save, keys) {
  let coins = 0
  for (const r of dexRewards(save)) {
    if (!keys.includes(r.key) || !r.reached || r.claimed) continue
    save.dexClaimed.push(r.key)
    coins += r.coins
  }
  return coins
}

// A kept baby goes into the Babydex and moves the pity timer.
export function recordBaby(save, { type, shiny }) {
  const e = Object.hasOwn(save.dex, type) ? save.dex[type] : (save.dex[type] = { n: 0, s: 0 })
  e.n++
  if (shiny) e.s++
  const t = BABY_TYPES.find((b) => b.id === type)
  save.pity = t && t.rarity >= DEX.pityRarity ? 0 : save.pity + 1
}

// Deliveries left until the pity baby (the one that will be Epic or better), at least 1.
export const pityLeft = (save, ahead = 0) => Math.max(1, DEX.pityAfter - save.pity - ahead)
// Whether the next baby (`ahead` babies after the next one, for twins) is the pity baby.
export const pityDue = (save, ahead = 0) => save.pity + ahead >= DEX.pityAfter - 1

// Everything the Babydex window draws.
export function dexView(save) {
  const rewards = dexRewards(save)
  const byKey = new Map(rewards.map((r) => [r.key, r]))
  const state = (r) => (r.claimed ? 'done' : r.reached ? 'ready' : 'locked')
  const rows = RARITIES.map((rar, i) => {
    const types = BABY_TYPES.filter((t) => t.rarity === i)
    const row = byKey.get(`r:${i}`)
    return {
      name: rar.name,
      color: rar.color,
      found: types.filter((t) => dexEntry(save, t.id).n > 0).length,
      total: types.length,
      reward: { key: row.key, coins: row.coins, state: state(row) },
      cards: types.map((t) => {
        const e = dexEntry(save, t.id)
        const ready = DEX.tiers.map((_, k) => byKey.get(`t:${t.id}:${k + 1}`)).filter((r) => r.reached && !r.claimed)
        const stars = starsOf(save, t.id)
        return {
          id: t.id,
          emoji: t.emoji,
          name: t.name,
          known: e.n > 0,
          n: e.n,
          s: e.s,
          stars,
          next: DEX.tiers[stars] ?? null,
          ready: ready.map((r) => r.key),
          readyCoins: ready.reduce((sum, r) => sum + r.coins, 0),
        }
      }),
    }
  })
  const all = byKey.get('all')
  return {
    found: dexFound(save),
    total: DEX_TOTAL,
    pityLeft: pityLeft(save),
    pityName: RARITIES[DEX.pityRarity].name,
    pityColor: RARITIES[DEX.pityRarity].color,
    rows,
    all: { key: all.key, coins: all.coins, state: state(all) },
    claimable: rewards.filter((r) => r.reached && !r.claimed).length,
  }
}
