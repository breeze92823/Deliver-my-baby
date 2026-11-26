// "Almost there" nudges: one short hint at home about the nearest goal (an upgrade you can nearly
// afford, a Babydex star or row one baby away, a badge milestone, missions left today). They take
// turns, so the same hint doesn't repeat every trip. Returns plain text or null.
import { UPGRADES, DEX } from './config.js'
import { BABY_TYPES, RARITIES, isLimited } from './characters.js'
import { dexEntry } from './dex.js'
import { upgLevel, upgPrice } from './upgrades.js'
import { missionsView } from './missions.js'

const BADGE_STEPS = [
  { at: 10, name: 'Seasoned Mom' },
  { at: 50, name: 'Baby Factory' },
  { at: 200, name: 'Legendary Mom' },
  { at: 500, name: 'Baby Boom' },
]
let turn = 0

export function nextNudge(save) {
  const all = [
    // an upgrade within 150 coins
    () => {
      let best = null
      for (const u of UPGRADES) {
        const p = upgPrice(save, u.id)
        if (p == null || p <= save.coins) continue
        if (p - save.coins <= 150 && (!best || p - save.coins < best.need)) best = { need: p - save.coins, u, lvl: upgLevel(save, u.id) + 1 }
      }
      return best && `Only ${best.need} more coins for ${best.u.icon} ${best.u.name} Lv ${best.lvl}!`
    },
    // a Babydex star one or two babies away
    () => {
      for (const t of BABY_TYPES) {
        const n = dexEntry(save, t.id).n
        const next = DEX.tiers.find((at) => at > n)
        if (n > 0 && next && next - n <= 2) return `${next - n} more ${t.emoji} ${t.name}${next - n > 1 ? 's' : ''} for a Babydex star!`
      }
      return null
    },
    // a Babydex row one type away
    () => {
      for (let r = 0; r < RARITIES.length; r++) {
        const row = BABY_TYPES.filter((t) => t.rarity === r && !isLimited(t))
        const missing = row.filter((t) => dexEntry(save, t.id).n === 0)
        if (row.length && missing.length === 1) return `Just 1 more ${RARITIES[r].name.toLowerCase()} baby to finish that Babydex row!`
      }
      return null
    },
    // a badge milestone close by
    () => {
      const b = BADGE_STEPS.find((s) => s.at > save.delivered)
      const need = b ? b.at - save.delivered : 0
      return b && need <= Math.max(2, Math.ceil(b.at * 0.1)) ? `${need} more ${need > 1 ? 'babies' : 'baby'} for the "${b.name}" badge!` : null
    },
    // missions left today
    () => {
      const left = missionsView(save).list.filter((m) => m.state === 'going').length
      return left ? `${left} daily mission${left > 1 ? 's' : ''} left today. Open 📅 Daily!` : null
    },
  ]
  for (let k = 0; k < all.length; k++) {
    const i = (turn + k) % all.length
    const text = all[i]()
    if (text) {
      turn = i + 1
      return text
    }
  }
  return null
}
