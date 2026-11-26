// Canvas painters for this game's look: wood grain, plank floors, dotted
// walls, fabric, tiles, asphalt, faces, signs, posters and screens.
// Everything is drawn once at load; same seed = same look.
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'
import { fbm, heightToNormal, mulberry32 } from './textures.js'

export function cnv(w, h = w) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

export function tex(c, { repeat = [1, 1], srgb = true, aniso = 8 } = {}) {
  const t = new CanvasTexture(c)
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(repeat[0], repeat[1])
  t.anisotropy = aniso
  if (srgb) t.colorSpace = SRGBColorSpace
  return t
}

const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// Wood grain running along U: warped stripes + pores. Returns { color, normal }.
export function woodGrain(base = '#a5401c', dark = '#6e2410', size = 256, seed = 3, freq = 34) {
  const warp = fbm(size, 4, 4, seed)
  const fine = fbm(size, 32, 2, seed + 7)
  const a = rgb(dark)
  const b = rgb(base)
  const c = cnv(size)
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(size, size)
  const h = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const v = (y / size) * freq + warp[i] * 1.6 + Math.sin((x / size) * Math.PI * 2 + warp[i] * 2) * 0.35
      let g = 0.5 + 0.5 * Math.sin(v * Math.PI * 2)
      g = Math.pow(g, 3) * 0.45 + fine[i] * 0.55
      const t = Math.min(1, Math.max(0, 1 - g))
      h[i] = t
      img.data[i * 4] = a[0] + (b[0] - a[0]) * t
      img.data[i * 4 + 1] = a[1] + (b[1] - a[1]) * t
      img.data[i * 4 + 2] = a[2] + (b[2] - a[2]) * t
      img.data[i * 4 + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return { color: c, normal: heightToNormal(h, size, 1.2) }
}

// Staggered plank floor (planks along U) with dark seams and end joints.
export function plankFloor(base = '#c0622c', size = 512, rows = 8, seed = 11) {
  const rand = mulberry32(seed)
  const grain = woodGrain(base, '#8a3a16', size, seed, 60)
  const c = cnv(size)
  const ctx = c.getContext('2d')
  ctx.drawImage(grain.color, 0, 0)
  const rh = size / rows
  const hc = cnv(size)
  const hctx = hc.getContext('2d')
  hctx.fillStyle = '#ccc'
  hctx.fillRect(0, 0, size, size)
  for (let r = 0; r < rows; r++) {
    const y = r * rh
    const tint = 0.85 + rand() * 0.3
    ctx.fillStyle = tint > 1 ? `rgba(255,220,180,${(tint - 1) * 0.6})` : `rgba(60,20,0,${(1 - tint) * 0.6})`
    ctx.fillRect(0, y, size, rh)
    ctx.fillStyle = '#3a1406'
    ctx.fillRect(0, y, size, 3)
    hctx.fillStyle = '#000'
    hctx.fillRect(0, y, size, 3)
    const off = rand() * size
    for (let k = 0; k < 2; k++) {
      const x = (off + k * size * 0.5) % size
      ctx.fillStyle = '#3a1406'
      ctx.fillRect(x, y, 3, rh)
      hctx.fillRect(x, y, 3, rh)
    }
  }
  const hd = hctx.getImageData(0, 0, size, size).data
  const h = new Float32Array(size * size)
  for (let i = 0; i < h.length; i++) h[i] = hd[i * 4] / 255
  return { color: c, normal: heightToNormal(h, size, 2) }
}

// Wall paint: base colour, soft vertical panel lines and faint square flecks.
export function dottedWall(base = '#e8b4a0', fleck = 'rgba(255,255,255,0.22)', size = 256, seed = 5, panels = 2) {
  const rand = mulberry32(seed)
  const c = cnv(size)
  const ctx = c.getContext('2d')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)
  const n = fbm(size, 4, 3, seed)
  const img = ctx.getImageData(0, 0, size, size)
  for (let i = 0; i < n.length; i++) {
    const k = 0.95 + n[i] * 0.08
    img.data[i * 4] *= k
    img.data[i * 4 + 1] *= k
    img.data[i * 4 + 2] *= k
  }
  ctx.putImageData(img, 0, 0)
  ctx.fillStyle = fleck
  for (let i = 0; i < 14; i++) {
    const s = 5 + rand() * 6
    ctx.save()
    ctx.translate(rand() * size, rand() * size)
    ctx.rotate(rand())
    ctx.fillRect(-s / 2, -s / 2, s, s)
    ctx.restore()
  }
  ctx.fillStyle = 'rgba(0,0,0,0.06)'
  for (let p = 0; p < panels; p++) ctx.fillRect((p / panels) * size, 0, 2, size)
  return c
}

// Woven fabric (blanket, sheets): fine cross-hatch noise. Returns { color, normal }.
export function fabric(base = '#0d58a8', size = 256, seed = 21, weave = 64) {
  const n = fbm(size, 16, 3, seed)
  const b = rgb(base)
  const c = cnv(size)
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(size, size)
  const h = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const wv = Math.sin((x / size) * weave * Math.PI * 2) * Math.sin((y / size) * weave * Math.PI * 2)
      const v = 0.8 + wv * 0.08 + n[i] * 0.25
      h[i] = 0.5 + wv * 0.5
      img.data[i * 4] = Math.min(255, b[0] * v)
      img.data[i * 4 + 1] = Math.min(255, b[1] * v)
      img.data[i * 4 + 2] = Math.min(255, b[2] * v)
      img.data[i * 4 + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return { color: c, normal: heightToNormal(h, size, 0.8) }
}

// Square floor tiles with grout and a subtle speckle.
export function floorTiles(base = '#f4eef0', grout = '#d9cfd4', size = 256, per = 2, seed = 31) {
  const rand = mulberry32(seed)
  const n = fbm(size, 16, 3, seed)
  const c = cnv(size)
  const ctx = c.getContext('2d')
  ctx.fillStyle = grout
  ctx.fillRect(0, 0, size, size)
  const t = size / per
  for (let y = 0; y < per; y++) {
    for (let x = 0; x < per; x++) {
      const k = 0.96 + rand() * 0.05
      const [r, g, b] = rgb(base)
      ctx.fillStyle = `rgb(${r * k},${g * k},${b * k})`
      ctx.fillRect(x * t + 2, y * t + 2, t - 4, t - 4)
    }
  }
  const img = ctx.getImageData(0, 0, size, size)
  for (let i = 0; i < n.length; i++) {
    const k = 0.97 + n[i] * 0.05
    img.data[i * 4] *= k
    img.data[i * 4 + 1] *= k
    img.data[i * 4 + 2] *= k
  }
  ctx.putImageData(img, 0, 0)
  return c
}

// Speckled noise surface: asphalt, concrete, carpet.
export function speckle(dark, light, size = 256, seed = 41, cells = 32, grain = 0.4) {
  const n = fbm(size, cells, 3, seed)
  const rand = mulberry32(seed + 1)
  const a = rgb(dark)
  const b = rgb(light)
  const c = cnv(size)
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(size, size)
  for (let i = 0; i < n.length; i++) {
    const t = Math.min(1, Math.max(0, n[i] + (rand() - 0.5) * grain))
    img.data[i * 4] = a[0] + (b[0] - a[0]) * t
    img.data[i * 4 + 1] = a[1] + (b[1] - a[1]) * t
    img.data[i * 4 + 2] = a[2] + (b[2] - a[2]) * t
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return c
}

// A simple blocky-avatar face on a transparent canvas (eyes, brows, mouth).
export function face(style = 0, size = 128) {
  const c = cnv(size)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#1b1b1b'
  ctx.strokeStyle = '#1b1b1b'
  ctx.lineCap = 'round'
  const s = size / 128
  const eye = (x, y, w, h) => {
    ctx.beginPath()
    ctx.ellipse(x * s, y * s, w * s, h * s, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  const kind = style % 6
  if (kind === 5) {
    // closed happy eyes
    ctx.lineWidth = 5 * s
    ctx.beginPath()
    ctx.arc(44 * s, 58 * s, 8 * s, Math.PI, 0)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(84 * s, 58 * s, 8 * s, Math.PI, 0)
    ctx.stroke()
  } else {
    eye(44, 56, 5, kind === 2 ? 9 : 7)
    eye(84, 56, 5, kind === 2 ? 9 : 7)
    ctx.fillStyle = '#fff'
    eye(46, 52, 1.8, 2.2)
    eye(86, 52, 1.8, 2.2)
    ctx.fillStyle = '#1b1b1b'
  }
  ctx.lineWidth = 4 * s
  ctx.beginPath()
  if (kind === 1) {
    ctx.moveTo(52 * s, 84 * s)
    ctx.lineTo(76 * s, 84 * s)
  } else if (kind === 3) {
    ctx.arc(64 * s, 84 * s, 8 * s, 0, Math.PI * 2)
  } else {
    ctx.arc(64 * s, 76 * s, 16 * s, 0.2 * Math.PI, 0.8 * Math.PI)
  }
  ctx.stroke()
  if (kind === 4 || kind === 5) {
    ctx.fillStyle = 'rgba(255,120,140,0.45)'
    eye(32, 74, 8, 5)
    eye(96, 74, 8, 5)
  }
  return c
}

const FONT = 'Fredoka, "Arial Rounded MT Bold", "Arial Black", sans-serif'

// Text sign: optional background, outline, italic, line colours.
export function sign(text, { w = 1024, h = 256, bg = null, color = '#fff', outline = null, outlineWidth = 16, weight = 700, italic = false, size = null, radius = 0, border = null, borderWidth = 0, align = 'center', pad = 40, lineGap = 1.1, shadow = null } = {}) {
  const c = cnv(w, h)
  const ctx = c.getContext('2d')
  const draw = () => {
    ctx.clearRect(0, 0, w, h)
    if (bg) {
      ctx.fillStyle = bg
      roundRect(ctx, 0, 0, w, h, radius)
      ctx.fill()
    }
    if (border) {
      ctx.strokeStyle = border
      ctx.lineWidth = borderWidth
      roundRect(ctx, borderWidth / 2, borderWidth / 2, w - borderWidth, h - borderWidth, radius)
      ctx.stroke()
    }
    const lines = String(text).split('\n')
    let px = size ?? Math.floor((h - pad) / (lines.length * lineGap))
    ctx.font = `${italic ? 'italic ' : ''}${weight} ${px}px ${FONT}`
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width))
    if (widest > w - pad * 2) px = Math.floor(px * ((w - pad * 2) / widest))
    ctx.font = `${italic ? 'italic ' : ''}${weight} ${px}px ${FONT}`
    ctx.textAlign = align
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    const total = px * lineGap * lines.length
    const colors = Array.isArray(color) ? color : null
    lines.forEach((l, i) => {
      const x = align === 'center' ? w / 2 : pad
      const y = h / 2 - total / 2 + px * lineGap * (i + 0.5)
      if (shadow) {
        ctx.fillStyle = shadow
        ctx.fillText(l, x + px * 0.04, y + px * 0.06)
      }
      if (outline) {
        ctx.strokeStyle = outline
        ctx.lineWidth = outlineWidth
        ctx.strokeText(l, x, y)
      }
      ctx.fillStyle = colors ? colors[i % colors.length] : color
      ctx.fillText(l, x, y)
    })
  }
  draw()
  document.fonts?.load?.(`700 64px Fredoka`).then(() => {
    draw()
    c.dispatchEvent(new Event('redraw'))
  })
  return c
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// A texture from a sign canvas that refreshes once the web font is in.
export function signTex(text, opts) {
  const c = sign(text, opts)
  const t = tex(c)
  t.wrapS = t.wrapT = 1001 // ClampToEdge
  c.addEventListener('redraw', () => (t.needsUpdate = true))
  return t
}

// Cartoon baby face poster (round face, cheeks, smile) on a striped background.
export function babyPoster(bg = '#f6d23c', size = 256) {
  const c = cnv(size, Math.round(size * 1.25))
  const ctx = c.getContext('2d')
  ctx.fillStyle = bg
  roundRect(ctx, 0, 0, c.width, c.height, 18)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  for (let i = -c.height; i < c.width; i += 28) {
    ctx.beginPath()
    ctx.moveTo(i, c.height)
    ctx.lineTo(i + 14, c.height)
    ctx.lineTo(i + 14 + c.height, 0)
    ctx.lineTo(i + c.height, 0)
    ctx.fill()
  }
  const cx = size / 2
  const cy = c.height / 2
  ctx.fillStyle = '#f7dcc0'
  ctx.strokeStyle = '#6b3b22'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.arc(cx, cy, size * 0.36, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#2a1a12'
  ctx.beginPath()
  ctx.ellipse(cx - size * 0.11, cy - size * 0.04, 8, 13, 0, 0, Math.PI * 2)
  ctx.ellipse(cx + size * 0.11, cy - size * 0.04, 8, 13, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,120,140,0.55)'
  ctx.beginPath()
  ctx.ellipse(cx - size * 0.2, cy + size * 0.07, 16, 11, 0, 0, Math.PI * 2)
  ctx.ellipse(cx + size * 0.2, cy + size * 0.07, 16, 11, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#6b3b22'
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.arc(cx, cy + size * 0.06, size * 0.08, 0.15 * Math.PI, 0.85 * Math.PI)
  ctx.stroke()
  ctx.fillStyle = '#e8a03a'
  ctx.beginPath()
  ctx.arc(cx, cy - size * 0.36, 9, 0, Math.PI * 2)
  ctx.fill()
  return c
}

// Heart poster: pastel blue card with a big pink heart.
export function heartPoster(bg = '#9ec9de', heart = '#e5457a', size = 256) {
  const c = cnv(size, Math.round(size * 1.2))
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#f2ece8'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.fillStyle = bg
  roundRect(ctx, 10, 10, c.width - 20, c.height - 20, 22)
  ctx.fill()
  drawHeart(ctx, c.width / 2, c.height * 0.48, size * 0.62, heart, '#a3123f')
  return c
}

export function drawHeart(ctx, x, y, s, fill, stroke) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s / 100, s / 100)
  ctx.beginPath()
  ctx.moveTo(0, 35)
  ctx.bezierCurveTo(-60, -5, -45, -55, 0, -25)
  ctx.bezierCurveTo(45, -55, 60, -5, 0, 35)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = 5
    ctx.stroke()
  }
  ctx.restore()
}

// Ultrasound fan image (grainy sector with a womb ring and baby blob(s)).
export function ultrasoundImage(twins = false, size = 512, seed = 77) {
  const c = cnv(size, Math.round(size * 0.75))
  const ctx = c.getContext('2d')
  const rand = mulberry32(seed)
  ctx.fillStyle = '#05080c'
  ctx.fillRect(0, 0, c.width, c.height)
  const ox = c.width / 2
  const oy = 20
  const R = c.height * 0.95
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(ox, oy)
  ctx.arc(ox, oy, R, Math.PI * 0.27, Math.PI * 0.73)
  ctx.closePath()
  ctx.clip()
  ctx.fillStyle = '#3a3d40'
  ctx.fillRect(0, 0, c.width, c.height)
  for (let i = 0; i < 9000; i++) {
    const v = 40 + rand() * 90
    ctx.fillStyle = `rgba(${v},${v},${v},0.35)`
    ctx.fillRect(rand() * c.width, rand() * c.height, 2 + rand() * 3, 2 + rand() * 2)
  }
  const cy = c.height * 0.55
  ctx.fillStyle = '#0d0f11'
  ctx.strokeStyle = 'rgba(220,220,220,0.75)'
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.ellipse(ox, cy, c.width * 0.26, c.height * 0.27, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  const blob = (x, y, r1, r2) => {
    const g = ctx.createRadialGradient(x, y, 2, x, y, r1)
    g.addColorStop(0, 'rgba(200,200,200,0.95)')
    g.addColorStop(1, 'rgba(120,120,120,0.85)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(x, y, r1, r2, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  if (twins) {
    blob(ox - 55, cy - 10, 30, 28)
    blob(ox - 20, cy + 30, 38, 26)
    blob(ox + 55, cy - 20, 26, 25)
    blob(ox + 70, cy + 22, 32, 22)
  } else {
    blob(ox - 30, cy - 25, 38, 36)
    blob(ox + 15, cy + 18, 55, 36)
  }
  ctx.restore()
  return c
}
