// Procedural sound: every effect and the background music are synthesized with
// WebAudio (no sound files). The context starts on the first user gesture
// (unlock()). Buses: sfx, music, ambience -> compressor -> out. Loops (siren,
// engine, crowd, birds, phone ring) are objects with start/stop/set.
import { AUDIO } from './config.js'

let ctx = null
let out = null
let sfx = null
let music = null
let amb = null
let noiseBuf = null
let muted = false
try {
  muted = localStorage.getItem('dmb.muted') === '1'
} catch {
  // storage blocked
}

export const isMuted = () => muted
// Bloxity ad breaks (bloxity.onAdBreak) silence the game until the ad ends, whatever the mute button says.
let adMuted = false
const level = () => (muted || adMuted ? 0 : AUDIO.master)
export function setAdMute(on) {
  adMuted = !!on
  if (out) out.gain.setTargetAtTime(level(), ctx.currentTime, 0.05)
}
export function setMuted(m) {
  muted = m
  try {
    localStorage.setItem('dmb.muted', m ? '1' : '0')
  } catch {
    // storage blocked
  }
  if (out) out.gain.setTargetAtTime(level(), ctx.currentTime, 0.05)
}

export function unlock() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    return
  }
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return
  ctx = new AC()
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -14
  comp.knee.value = 12
  comp.ratio.value = 4
  out = ctx.createGain()
  out.gain.value = level()
  comp.connect(out).connect(ctx.destination)
  sfx = bus(AUDIO.sfx, comp)
  music = bus(AUDIO.music, comp)
  amb = bus(AUDIO.ambience, comp)
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
  const d = noiseBuf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) ctx.suspend().catch(() => {})
    else ctx.resume().catch(() => {})
  })
}

function bus(level, dest) {
  const g = ctx.createGain()
  g.gain.value = level
  g.connect(dest)
  return g
}

const now = () => ctx.currentTime
const ready = () => !!ctx && ctx.state !== 'closed'

// --- Building blocks -------------------------------------------------------------
function env(g, t, a, peak, d, sustain = 0, r = 0.05) {
  g.gain.cancelScheduledValues(t)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(peak, t + a)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain || 0.0001), t + a + d)
  if (sustain) g.gain.exponentialRampToValueAtTime(0.0001, t + a + d + r)
}

function osc(type, freq, t, dur, gain, dest = sfx, { a = 0.005, slide = null, detune = 0 } = {}) {
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  o.detune.value = detune
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur)
  env(g, t, a, gain, dur)
  o.connect(g).connect(dest)
  o.start(t)
  o.stop(t + a + dur + 0.05)
  return o
}

function noise(t, dur, gain, { type = 'bandpass', freq = 1000, q = 1, slide = null, a = 0.005, dest = sfx } = {}) {
  const s = ctx.createBufferSource()
  s.buffer = noiseBuf
  s.loop = true
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.setValueAtTime(freq, t)
  if (slide) f.frequency.exponentialRampToValueAtTime(slide, t + dur)
  f.Q.value = q
  const g = ctx.createGain()
  env(g, t, a, gain, dur)
  s.connect(f).connect(g).connect(dest)
  s.start(t, Math.random())
  s.stop(t + a + dur + 0.05)
}

// Bell: inharmonic partials with fast decay (phone bell, chimes).
function bell(freq, t, dur, gain, dest = sfx) {
  const ratios = [1, 2.76, 5.4, 8.93]
  const amps = [1, 0.5, 0.25, 0.12]
  ratios.forEach((r, i) => osc('sine', freq * r, t, dur / (1 + i * 0.7), gain * amps[i], dest, { a: 0.002 }))
}

// --- One-shots -------------------------------------------------------------------
export const sound = {
  click() {
    if (!ready()) return
    const t = now()
    osc('sine', 880, t, 0.06, 0.25, sfx, { slide: 1320 })
    noise(t, 0.03, 0.15, { freq: 3000, q: 2 })
  },
  pop() {
    if (!ready()) return
    const t = now()
    osc('sine', 300, t, 0.12, 0.4, sfx, { slide: 900 })
  },
  hover() {
    if (!ready()) return
    osc('sine', 1200, now(), 0.04, 0.08)
  },
  whoosh(dur = 0.6, up = true) {
    if (!ready()) return
    const t = now()
    noise(t, dur, 0.5, { freq: up ? 300 : 3000, slide: up ? 3500 : 250, q: 1.2, a: dur * 0.4 })
  },
  chime() {
    if (!ready()) return
    const t = now()
    ;[784, 988, 1175, 1568].forEach((f, i) => bell(f, t + i * 0.08, 0.9, 0.18))
  },
  sparkle() {
    if (!ready()) return
    const t = now()
    for (let i = 0; i < 6; i++) osc('sine', 1800 + Math.random() * 2200, t + i * 0.04, 0.12, 0.06)
  },
  coin(pitch = 1) {
    if (!ready()) return
    const t = now()
    osc('square', 988 * pitch, t, 0.07, 0.12, sfx, { a: 0.002 })
    osc('square', 1319 * pitch, t + 0.07, 0.25, 0.12, sfx, { a: 0.002 })
    osc('sine', 2637 * pitch, t + 0.07, 0.3, 0.06)
  },
  buy() {
    if (!ready()) return
    const t = now()
    noise(t, 0.08, 0.3, { freq: 5000, q: 3 })
    ;[1046, 1318, 1568, 2093].forEach((f, i) => bell(f, t + 0.05 + i * 0.06, 0.7, 0.15))
    osc('sine', 130, t, 0.2, 0.4, sfx, { slide: 60 })
  },
  error() {
    if (!ready()) return
    const t = now()
    osc('square', 180, t, 0.12, 0.12)
    osc('square', 140, t + 0.13, 0.2, 0.12)
  },
  phonePickup() {
    if (!ready()) return
    const t = now()
    noise(t, 0.04, 0.6, { freq: 1800, q: 4 })
    osc('sine', 220, t + 0.02, 0.08, 0.3, sfx, { slide: 120 })
    noise(t + 0.12, 0.05, 0.3, { freq: 900, q: 3 })
  },
  gasp() {
    if (!ready()) return
    const t = now()
    noise(t, 0.35, 0.5, { freq: 1400, slide: 2600, q: 3, a: 0.04 })
    noise(t, 0.35, 0.25, { freq: 700, slide: 1100, q: 5, a: 0.04 })
  },
  title() {
    if (!ready()) return
    const t = now()
    sound.whoosh(0.4)
    ;[523, 659, 784, 1046, 1318].forEach((f, i) => {
      osc('triangle', f, t + 0.25 + i * 0.07, 0.5, 0.15)
      bell(f * 2, t + 0.25 + i * 0.07, 0.5, 0.05)
    })
    osc('sine', 80, t + 0.25, 0.6, 0.5, sfx, { slide: 40 })
  },
  footstep(surface = 'wood') {
    if (!ready()) return
    const t = now()
    const v = 0.85 + Math.random() * 0.3
    if (surface === 'wood') {
      osc('sine', 120 * v, t, 0.07, 0.35, sfx, { slide: 70 })
      noise(t, 0.04, 0.18, { freq: 1600 * v, q: 2 })
    } else if (surface === 'grass') {
      noise(t, 0.09, 0.22, { freq: 2600 * v, q: 0.8, type: 'highpass' })
    } else if (surface === 'tile') {
      noise(t, 0.035, 0.25, { freq: 3200 * v, q: 3 })
      osc('sine', 180 * v, t, 0.04, 0.15)
    } else {
      noise(t, 0.06, 0.25, { freq: 900 * v, q: 1.2 })
      osc('sine', 90 * v, t, 0.05, 0.2)
    }
  },
  jump() {
    if (!ready()) return
    noise(now(), 0.12, 0.15, { freq: 600, slide: 1500, q: 1 })
  },
  doorSlam() {
    if (!ready()) return
    const t = now()
    osc('sine', 90, t, 0.3, 0.8, sfx, { slide: 40 })
    noise(t, 0.15, 0.5, { freq: 500, q: 1, type: 'lowpass' })
    noise(t + 0.02, 0.05, 0.3, { freq: 2500, q: 4 })
  },
  door() {
    if (!ready()) return
    const t = now()
    noise(t, 0.4, 0.2, { freq: 400, slide: 900, q: 6 })
    osc('sine', 70, t + 0.35, 0.2, 0.4, sfx, { slide: 45 })
  },
  beep(f = 1046) {
    if (!ready()) return
    osc('sine', f, now(), 0.09, 0.12, sfx, { a: 0.003 })
  },
  heartbeat() {
    if (!ready()) return
    const t = now()
    osc('sine', 60, t, 0.12, 0.6, sfx, { slide: 40 })
    osc('sine', 55, t + 0.18, 0.14, 0.45, sfx, { slide: 38 })
  },
  poof() {
    if (!ready()) return
    const t = now()
    noise(t, 0.45, 0.6, { freq: 2000, slide: 200, q: 0.8, type: 'lowpass' })
    osc('sine', 600, t, 0.25, 0.25, sfx, { slide: 120 })
    osc('triangle', 1200, t + 0.05, 0.3, 0.08, sfx, { slide: 2400 })
  },
  boom() {
    if (!ready()) return
    const t = now()
    osc('sine', 110, t, 0.9, 0.9, sfx, { slide: 30 })
    noise(t, 0.9, 0.7, { freq: 1200, slide: 80, q: 0.7, type: 'lowpass' })
    for (let i = 0; i < 5; i++) bell(600 + i * 220, t + 0.15 + i * 0.05, 0.4, 0.05)
  },
  bubble() {
    if (!ready()) return
    osc('sine', 500 + Math.random() * 300, now(), 0.08, 0.12, sfx, { slide: 1100 })
  },
  type() {
    if (!ready()) return
    osc('triangle', 600 + Math.random() * 200, now(), 0.025, 0.05)
  },
  tick() {
    if (!ready()) return
    osc('square', 1500, now(), 0.02, 0.05)
  },
  success() {
    if (!ready()) return
    const t = now()
    ;[659, 880, 1175].forEach((f, i) => osc('triangle', f, t + i * 0.06, 0.25, 0.18))
  },
  perfect() {
    if (!ready()) return
    const t = now()
    ;[784, 1046, 1318, 1568].forEach((f, i) => bell(f, t + i * 0.05, 0.6, 0.12))
  },
  miss() {
    if (!ready()) return
    const t = now()
    osc('sawtooth', 220, t, 0.25, 0.08, sfx, { slide: 140 })
  },
  breathIn(dur = 2) {
    if (!ready()) return
    noise(now(), dur, 0.18, { freq: 500, slide: 1400, q: 1.5, a: dur * 0.6 })
  },
  breathOut(dur = 2) {
    if (!ready()) return
    noise(now(), dur, 0.18, { freq: 1300, slide: 400, q: 1.2, a: 0.2 })
  },
  fanfare() {
    if (!ready()) return
    const t = now()
    const notes = [523, 659, 784, 1046, 784, 1046, 1318]
    const times = [0, 0.12, 0.24, 0.36, 0.56, 0.68, 0.8]
    notes.forEach((f, i) => {
      osc('square', f, t + times[i], i === notes.length - 1 ? 0.8 : 0.16, 0.08)
      osc('triangle', f / 2, t + times[i], 0.2, 0.12)
    })
    for (let i = 0; i < 12; i++) bell(1500 + Math.random() * 2500, t + 0.8 + Math.random() * 0.8, 0.5, 0.04)
  },
  cheer() {
    if (!ready()) return
    const t = now()
    for (let i = 0; i < 10; i++) noise(t + Math.random() * 0.4, 0.9, 0.12, { freq: 700 + Math.random() * 1600, q: 6, a: 0.1 })
    noise(t, 1.4, 0.2, { freq: 1500, q: 0.6, a: 0.2 })
  },
  babyCoo() {
    if (!ready()) return
    const t = now()
    const f = 420 + Math.random() * 80
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    const flt = ctx.createBiquadFilter()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(f, t)
    o.frequency.linearRampToValueAtTime(f * 1.35, t + 0.18)
    o.frequency.linearRampToValueAtTime(f * 1.1, t + 0.45)
    flt.type = 'bandpass'
    flt.frequency.value = 1300
    flt.Q.value = 2.5
    env(g, t, 0.05, 0.25, 0.45)
    o.connect(flt).connect(g).connect(sfx)
    o.start(t)
    o.stop(t + 0.6)
    osc('sine', f * 2, t, 0.45, 0.05)
  },
  push() {
    if (!ready()) return
    const t = now()
    osc('sine', 160, t, 0.15, 0.3, sfx, { slide: 90 })
    noise(t, 0.12, 0.15, { freq: 700, q: 1 })
  },
  speedUp() {
    if (!ready()) return
    const t = now()
    sound.whoosh(0.5)
    osc('sawtooth', 200, t, 0.5, 0.06, sfx, { slide: 800 })
    ;[880, 1175, 1568].forEach((f, i) => osc('triangle', f, t + 0.2 + i * 0.06, 0.2, 0.12))
  },
  reveal() {
    if (!ready()) return
    const t = now()
    noise(t, 1.2, 0.25, { freq: 400, slide: 6000, q: 1, a: 1 })
    for (let i = 0; i < 16; i++) osc('triangle', 300 + i * 60, t + i * 0.06, 0.12, 0.05)
  },
  rarity(level = 0) {
    if (!ready()) return
    const t = now()
    const base = [523, 587, 659, 740, 880][level] || 523
    ;[1, 1.25, 1.5, 2, 2.5].forEach((r, i) => bell(base * r, t + i * 0.09, 1.2, 0.12))
    if (level >= 2) sound.cheer()
  },
  // --- Upgrades ---
  // Bought a level: a rising major arpeggio that climbs higher with the level, a soft thump and shimmer.
  levelUp(level = 1) {
    if (!ready()) return
    const t = now()
    const base = 523 * Math.pow(2, Math.min(level - 1, 6) / 12)
    ;[1, 1.26, 1.5, 2].forEach((r, i) => osc('triangle', base * r, t + i * 0.07, 0.22, 0.14, sfx, { a: 0.004 }))
    bell(base * 3, t + 0.3, 1.1, 0.12)
    osc('sine', 110, t, 0.25, 0.35, sfx, { slide: 55 })
    noise(t + 0.28, 0.5, 0.08, { freq: 7000, q: 0.8, a: 0.05 })
  },
  // Coin Magnet pulling a coin in: a short rising zip.
  magnet() {
    if (!ready()) return
    const t = now()
    osc('sine', 500, t, 0.14, 0.07, sfx, { slide: 1600 })
    noise(t, 0.12, 0.06, { freq: 1500, slide: 5000, q: 4 })
  },
  // Lullaby paying out: two soft music-box notes from a pentatonic lullaby.
  lullaby(step = 0) {
    if (!ready()) return
    const t = now()
    const tune = [784, 659, 698, 587, 659, 523, 587, 659]
    bell(tune[step % tune.length], t, 0.9, 0.07)
    bell(tune[(step + 1) % tune.length] / 2, t + 0.16, 1.1, 0.05)
  },
  // Turbo Ambulance kicking in at the start of the ride: a low engine swell and a bright rev.
  turbo(level = 1) {
    if (!ready()) return
    const t = now()
    osc('sawtooth', 70, t, 0.8, 0.05, sfx, { slide: 140 + level * 30, a: 0.2 })
    noise(t, 0.7, 0.12, { freq: 200, slide: 1800, q: 1.5, a: 0.3 })
    osc('triangle', 660, t + 0.5, 0.25, 0.08, sfx, { slide: 990 })
  },
  // Lucky Charm glinting at a reveal: a sparkling downward run.
  lucky() {
    if (!ready()) return
    const t = now()
    ;[2093, 1760, 1568, 1319, 1175].forEach((f, i) => bell(f, t + i * 0.05, 0.5, 0.06))
  },
  // Line Shield raising its bubble, then popping as it eats the Kill.
  shield() {
    if (!ready()) return
    const t = now()
    osc('sine', 300, t, 0.35, 0.18, sfx, { slide: 900, a: 0.02 })
    ;[1319, 1661, 1976].forEach((f, i) => bell(f, t + 0.06 + i * 0.05, 0.8, 0.08))
    noise(t, 0.3, 0.08, { freq: 2500, slide: 6000, q: 2, a: 0.08 })
  },
  // The nursery toy train's whistle: two soft square-wave notes with a breathy chuff.
  toot() {
    if (!ready()) return
    const t = now()
    osc('square', 784, t, 0.18, 0.05, sfx, { a: 0.02 })
    osc('square', 988, t, 0.18, 0.04, sfx, { a: 0.02 })
    osc('square', 784, t + 0.24, 0.3, 0.05, sfx, { a: 0.02 })
    noise(t, 0.4, 0.05, { freq: 3000, q: 0.7, a: 0.05 })
  },
  // A trip event starts: a bright two-tone sting.
  event() {
    if (!ready()) return
    const t = now()
    ;[660, 880, 1175].forEach((f, i) => osc('triangle', f, t + i * 0.08, 0.2, 0.12, sfx, { a: 0.005 }))
    bell(1760, t + 0.26, 0.8, 0.08)
  },
  // Another mom's rare baby: a soft announcement chime.
  announce() {
    if (!ready()) return
    const t = now()
    ;[1047, 1319, 1568].forEach((f, i) => bell(f, t + i * 0.1, 0.9, 0.08))
  },
  // Rain on the street (a trip event): one patter burst; called every so often while it rains.
  rain() {
    if (!ready()) return
    const t = now()
    noise(t, 1.6, 0.05, { type: 'highpass', freq: 2500, q: 0.4, a: 0.4 })
  },
  shieldPop() {
    if (!ready()) return
    const t = now()
    osc('sine', 900, t, 0.08, 0.25, sfx, { slide: 250 })
    noise(t, 0.12, 0.2, { freq: 3500, q: 1.5 })
  },
}

// --- Loops -----------------------------------------------------------------------

// Old-school phone bell: two bell tones hammered at 20 Hz, ring-ring pattern.
export function phoneRing() {
  let timer = null
  let on = false
  function burst() {
    if (!ready()) return
    const t = now()
    for (let r = 0; r < 2; r++) {
      const start = t + r * 0.55
      for (let i = 0; i < 9; i++) {
        bell(1100, start + i * 0.045, 0.12, 0.09)
        bell(1450, start + i * 0.045 + 0.02, 0.1, 0.06)
      }
    }
  }
  return {
    start() {
      if (on) return
      on = true
      burst()
      timer = setInterval(burst, 1700)
    },
    stop() {
      on = false
      clearInterval(timer)
    },
  }
}

// Two-tone ambulance siren. `muffle` (0..1) lowpasses it (heard from inside),
// `level` scales volume (distance).
export function siren() {
  let nodes = null
  return {
    start() {
      if (!ready() || nodes) return
      const o = ctx.createOscillator()
      const o2 = ctx.createOscillator()
      const lfo = ctx.createOscillator()
      const lfoGain = ctx.createGain()
      const f = ctx.createBiquadFilter()
      const g = ctx.createGain()
      o.type = 'sawtooth'
      o2.type = 'square'
      o.frequency.value = 760
      o2.frequency.value = 762
      lfo.type = 'square'
      lfo.frequency.value = 0.9
      lfoGain.gain.value = 140
      lfo.connect(lfoGain)
      lfoGain.connect(o.frequency)
      lfoGain.connect(o2.frequency)
      f.type = 'lowpass'
      f.frequency.value = 3000
      g.gain.value = 0
      o.connect(f)
      o2.connect(f)
      f.connect(g).connect(sfx)
      o.start()
      o2.start()
      lfo.start()
      nodes = { o, o2, lfo, f, g }
    },
    set(level, muffle = 0) {
      if (!nodes) return
      nodes.g.gain.setTargetAtTime(level * 0.09, now(), 0.1)
      nodes.f.frequency.setTargetAtTime(3000 - muffle * 2500, now(), 0.1)
    },
    stop() {
      if (!nodes) return
      const n = nodes
      nodes = null
      n.g.gain.setTargetAtTime(0, now(), 0.15)
      setTimeout(() => {
        n.o.stop()
        n.o2.stop()
        n.lfo.stop()
      }, 800)
    },
  }
}

// Engine rumble + road noise; set(speed01, inside).
export function engine() {
  let n = null
  return {
    start() {
      if (!ready() || n) return
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = 45
      const of = ctx.createBiquadFilter()
      of.type = 'lowpass'
      of.frequency.value = 220
      const og = ctx.createGain()
      og.gain.value = 0
      const s = ctx.createBufferSource()
      s.buffer = noiseBuf
      s.loop = true
      const sf = ctx.createBiquadFilter()
      sf.type = 'lowpass'
      sf.frequency.value = 500
      const sg = ctx.createGain()
      sg.gain.value = 0
      o.connect(of).connect(og).connect(sfx)
      s.connect(sf).connect(sg).connect(sfx)
      o.start()
      s.start()
      n = { o, og, s, sg, sf }
    },
    set(speed, level = 1) {
      if (!n) return
      const t = now()
      n.o.frequency.setTargetAtTime(40 + speed * 45, t, 0.3)
      n.og.gain.setTargetAtTime(level * (0.18 + speed * 0.12), t, 0.3)
      n.sg.gain.setTargetAtTime(level * speed * 0.12, t, 0.3)
      n.sf.frequency.setTargetAtTime(300 + speed * 600, t, 0.3)
    },
    stop() {
      if (!n) return
      const k = n
      n = null
      k.og.gain.setTargetAtTime(0, now(), 0.2)
      k.sg.gain.setTargetAtTime(0, now(), 0.2)
      setTimeout(() => {
        k.o.stop()
        k.s.stop()
      }, 1000)
    },
  }
}

// Ambience beds: 'outdoor' (birds + breeze), 'indoor' (room tone + crowd murmur), 'none'.
let ambNodes = []
let ambTimer = null
let ambKind = 'none'
export function setAmbience(kind) {
  if (!ready() || kind === ambKind) return
  ambKind = kind
  for (const nd of ambNodes) {
    nd.g.gain.setTargetAtTime(0, now(), 0.4)
    setTimeout(() => nd.s.stop(), 1500)
  }
  ambNodes = []
  clearInterval(ambTimer)
  if (kind === 'none') return
  const bed = (freq, q, level, type = 'lowpass') => {
    const s = ctx.createBufferSource()
    s.buffer = noiseBuf
    s.loop = true
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.value = 0
    g.gain.setTargetAtTime(level, now(), 0.8)
    s.connect(f).connect(g).connect(amb)
    s.start(0, Math.random())
    ambNodes.push({ s, g })
  }
  if (kind === 'outdoor') {
    bed(400, 0.5, 0.06)
    ambTimer = setInterval(() => {
      if (Math.random() < 0.55) chirp()
    }, 900)
  } else if (kind === 'indoor') {
    bed(250, 0.6, 0.05)
    bed(700, 3, 0.03, 'bandpass') // murmur band
    ambTimer = setInterval(() => {
      if (Math.random() < 0.5) murmur()
    }, 700)
  } else if (kind === 'room') {
    bed(200, 0.5, 0.04)
  }
}

function chirp() {
  const t = now()
  const base = 2600 + Math.random() * 1800
  const count = 2 + Math.floor(Math.random() * 4)
  for (let i = 0; i < count; i++) {
    const s = t + i * (0.09 + Math.random() * 0.05)
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(base, s)
    o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.5), s + 0.05)
    o.frequency.exponentialRampToValueAtTime(base * 0.8, s + 0.08)
    env(g, s, 0.005, 0.05, 0.08)
    o.connect(g).connect(amb)
    o.start(s)
    o.stop(s + 0.12)
  }
}

function murmur() {
  // a few formant-filtered syllables, far away
  const t = now()
  const syl = 2 + Math.floor(Math.random() * 4)
  const f0 = 140 + Math.random() * 120
  for (let i = 0; i < syl; i++) {
    const s = t + i * 0.13
    const o = ctx.createOscillator()
    const f = ctx.createBiquadFilter()
    const g = ctx.createGain()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(f0 * (0.9 + Math.random() * 0.25), s)
    f.type = 'bandpass'
    f.frequency.value = 500 + Math.random() * 900
    f.Q.value = 4
    env(g, s, 0.02, 0.025, 0.12)
    o.connect(f).connect(g).connect(amb)
    o.start(s)
    o.stop(s + 0.16)
  }
}

// --- Music ------------------------------------------------------------------------
// A gentle procedural loop per mood: soft chord pad + bass + pentatonic pluck
// melody, scheduled ahead with a lookahead timer.
const MOODS = {
  home: { bpm: 96, root: 60, prog: [0, 5, 9, 7], scale: [0, 2, 4, 7, 9], level: 1 },
  ride: { bpm: 128, root: 62, prog: [0, 7, 9, 5], scale: [0, 2, 4, 7, 9], level: 0.85 },
  hospital: { bpm: 104, root: 65, prog: [0, 9, 5, 7], scale: [0, 2, 4, 7, 9], level: 0.9 },
  tense: { bpm: 120, root: 57, prog: [0, 8, 3, 10], scale: [0, 3, 5, 7, 10], level: 0.9 },
  celebrate: { bpm: 132, root: 67, prog: [0, 5, 7, 5], scale: [0, 2, 4, 7, 9], level: 1 },
  calm: { bpm: 70, root: 60, prog: [0, 9, 5, 7], scale: [0, 2, 4, 7, 9], level: 0.8 },
}
let mood = null
let musicTimer = null
let nextBeat = 0
let beatIndex = 0
let musicGain = null
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12)

export function setMusic(name) {
  if (!ready()) return
  if (name === mood) return
  const prev = musicGain
  if (prev) {
    prev.gain.setTargetAtTime(0, now(), 0.4)
    setTimeout(() => prev.disconnect(), 2000)
  }
  clearInterval(musicTimer)
  mood = name
  if (!name || !MOODS[name]) {
    musicGain = null
    return
  }
  musicGain = ctx.createGain()
  musicGain.gain.value = 0
  musicGain.gain.setTargetAtTime(MOODS[name].level, now(), 0.6)
  musicGain.connect(music)
  nextBeat = now() + 0.1
  beatIndex = 0
  const g = musicGain
  musicTimer = setInterval(() => schedule(MOODS[name], g), 50)
}

function schedule(m, dest) {
  const spb = 60 / m.bpm / 2 // eighth notes
  while (nextBeat < now() + 0.2) {
    const bar = Math.floor(beatIndex / 8) % m.prog.length
    const step = beatIndex % 8
    const chordRoot = m.root + m.prog[bar]
    const t = nextBeat
    if (step === 0) {
      // pad chord
      for (const iv of [0, 4, 7]) {
        const third = m.scale.includes(3) && iv === 4 ? 3 : iv
        padNote(midi(chordRoot + third - 12), t, spb * 8, 0.035, dest)
      }
      pluck(midi(chordRoot - 24), t, spb * 2, 0.12, dest, 'triangle')
    }
    if (step === 4) pluck(midi(chordRoot - 24 + 7), t, spb * 2, 0.09, dest, 'triangle')
    // melody: deterministic-ish pattern from the beat index
    const hash = Math.sin(beatIndex * 12.9898 + bar * 78.233) * 43758.5453
    const r = hash - Math.floor(hash)
    if (r < 0.55 && step % 2 === 0) {
      const deg = m.scale[Math.floor(r * 10) % m.scale.length]
      const oct = r < 0.2 ? 12 : 0
      pluck(midi(m.root + deg + oct), t, spb * 1.6, 0.06, dest, 'sine')
      pluck(midi(m.root + deg + oct + 12), t, spb * 0.8, 0.015, dest, 'sine')
    }
    if (step % 2 === 1) hat(t, dest)
    nextBeat += spb
    beatIndex++
  }
}

function pluck(freq, t, dur, gain, dest, type) {
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.value = freq
  env(g, t, 0.005, gain, dur)
  o.connect(g).connect(dest)
  o.start(t)
  o.stop(t + dur + 0.1)
}

function padNote(freq, t, dur, gain, dest) {
  for (const det of [-7, 7]) {
    const o = ctx.createOscillator()
    const f = ctx.createBiquadFilter()
    const g = ctx.createGain()
    o.type = 'sawtooth'
    o.frequency.value = freq
    o.detune.value = det
    f.type = 'lowpass'
    f.frequency.value = 900
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.3)
    g.gain.linearRampToValueAtTime(0.0001, t + dur)
    o.connect(f).connect(g).connect(dest)
    o.start(t)
    o.stop(t + dur + 0.05)
  }
}

function hat(t, dest) {
  const s = ctx.createBufferSource()
  s.buffer = noiseBuf
  const f = ctx.createBiquadFilter()
  f.type = 'highpass'
  f.frequency.value = 7000
  const g = ctx.createGain()
  env(g, t, 0.001, 0.025, 0.04)
  s.connect(f).connect(g).connect(dest)
  s.start(t, Math.random())
  s.stop(t + 0.06)
}
