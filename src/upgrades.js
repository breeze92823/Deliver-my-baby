// Permanent upgrades (store.data.upg { [id]: level }), bought with coins only (UPGRADES in config.js)
// and kept forever. Pure save logic + the effect numbers the game reads; the shop window is
// hud.upgrades and game.js wires the two.
import { RIDE, UPGRADES } from './config.js'
import { rarityWeights, RARITIES } from './characters.js'

export const upgDef = (id) => UPGRADES.find((u) => u.id === id)
export const upgLevel = (save, id) => {
  const def = upgDef(id)
  const n = Object.hasOwn(save.upg, id) ? save.upg[id] : 0
  return def ? Math.min(def.max, n) : 0
}
// Coins for the next level (null at max). Each level costs `grow` times the last, rounded to 10.
export function upgPrice(save, id) {
  const def = upgDef(id)
  const lvl = upgLevel(save, id)
  if (!def || lvl >= def.max) return null
  return Math.round((def.base * Math.pow(def.grow, lvl)) / 10) * 10
}
// Buys the next level if affordable: the price, or 0 (the caller spends the coins and saves).
export function canBuy(save, id) {
  const p = upgPrice(save, id)
  return p != null && save.coins >= p ? p : 0
}
export function levelUp(save, id) {
  save.upg[id] = upgLevel(save, id) + 1
}
// How many upgrades the player could buy right now (the shop button's dot).
export const affordable = (save) => UPGRADES.filter((u) => canBuy(save, u.id)).length

// --- Effects ----------------------------------------------------------------------------------
const L = upgLevel
export const rideSeconds = (save, lvl = L(save, 'ambulance')) => RIDE.duration - lvl * 12
export const walkMult = (save, lvl = L(save, 'shoes')) => 1 + lvl * 0.06
export const magnetReach = (save, lvl = L(save, 'magnet')) => 1.3 + lvl * 0.5
export const waitBonus = (save, lvl = L(save, 'lullaby')) => lvl // extra coins per ride / line income tick
export const luck = (save, lvl = L(save, 'lucky')) => lvl // rollBabyType's `luck`
export const babyCoinMult = (save, lvl = L(save, 'parent')) => 1 + lvl * 0.1
export const shieldsPerTrip = (save, lvl = L(save, 'shield')) => lvl

// Chance (0..1) of an Epic or better baby at a luck level.
function epicChance(lvl) {
  const w = rarityWeights(lvl)
  const total = w.reduce((s, x) => s + x, 0)
  return w.reduce((s, x, i) => s + (i >= 3 ? x : 0), 0) / total
}
// What one level of each upgrade does, as shop text.
const EFFECT = {
  ambulance: (l) => `${rideSeconds(null, l)}s ride`,
  shoes: (l) => `+${Math.round((walkMult(null, l) - 1) * 100)}% speed`,
  magnet: (l) => `${magnetReach(null, l).toFixed(1)} m reach`,
  lullaby: (l) => `+${waitBonus(null, l)} coin per tick`,
  lucky: (l) => `${Math.round(epicChance(l) * 1000) / 10}% ${RARITIES[3].name.toLowerCase()}+`,
  parent: (l) => `+${Math.round((babyCoinMult(null, l) - 1) * 100)}% baby coins`,
  shield: (l) => `${shieldsPerTrip(null, l)} block${l === 1 ? '' : 's'} / trip`,
}

// Everything the shop window draws.
export function upgView(save) {
  return {
    coins: save.coins,
    items: UPGRADES.map((u) => {
      const lvl = upgLevel(save, u.id)
      const price = upgPrice(save, u.id)
      return {
        id: u.id,
        icon: u.icon,
        name: u.name,
        about: u.about,
        lvl,
        max: u.max,
        now: EFFECT[u.id](lvl),
        next: price == null ? null : EFFECT[u.id](lvl + 1),
        price,
        afford: price != null && save.coins >= price,
      }
    }),
  }
}
