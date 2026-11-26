// Particle effects. Two pooled point clouds (additive glow sparks, and soft
// alpha-blended puffs for dust/smoke/clouds) drawn with one custom shader each,
// plus instanced tumbling confetti and expanding shock rings. All pools are
// allocated once; spawning only writes into free slots.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  Object3D,
  PlaneGeometry,
  Points,
  RingGeometry,
  ShaderMaterial,
  Vector3,
} from 'three'
import { paintSoftDot, paintSparkle } from './textures.js'

const VERT = /* glsl */ `
  attribute float size;
  attribute float alpha;
  attribute vec3 color;
  attribute float spin;
  varying float vAlpha;
  varying vec3 vColor;
  varying float vSpin;
  uniform float scale;
  void main() {
    vAlpha = alpha;
    vColor = color;
    vSpin = spin;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * scale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`
const FRAG = /* glsl */ `
  uniform sampler2D map;
  varying float vAlpha;
  varying vec3 vColor;
  varying float vSpin;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float c = cos(vSpin), s = sin(vSpin);
    p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
    vec4 t = texture2D(map, p);
    gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
    if (gl_FragColor.a < 0.01) discard;
  }`

class PointPool {
  constructor(scene, max, texCanvas, additive) {
    this.max = max
    this.pos = new Float32Array(max * 3)
    this.vel = new Float32Array(max * 3)
    this.col = new Float32Array(max * 3)
    this.size = new Float32Array(max)
    this.alpha = new Float32Array(max)
    this.spin = new Float32Array(max)
    this.spinV = new Float32Array(max)
    this.life = new Float32Array(max)
    this.age = new Float32Array(max)
    this.size0 = new Float32Array(max)
    this.size1 = new Float32Array(max)
    this.a0 = new Float32Array(max)
    this.grav = new Float32Array(max)
    this.drag = new Float32Array(max)
    this.cursor = 0
    const g = new BufferGeometry()
    const attr = (arr, n) => new BufferAttribute(arr, n).setUsage(DynamicDrawUsage)
    g.setAttribute('position', attr(this.pos, 3))
    g.setAttribute('color', attr(this.col, 3))
    g.setAttribute('size', attr(this.size, 1))
    g.setAttribute('alpha', attr(this.alpha, 1))
    g.setAttribute('spin', attr(this.spin, 1))
    this.geo = g
    const map = new CanvasTexture(texCanvas)
    this.mat = new ShaderMaterial({
      uniforms: { map: { value: map }, scale: { value: 600 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
    })
    this.points = new Points(g, this.mat)
    this.points.frustumCulled = false
    this.points.renderOrder = 5
    scene.add(this.points)
  }

  spawn(x, y, z, vx, vy, vz, { color = '#ffffff', size = 0.4, size1 = null, life = 1, alpha = 1, gravity = 0, drag = 0, spin = 0 } = {}) {
    const i = this.cursor
    this.cursor = (this.cursor + 1) % this.max
    this.pos[i * 3] = x
    this.pos[i * 3 + 1] = y
    this.pos[i * 3 + 2] = z
    this.vel[i * 3] = vx
    this.vel[i * 3 + 1] = vy
    this.vel[i * 3 + 2] = vz
    TMP.set(color)
    this.col[i * 3] = TMP.r
    this.col[i * 3 + 1] = TMP.g
    this.col[i * 3 + 2] = TMP.b
    this.size0[i] = size
    this.size1[i] = size1 ?? size
    this.a0[i] = alpha
    this.life[i] = life
    this.age[i] = 0
    this.grav[i] = gravity
    this.drag[i] = drag
    this.spin[i] = Math.random() * 6.28
    this.spinV[i] = spin
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0
        continue
      }
      this.age[i] += dt
      const t = this.age[i] / this.life[i]
      if (t >= 1) {
        this.life[i] = 0
        this.alpha[i] = 0
        continue
      }
      const d = Math.exp(-this.drag[i] * dt)
      this.vel[i * 3] *= d
      this.vel[i * 3 + 2] *= d
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d + this.grav[i] * dt
      this.pos[i * 3] += this.vel[i * 3] * dt
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt
      this.size[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * t
      this.alpha[i] = this.a0[i] * (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85)
      this.spin[i] += this.spinV[i] * dt
    }
    const a = this.geo.attributes
    a.position.needsUpdate = a.size.needsUpdate = a.alpha.needsUpdate = a.color.needsUpdate = a.spin.needsUpdate = true
  }
}

const TMP = new Color()
const CONFETTI_COLORS = ['#ff5fa8', '#59d0ff', '#ffd84a', '#7dff8a', '#b77dff', '#ff8a5c', '#ffffff']

export function createFx(scene) {
  const glow = new PointPool(scene, 1600, paintSparkle(64), true)
  const puff = new PointPool(scene, 700, paintSoftDot(64), false)

  // Confetti: instanced quads that tumble and flutter down.
  const CONF = 500
  const confMat = new MeshBasicMaterial({ side: DoubleSide, vertexColors: false })
  const confetti = new InstancedMesh(new PlaneGeometry(0.12, 0.2), confMat, CONF)
  confetti.instanceMatrix.setUsage(DynamicDrawUsage)
  confetti.frustumCulled = false
  const cData = Array.from({ length: CONF }, () => ({ life: 0, p: new Vector3(), v: new Vector3(), r: new Vector3(), w: new Vector3() }))
  for (let i = 0; i < CONF; i++) confetti.setColorAt(i, TMP.set(CONFETTI_COLORS[i % CONFETTI_COLORS.length]))
  scene.add(confetti)
  let cCursor = 0
  const dummy = new Object3D()
  const zero = new Matrix4().makeScale(0, 0, 0)
  for (let i = 0; i < CONF; i++) confetti.setMatrixAt(i, zero)

  // Rings: flat expanding halos (pickups, landing, shockwaves).
  const rings = []
  const ringGeo = new RingGeometry(0.85, 1, 48)
  ringGeo.rotateX(-Math.PI / 2)

  let quality = 1
  const n = (count) => Math.max(1, Math.round(count * quality))
  const rnd = (a = 1) => (Math.random() * 2 - 1) * a

  const api = {
    glow,
    puff,
    setQuality(q) {
      quality = q
    },
    sparkle(p, { count = 16, color = '#fff7b0', speed = 2.5, size = 0.35, life = 0.8, up = 1.5 } = {}) {
      for (let i = 0; i < n(count); i++) glow.spawn(p.x, p.y, p.z, rnd(speed), Math.random() * speed + up, rnd(speed), { color, size, size1: 0, life: life * (0.6 + Math.random() * 0.6), gravity: -3, drag: 2, spin: rnd(4) })
    },
    burst(p, colors = CONFETTI_COLORS, { count = 30, speed = 6, size = 0.5, life = 1.1 } = {}) {
      for (let i = 0; i < n(count); i++) {
        const c = colors[i % colors.length]
        glow.spawn(p.x, p.y, p.z, rnd(speed), rnd(speed) * 0.6 + speed * 0.4, rnd(speed), { color: c, size, size1: 0.05, life: life * (0.5 + Math.random() * 0.7), gravity: -8, drag: 2.5, spin: rnd(6) })
      }
    },
    dust(p, { count = 8, color = '#d9cfc0', size = 0.6, speed = 1.2, life = 0.9 } = {}) {
      for (let i = 0; i < n(count); i++) puff.spawn(p.x + rnd(0.3), p.y + 0.05, p.z + rnd(0.3), rnd(speed), Math.random() * speed * 0.6, rnd(speed), { color, size, size1: size * 2.4, life: life * (0.7 + Math.random() * 0.5), alpha: 0.5, drag: 3, spin: rnd(1) })
    },
    smoke(p, v, { color = '#bfbfbf', size = 0.5, life = 1.4, alpha = 0.35 } = {}) {
      puff.spawn(p.x, p.y, p.z, v.x + rnd(0.3), v.y + 0.6, v.z + rnd(0.3), { color, size, size1: size * 4, life, alpha, drag: 1.5, spin: rnd(1) })
    },
    poof(p, color = '#c07bff') {
      for (let i = 0; i < n(26); i++) puff.spawn(p.x + rnd(0.4), p.y + Math.random() * 1.6, p.z + rnd(0.4), rnd(3), Math.random() * 3, rnd(3), { color: i % 3 ? '#f2e8ff' : color, size: 0.8, size1: 2.2, life: 0.9 + Math.random() * 0.5, alpha: 0.8, drag: 3, spin: rnd(2) })
      api.burst({ x: p.x, y: p.y + 1, z: p.z }, [color, '#ffffff', '#ff6ad5'], { count: 24, speed: 5 })
      api.ring(p, color, 3.5, 0.5)
    },
    confetti(p, { count = 140, spread = 3, up = 7 } = {}) {
      for (let i = 0; i < n(count); i++) {
        const d = cData[cCursor]
        cCursor = (cCursor + 1) % CONF
        d.life = 3 + Math.random() * 2
        d.p.set(p.x + rnd(spread * 0.3), p.y, p.z + rnd(spread * 0.3))
        d.v.set(rnd(spread), up * (0.6 + Math.random() * 0.6), rnd(spread))
        d.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6)
        d.w.set(rnd(9), rnd(9), rnd(9))
      }
    },
    // Confetti raining from above a point (celebrations).
    confettiRain(p, { count = 160, radius = 5, height = 6 } = {}) {
      for (let i = 0; i < n(count); i++) {
        const d = cData[cCursor]
        cCursor = (cCursor + 1) % CONF
        d.life = 3 + Math.random() * 3
        d.p.set(p.x + rnd(radius), p.y + height + Math.random() * 3, p.z + rnd(radius))
        d.v.set(rnd(0.6), -Math.random(), rnd(0.6))
        d.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6)
        d.w.set(rnd(9), rnd(9), rnd(9))
      }
    },
    ring(p, color = '#ffffff', radius = 2, life = 0.6) {
      const m = new Mesh(ringGeo, new MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }))
      m.position.set(p.x, p.y + 0.12, p.z)
      m.scale.setScalar(0.1)
      scene.add(m)
      rings.push({ m, age: 0, life, radius })
    },
    // Speed streaks in front of a camera (speed-up feedback).
    streaks(origin, dir, count = 20) {
      for (let i = 0; i < n(count); i++) {
        glow.spawn(origin.x + rnd(2), origin.y + rnd(1.2), origin.z + rnd(2), dir.x * 25, dir.y * 25, dir.z * 25, { color: '#c9e6ff', size: 0.25, size1: 0.05, life: 0.35, alpha: 0.7 })
      }
    },
    update(dt, camera, viewportHeight) {
      const scale = viewportHeight / (2 * Math.tan((camera.fov * Math.PI) / 360))
      glow.mat.uniforms.scale.value = scale
      puff.mat.uniforms.scale.value = scale
      glow.update(dt)
      puff.update(dt)
      for (let i = 0; i < CONF; i++) {
        const d = cData[i]
        if (d.life <= 0) continue
        d.life -= dt
        if (d.life <= 0) {
          confetti.setMatrixAt(i, zero)
          continue
        }
        d.v.y = Math.max(d.v.y - 9 * dt, -1.4)
        d.v.x *= Math.exp(-1.5 * dt)
        d.v.z *= Math.exp(-1.5 * dt)
        d.p.addScaledVector(d.v, dt)
        d.p.x += Math.sin(d.life * 5 + i) * 0.4 * dt
        d.r.addScaledVector(d.w, dt)
        dummy.position.copy(d.p)
        dummy.rotation.set(d.r.x, d.r.y, d.r.z)
        dummy.scale.setScalar(Math.min(1, d.life))
        dummy.updateMatrix()
        confetti.setMatrixAt(i, dummy.matrix)
      }
      confetti.instanceMatrix.needsUpdate = true
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i]
        r.age += dt
        const t = r.age / r.life
        if (t >= 1) {
          scene.remove(r.m)
          r.m.material.dispose()
          rings.splice(i, 1)
          continue
        }
        r.m.scale.setScalar(0.1 + (1 - (1 - t) * (1 - t)) * r.radius)
        r.m.material.opacity = 0.9 * (1 - t)
      }
    },
  }
  return api
}
