// DOM HUD: cutscene letterbox/subtitles/titles, coins, the shop buttons, the
// top-centre "Skip To End" + objective line, the bottom-centre counters and
// big action button, world-anchored labels (waypoint, chat bubbles, prompts,
// floating "+1"s), the timed dialogue panel, breathing minigame, labor screen,
// reward card, confirm modal, toasts, fades and the start screen.
import './hud.css'
import { sound } from './audio.js'

// --- Icons (inline SVG, original art) ------------------------------------------------------
export const ICON = {
  coin: `<svg viewBox="0 0 100 100" class="coin-ico"><circle cx="50" cy="50" r="46" fill="#f0a91d" stroke="#3a2a0c" stroke-width="5"/><circle cx="50" cy="50" r="35" fill="#ffc93a" stroke="#d98c12" stroke-width="4"/><path d="M50 24l7.6 15.5 17 2.5-12.3 12 2.9 17L50 63l-15.2 8 2.9-17-12.3-12 17-2.5z" fill="#e8920f" stroke="#b86d06" stroke-width="2.5" stroke-linejoin="round"/></svg>`,
  miniCoin: `<svg viewBox="0 0 100 100" class="mini-coin"><circle cx="50" cy="50" r="44" fill="#ffc93a" stroke="#3a2a0c" stroke-width="9"/><path d="M50 22l8 16 18 2.6-13 12.6 3 17.8L50 62.6 34 71l3-17.8-13-12.6 18-2.6z" fill="#e8920f"/></svg>`,
  twins: `<svg viewBox="0 0 200 180"><defs><radialGradient id="tw1" cx="40%" cy="35%"><stop offset="0" stop-color="#ffe1c6"/><stop offset="1" stop-color="#f0b98f"/></radialGradient><radialGradient id="tw2" cx="40%" cy="35%"><stop offset="0" stop-color="#f2c69b"/><stop offset="1" stop-color="#d79a66"/></radialGradient></defs>
    <path d="M18 92c0-26 22-40 46-40s40 18 40 40l-6 66c-2 14-14 20-34 20s-40-8-44-22z" fill="#3fa8f2" stroke="#1c5fae" stroke-width="5"/><path d="M30 120c18 12 46 10 64-4" stroke="#8fd3ff" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M100 92c0-26 18-40 42-40s44 14 44 40l-6 64c-4 14-24 22-44 22s-32-6-34-20z" fill="#ff5fae" stroke="#b02a6c" stroke-width="5"/><path d="M110 120c18 12 46 10 64-4" stroke="#ffb3d8" stroke-width="7" fill="none" stroke-linecap="round"/>
    <circle cx="64" cy="70" r="36" fill="url(#tw1)" stroke="#a0623a" stroke-width="4"/><circle cx="140" cy="70" r="36" fill="url(#tw2)" stroke="#7a4220" stroke-width="4"/>
    <path d="M40 46c6-16 22-22 34-16-4 6 0 10 8 8-4 8-24 10-42 8z" fill="#7a3f17"/><path d="M118 44c8-14 24-18 36-12-6 6-2 10 6 10-6 8-26 8-42 2z" fill="#4a250c"/>
    <circle cx="52" cy="70" r="7.5" fill="#1d2a52"/><circle cx="76" cy="70" r="7.5" fill="#1d2a52"/><circle cx="54" cy="67" r="2.6" fill="#fff"/><circle cx="78" cy="67" r="2.6" fill="#fff"/>
    <circle cx="128" cy="70" r="7.5" fill="#2a1a0c"/><circle cx="152" cy="70" r="7.5" fill="#2a1a0c"/><circle cx="130" cy="67" r="2.6" fill="#fff"/><circle cx="154" cy="67" r="2.6" fill="#fff"/>
    <ellipse cx="44" cy="84" rx="7" ry="4.5" fill="#ff8aa0" opacity=".7"/><ellipse cx="84" cy="84" rx="7" ry="4.5" fill="#ff8aa0" opacity=".7"/><ellipse cx="120" cy="84" rx="7" ry="4.5" fill="#ff7a8a" opacity=".7"/><ellipse cx="160" cy="84" rx="7" ry="4.5" fill="#ff7a8a" opacity=".7"/>
    <path d="M56 88q8 9 16 0" stroke="#7a2d1a" stroke-width="4" fill="#d9413f" stroke-linecap="round"/><path d="M132 88q8 9 16 0" stroke="#5a1d0a" stroke-width="4" fill="#d9413f" stroke-linecap="round"/></svg>`,
  skull: `<svg viewBox="0 0 200 190"><defs><radialGradient id="sk" cx="45%" cy="35%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e6dcef"/></radialGradient></defs>
    <path d="M100 6c18 16 10 30 28 34 12-12 30-10 36 2-10 2-12 10-4 16 14 2 24 14 22 28-8-6-14-4-14 4 8 14 6 32-8 40l-10 46H50l-10-46c-14-8-16-26-8-40 0-8-6-10-14-4-2-14 8-26 22-28 8-6 6-14-4-16 6-12 24-14 36-2 18-4 10-18 28-34z" fill="#8a2be2" stroke="#4a0f86" stroke-width="5" stroke-linejoin="round"/>
    <path d="M100 22c12 12 6 22 20 26 8-8 20-6 24 2-6 2-8 8 0 12 10 2 16 10 14 18" fill="none" stroke="#d27bff" stroke-width="5" stroke-linecap="round"/>
    <path d="M100 44c34 0 56 22 56 52 0 18-8 30-20 36v18c0 8-6 12-12 12H76c-6 0-12-4-12-12v-18c-12-6-20-18-20-36 0-30 22-52 56-52z" fill="url(#sk)" stroke="#3a1a5a" stroke-width="5"/>
    <ellipse cx="78" cy="100" rx="17" ry="19" fill="#4a1a7a"/><ellipse cx="122" cy="100" rx="17" ry="19" fill="#4a1a7a"/><circle cx="82" cy="94" r="6" fill="#fff"/><circle cx="126" cy="94" r="6" fill="#fff"/><circle cx="74" cy="104" r="3" fill="#c77dff"/><circle cx="118" cy="104" r="3" fill="#c77dff"/>
    <path d="M92 124l8-10 8 10z" fill="#3a1a5a"/><path d="M80 140q20 14 40 0" stroke="#3a1a5a" stroke-width="5" fill="#ff6a8a" stroke-linecap="round"/>
    <path d="M150 50c6-10 20-8 22 2 2 8-8 16-22 22-4-10-6-16 0-24z" fill="#ff7ad2" stroke="#4a0f86" stroke-width="4"/></svg>`,
  ffwd: `<svg viewBox="0 0 70 50"><path d="M4 4l28 21L4 46z" fill="#2f63ff" stroke="#fff" stroke-width="5" stroke-linejoin="round"/><path d="M34 4l28 21-28 21z" fill="#2f63ff" stroke="#fff" stroke-width="5" stroke-linejoin="round"/></svg>`,
  chevrons: `<svg viewBox="0 0 64 64"><path d="M8 8l24 18 24-18v12L32 38 8 20z" fill="#ffd21f" stroke="#3a2a0c" stroke-width="3.5" stroke-linejoin="round"/><path d="M8 28l24 18 24-18v12L32 58 8 40z" fill="#ffd21f" stroke="#3a2a0c" stroke-width="3.5" stroke-linejoin="round"/></svg>`,
  speed: `<svg viewBox="0 0 70 50"><path d="M6 6l22 19L6 44" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M34 6l22 19-22 19" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  ambulance: `<svg viewBox="0 0 64 44" class="ico"><rect x="2" y="8" width="38" height="26" rx="4" fill="#fff" stroke="#333" stroke-width="2.5"/><path d="M40 16h12l9 10v8H40z" fill="#fff" stroke="#333" stroke-width="2.5"/><path d="M44 19h7l5 6H44z" fill="#7fc6ff"/><rect x="17" y="13" width="7" height="17" fill="#e0182d"/><rect x="12" y="18" width="17" height="7" fill="#e0182d"/><rect x="2" y="27" width="59" height="4" fill="#e0182d"/><circle cx="14" cy="36" r="5" fill="#333"/><circle cx="50" cy="36" r="5" fill="#333"/><rect x="24" y="3" width="9" height="5" rx="2" fill="#3a7bff"/></svg>`,
  hospital: `<svg viewBox="0 0 64 64" class="ico"><rect x="8" y="14" width="48" height="44" rx="4" fill="#dfe9ff" stroke="#3b5ba8" stroke-width="3"/><rect x="26" y="4" width="12" height="12" fill="#fff" stroke="#3b5ba8" stroke-width="2.5"/><path d="M30 6h4v4h4v4h-4v-0h-4v0h-4v-4h4z" fill="#e0182d"/>${Array.from({ length: 9 }, (_, i) => `<rect x="${14 + (i % 3) * 13}" y="${20 + Math.floor(i / 3) * 11}" width="9" height="7" fill="#5aa7f0"/>`).join('')}</svg>`,
  heart: `<svg viewBox="0 0 64 58" class="ico"><path d="M32 54C8 38 2 26 6 16 10 6 24 4 32 14c8-10 22-8 26 2 4 10-2 22-26 38z" fill="#ff3352" stroke="#a3122f" stroke-width="3"/><path d="M14 16c3-4 8-5 12-3" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7"/></svg>`,
  breath: `<svg viewBox="0 0 64 48" class="ico"><circle cx="20" cy="24" r="14" fill="#eef4ff" stroke="#9ab" stroke-width="2"/><circle cx="36" cy="18" r="12" fill="#fff" stroke="#9ab" stroke-width="2"/><circle cx="46" cy="28" r="9" fill="#dfeaff" stroke="#9ab" stroke-width="2"/><circle cx="58" cy="30" r="4" fill="#7fc6ff"/></svg>`,
  flag: `<svg viewBox="0 0 64 56" class="ico"><rect x="6" y="4" width="4" height="50" fill="#555"/><g>${Array.from({ length: 16 }, (_, i) => `<rect x="${10 + (i % 4) * 11}" y="${4 + Math.floor(i / 4) * 7}" width="11" height="7" fill="${(i + Math.floor(i / 4)) % 2 ? '#222' : '#fff'}"/>`).join('')}</g></svg>`,
  scan: `<svg viewBox="0 0 64 56" class="ico"><rect x="4" y="4" width="56" height="40" rx="6" fill="#0c1a4a" stroke="#7fe9ff" stroke-width="3"/><path d="M32 12l16 26H16z" fill="#4a5a7a"/><circle cx="30" cy="30" r="6" fill="#cfd8e8"/><rect x="26" y="46" width="12" height="6" fill="#7fe9ff"/></svg>`,
  sound: `<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="#fff"/><path d="M16 8a5 5 0 0 1 0 8M18.5 5.5a8.5 8.5 0 0 1 0 13" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`,
  muted: `<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="#fff"/><path d="M16 9l6 6M22 9l-6 6" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>`,
  baby: `<svg viewBox="0 0 40 40" style="width:28px;height:28px"><circle cx="20" cy="22" r="14" fill="#ffd7b5" stroke="#7a4a2a" stroke-width="2.5"/><circle cx="15" cy="21" r="2" fill="#333"/><circle cx="25" cy="21" r="2" fill="#333"/><path d="M15 28q5 4 10 0" stroke="#7a4a2a" stroke-width="2" fill="none"/><circle cx="20" cy="8" r="3" fill="#e8a03a"/></svg>`,
}

const el = (tag, cls = '', html = '') => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html) e.innerHTML = html
  return e
}
const fmt = (s) => {
  s = Math.max(0, Math.ceil(s))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const priceHTML = (p) => `<span class="price">${ICON.miniCoin}${p}</span>`
// One tap path for mouse, touch and pen; no click delay.
function tap(btn, fn) {
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    fn(e)
  })
  return btn
}

export function createHud() {
  const root = el('div')
  root.id = 'hud'
  document.body.appendChild(root)

  // Layers in paint order
  const world = el('div') // anchored labels
  const barTop = el('div', 'bar top')
  const barBot = el('div', 'bar bottom')
  const subtitle = el('div', 'subtitle outlined')
  const titleCard = el('div', 'title-card hidden')
  const coins = el('div', 'coins', `${ICON.coin}<span class="num outlined">0</span>`)
  const twinsBtn = el('button', 'shop left', `${ICON.twins}<span class="name outlined">Twins!</span><span class="price outlined"></span>`)
  // Rewarded ad (Bloxity): +coins once the backend verified it (game.watchAd). Never premium currency.
  const adBtn = el('button', 'ad-coins', `<span class="ad-ico">▶</span><span class="outlined">Free Coins</span>${priceHTML('+' + 40)}`)
  const killAllBtn = el('button', 'shop right', `${ICON.skull}<span class="name outlined">Kill All</span><span class="price outlined"></span>`)
  const topc = el('div', 'topc')
  const skipEnd = el('button', 'skip-end', `${ICON.ffwd}<span class="outlined">Skip To End</span>`)
  const objective = el('div', 'objective outlined hidden')
  topc.append(skipEnd, objective)
  const botc = el('div', 'botc')
  const info = el('div', 'info hidden', `<div class="big outlined"></div><div class="small outlined"></div>`)
  const action = el('button', 'action hidden')
  botc.append(info, action)
  const layer = el('div') // dialogue, minigames, cards
  const skipCut = el('button', 'skip-cut hidden', 'SKIP ▶')
  const fade = el('div', 'fade')
  const mute = el('button', 'mute')
  const babies = el('div', 'babies hidden')
  root.append(world, coins, adBtn, twinsBtn, killAllBtn, topc, botc, barTop, barBot, subtitle, titleCard, layer, skipCut, babies, mute, fade)

  const gameplayEls = [coins, adBtn, twinsBtn, killAllBtn, topc, botc]
  const hud = {
    root,
    onTwins: null,
    onKillAll: null,
    onSkipEnd: null,
    onWatchAd: null,
  }
  tap(adBtn, () => hud.onWatchAd?.())
  hud.setAdCoins = (n) => (adBtn.querySelector('.price').innerHTML = `${ICON.miniCoin}+${n}`)
  tap(twinsBtn, () => hud.onTwins?.())
  tap(killAllBtn, () => hud.onKillAll?.())
  tap(skipEnd, () => hud.onSkipEnd?.())
  tap(coins, () => sound.click())

  // --- gameplay HUD ---
  hud.setGameplay = (on) => {
    for (const e of gameplayEls) e.classList.toggle('hidden', !on)
  }
  hud.setShopPrices = ({ twins, killAll, skipToEnd, twinsOwned }) => {
    twinsBtn.querySelector('.price').innerHTML = twinsOwned ? 'OWNED ✓' : `${ICON.miniCoin}${twins}`
    twinsBtn.classList.toggle('owned', !!twinsOwned)
    killAllBtn.querySelector('.price').innerHTML = `${ICON.miniCoin}${killAll}`
    skipEnd.innerHTML = `${ICON.ffwd}<span class="outlined">Skip To End</span><span class="price outlined">${ICON.miniCoin}${skipToEnd}</span>`
  }
  hud.showSkipEnd = (on) => skipEnd.classList.toggle('hidden', !on)
  hud.showKillAll = (on) => killAllBtn.classList.toggle('hidden', !on)
  let shownCoins = 0
  let targetCoins = 0
  hud.setCoins = (n, animate = true) => {
    targetCoins = n
    if (!animate) shownCoins = n
    coins.classList.remove('bump')
    void coins.offsetWidth
    if (animate) coins.classList.add('bump')
  }
  hud.setBabies = (n) => {
    babies.classList.toggle('hidden', n <= 0)
    babies.innerHTML = `${ICON.baby}<span class="outlined">${n}</span>`
  }
  hud.objective = (text, icon = null, small = false) => {
    if (!text) {
      objective.classList.add('hidden')
      return
    }
    objective.className = `objective outlined${small ? ' small' : ''}`
    objective.innerHTML = `${icon ? ICON[icon] : ''}<span>${text}</span>`
  }
  hud.info = (big, small) => {
    if (big == null) {
      info.classList.add('hidden')
      return
    }
    info.classList.remove('hidden')
    info.children[0].textContent = big
    info.children[1].textContent = small ?? ''
  }
  hud.fmt = fmt
  let actionFn = null
  tap(action, () => actionFn?.())
  hud.action = (label, price, fn, { disabled = false } = {}) => {
    if (!label) {
      action.classList.add('hidden')
      actionFn = null
      return
    }
    action.classList.remove('hidden')
    action.classList.toggle('disabled', disabled)
    action.innerHTML = `${ICON.speed}<span class="outlined">${label}</span>${price != null ? priceHTML(price) : ''}`
    actionFn = fn
  }

  // --- cinema ---
  let subTimer = null
  hud.cinema = (on) => root.classList.toggle('cinema', on)
  hud.subtitle = (text, { shout = false, typeSpeed = 0 } = {}) => {
    clearInterval(subTimer)
    if (!text) {
      subtitle.classList.remove('show')
      return
    }
    subtitle.classList.toggle('shout', shout)
    subtitle.classList.add('show')
    if (!typeSpeed) {
      subtitle.textContent = text
      return
    }
    let i = 0
    subtitle.textContent = ''
    subTimer = setInterval(() => {
      i++
      subtitle.textContent = text.slice(0, i)
      if (i % 2 === 0 && text[i - 1] !== ' ') sound.type()
      if (i >= text.length) clearInterval(subTimer)
    }, typeSpeed)
  }
  hud.title = (main, sub = '', { color = '', tag = null, tagColor = '#57b8ff' } = {}) => {
    if (!main) {
      titleCard.classList.add('hidden')
      return
    }
    titleCard.classList.remove('hidden')
    titleCard.innerHTML = `<div class="main ${color}">${main}</div>${sub ? `<div class="sub outlined">${sub}</div>` : ''}${tag ? `<div class="tag outlined" style="color:${tagColor}">${tag}</div>` : ''}`
  }
  let skipFn = null
  tap(skipCut, () => {
    sound.click()
    skipFn?.()
  })
  hud.cutsceneSkip = (fn) => {
    skipFn = fn
    skipCut.classList.toggle('hidden', !fn)
  }
  hud.fade = (to, ms = 400, white = false) =>
    new Promise((res) => {
      fade.classList.toggle('white', white)
      fade.style.transition = `opacity ${ms}ms`
      void fade.offsetWidth
      fade.style.opacity = String(to)
      setTimeout(res, ms + 20)
    })

  // --- world anchored labels ---
  const anchors = new Map()
  hud.anchor = (key, html, cls) => {
    let a = anchors.get(key)
    if (!a) {
      a = el('div', `anchor ${cls}`)
      world.appendChild(a)
      anchors.set(key, a)
      a._html = null
    }
    if (html !== a._html) {
      a.innerHTML = html
      a._html = html
    }
    return a
  }
  hud.place = (key, x, y, visible, scale = 1) => {
    const a = anchors.get(key)
    if (!a) return
    a.style.display = visible ? '' : 'none'
    if (visible) a.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%) scale(${scale})`
  }
  hud.removeAnchor = (key) => {
    const a = anchors.get(key)
    if (a) {
      a.remove()
      anchors.delete(key)
    }
  }
  hud.waypointHTML = (label) => `<div class="lbl outlined">${label}</div>${ICON.chevrons}`
  hud.floater = (text, x, y, color = '#ffe14d') => {
    const f = el('div', 'anchor floater outlined', text)
    f.style.color = color
    f.style.left = `${x}px`
    f.style.top = `${y}px`
    f.style.transform = 'translate(-50%, -50%)'
    world.appendChild(f)
    setTimeout(() => f.remove(), 1300)
  }
  hud.toast = (text, color = '#fff') => {
    const t = el('div', 'toast outlined', text)
    t.style.color = color
    layer.appendChild(t)
    setTimeout(() => t.remove(), 2100)
  }

  // --- confirm modal ---
  hud.confirm = (title, text, price) =>
    new Promise((res) => {
      const m = el('div', 'modal', `<div class="box"><h2 class="outlined">${title}</h2><p>${text}</p><div class="row"><button class="no">Cancel</button><button class="yes">Buy ${priceHTML(price)}</button></div></div>`)
      layer.appendChild(m)
      sound.pop()
      const done = (v) => {
        m.remove()
        res(v)
      }
      tap(m.querySelector('.yes'), () => done(true))
      tap(m.querySelector('.no'), () => {
        sound.click()
        done(false)
      })
    })

  // --- dialogue ---
  // choices: [{ label, price?, poor? }]; resolves with the picked index (or `fallback` on timeout).
  hud.dialogue = ({ speaker, text, choices = [], time = 10, fallback = 0, typeSpeed = 32, color = 'yellow' }) =>
    new Promise((res) => {
      const d = el('div', 'dialogue')
      d.innerHTML = `<div class="who outlined">${speaker}</div><div class="timer">${Math.ceil(time)}</div><div class="text"></div><div class="track"><div class="fill ${color === 'green' ? 'green' : ''}"></div></div><div class="choices"></div>`
      layer.appendChild(d)
      const txt = d.querySelector('.text')
      const fill = d.querySelector('.fill')
      const timer = d.querySelector('.timer')
      const box = d.querySelector('.choices')
      const buttons = choices.map((c, i) => {
        const b = el('button', `choice${c.poor ? ' poor' : ''}`, `<span class="n">${i + 1}</span>${c.label}${c.price != null ? `<span class="price">${ICON.miniCoin}${c.price}</span>` : ''}`)
        box.appendChild(b)
        tap(b, () => pick(i))
        return b
      })
      if (!choices.length) timer.classList.add('hidden')
      let i = 0
      const typer = setInterval(() => {
        i++
        txt.textContent = text.slice(0, i)
        if (i % 2 === 0) sound.type()
        if (i >= text.length) clearInterval(typer)
      }, typeSpeed)
      const t0 = performance.now()
      let lastSec = Math.ceil(time)
      let finished = false
      const loop = () => {
        if (finished) return clearInterval(ticker)
        const left = time - (performance.now() - t0) / 1000
        fill.style.transform = `scaleX(${Math.max(0, left / time)})`
        const sec = Math.ceil(left)
        if (sec !== lastSec) {
          lastSec = sec
          timer.textContent = Math.max(0, sec)
          if (choices.length && sec <= 3 && sec > 0) {
            timer.classList.add('urgent')
            sound.tick()
          }
        }
        if (left <= 0) pick(choices.length ? fallback : -1)
      }
      const ticker = setInterval(loop, 50)
      const onKey = (e) => {
        const n = parseInt(e.key, 10)
        if (n >= 1 && n <= choices.length) pick(n - 1)
        if (!choices.length && (e.code === 'Space' || e.code === 'Enter')) pick(-1)
      }
      window.addEventListener('keydown', onKey)
      if (!choices.length) tap(d, () => pick(-1))
      function pick(idx) {
        if (finished) return
        if (idx >= 0 && choices[idx]?.poor) {
          sound.error()
          buttons[idx].animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 250 })
          hud.toast('Not enough coins!', '#ff8a8a')
          return
        }
        finished = true
        clearInterval(typer)
        txt.textContent = text
        window.removeEventListener('keydown', onKey)
        if (idx >= 0) {
          sound.click()
          buttons.forEach((b, k) => b.classList.add(k === idx ? 'picked' : 'dim'))
        }
        setTimeout(() => {
          d.remove()
          res(idx)
        }, idx >= 0 ? 650 : 0)
      }
    })

  // --- breathing minigame UI ---
  hud.breathing = () => {
    const w = el('div', 'breath')
    w.innerHTML = `<div class="head outlined">${ICON.breath}BREATHING PRACTICE</div><div class="sub2 outlined"></div><div class="ring"><div class="target"></div><div class="inner"></div><div class="word outlined">IN</div></div><div class="fb outlined"></div><div class="count outlined">0/8</div><div class="track"><div></div></div><button class="go outlined">BREATHE!</button>`
    layer.appendChild(w)
    const q = (s) => w.querySelector(s)
    let onGo = null
    tap(q('.go'), () => onGo?.())
    const key = (e) => {
      if (e.code === 'Space') onGo?.()
    }
    window.addEventListener('keydown', key)
    return {
      set({ word, sub, inner, count, total, bar }) {
        if (word != null) q('.word').textContent = word
        if (sub != null) q('.sub2').textContent = sub
        if (inner != null) q('.inner').style.transform = `scale(${inner})`
        if (count != null) q('.count').textContent = `${count}/${total}`
        if (bar != null) q('.track div').style.width = `${bar * 100}%`
      },
      feedback(text, cls) {
        const f = q('.fb')
        f.textContent = text
        f.className = `fb outlined ${cls}`
        f.animate([{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }], { duration: 250, easing: 'cubic-bezier(.2,1.6,.4,1)' })
      },
      onGo(fn) {
        onGo = fn
      },
      remove() {
        window.removeEventListener('keydown', key)
        w.remove()
      },
    }
  }

  // --- labor / ultrasound screen ---
  hud.labor = (usCanvas) => {
    const w = el('div', 'labor')
    w.innerHTML = `<div class="ttl outlined">ULTRASOUND</div><div class="row"><div><div class="lbl">LABOR PROGRESS</div><div class="bar2"><div></div></div></div><div class="bpm">♥ 120</div></div><canvas class="ecg" width="1200" height="120"></canvas><button class="push outlined">PUSH!</button>`
    usCanvas.className = 'us'
    w.insertBefore(usCanvas, w.children[1])
    layer.appendChild(w)
    const ecg = w.querySelector('canvas.ecg')
    const ctx = ecg.getContext('2d')
    let onPush = null
    tap(w.querySelector('.push'), () => onPush?.())
    const key = (e) => {
      if (e.code === 'Space') onPush?.()
    }
    window.addEventListener('keydown', key)
    let t = 0
    return {
      set(progress, bpm) {
        w.querySelector('.bar2 div').style.width = `${Math.min(100, progress * 100)}%`
        w.querySelector('.bpm').textContent = `♥ ${Math.round(bpm)}`
      },
      draw(dt, bpm) {
        t += dt
        ctx.fillStyle = '#070d16'
        ctx.fillRect(0, 0, 1200, 120)
        ctx.strokeStyle = '#57f08b'
        ctx.lineWidth = 6
        ctx.lineJoin = 'miter'
        ctx.beginPath()
        const period = 60 / bpm
        for (let x = 0; x <= 1200; x += 6) {
          const ph = (((x / 1200) * 3.2 + t / period) % 1 + 1) % 1
          let v = 0
          if (ph > 0.1 && ph < 0.16) v = Math.sin(((ph - 0.1) / 0.06) * Math.PI) * 0.15
          else if (ph > 0.3 && ph < 0.32) v = -0.2
          else if (ph >= 0.32 && ph < 0.36) v = 1
          else if (ph >= 0.36 && ph < 0.4) v = -0.4
          const y = Math.round(60 - v * 48)
          if (x === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y) // stepped, like a pixel monitor
        }
        ctx.stroke()
      },
      onPush(fn) {
        onPush = fn
      },
      remove() {
        window.removeEventListener('keydown', key)
        w.remove()
      },
    }
  }

  // --- reward card ---
  hud.reward = ({ rarity, color, name, emoji = '🍼', quote, coins: gain, price, isNew = true }) =>
    new Promise((res) => {
      const w = el('div', 'reward')
      w.style.setProperty('--rc', color)
      w.innerHTML = `<div class="rays"></div><div class="card"><div class="rhead outlined">${rarity}</div><div class="bname">${emoji} ${name}</div><div class="quote">"${quote}"</div><div class="gain">+${gain} coins</div><div class="btns"><button class="cute outlined">SO CUTE! ${emoji}</button><button class="again"><span class="outlined">NEW BABY?</span>${priceHTML(price)}</button></div></div>${isNew ? '<div class="new">NEW!</div>' : ''}`
      layer.appendChild(w)
      tap(w.querySelector('.cute'), () => {
        sound.click()
        w.remove()
        res('cute')
      })
      tap(w.querySelector('.again'), () => {
        w.remove()
        res('again')
      })
    })

  // --- start screen ---
  hud.start = (title, onPlay) => {
    const s = el('div', 'start', `<h1>${title}</h1><button class="play outlined">PLAY</button><div class="hint outlined">WASD / joystick to move · drag or click to look · 1-3 to answer</div>`)
    layer.appendChild(s)
    tap(s.querySelector('.play'), () => {
      s.remove()
      onPlay()
    })
  }

  // --- mute ---
  hud.onMute = null
  hud.setMuted = (m) => (mute.innerHTML = m ? ICON.muted : ICON.sound)
  tap(mute, () => hud.onMute?.())

  // Keep the top-centre column below Boxity's toolbar when that toolbar reaches the centre.
  hud.setReserved = (areas) => {
    const w = window.innerWidth
    let reserve = 0
    for (const a of areas) {
      if (a.top < 10 && a.left + a.width > w / 2 - 170) reserve = Math.max(reserve, a.top + a.height)
    }
    root.style.setProperty('--top-reserve', `${reserve}px`)
  }

  // coin counter roll-up
  hud.tick = (dt) => {
    if (shownCoins !== targetCoins) {
      const step = Math.max(1, Math.ceil(Math.abs(targetCoins - shownCoins) * dt * 6))
      shownCoins += Math.sign(targetCoins - shownCoins) * Math.min(step, Math.abs(targetCoins - shownCoins))
    }
    const num = coins.querySelector('.num')
    if (num.textContent !== String(shownCoins)) num.textContent = shownCoins
  }

  hud.setGameplay(false)
  return hud
}
