// Trip events (TRIP_EVENTS in config.js): at most one per trip, so no two trips feel the same. game.js
// rolls one when you leave home (never on your first trip), announces it at the right moment and runs
// its effect; finishing a trip that had one counts for the 'tripEvent' daily mission.
//   golden - star coins on the walk to the ambulance are worth more and sparkle
//   flat   - a flat tire halfway through the ride: pump it up (hud.pump) or the ride takes longer
//   green  - green lights all the way: the ride is faster for free
//   rain   - a rainy day: rain on the street and the ambulance windows, splashes at your feet
//   early  - the baby's coming early: one line room is skipped
import { CylinderGeometry, Euler, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from 'three'
import { TRIP_EVENTS } from './config.js'

export const TRIP_EVENT_INFO = {
  golden: { title: 'GOLDEN STARS!', sub: `Star coins are worth ${TRIP_EVENTS.goldenStars.coins} each this trip!`, color: '#ffd23a' },
  flat: { title: 'BUMPY ROAD AHEAD...', sub: 'Keep an eye on those tires!', color: '#ffb020' },
  green: { title: 'GREEN LIGHTS ALL THE WAY!', sub: `The ambulance zooms ${TRIP_EVENTS.greenLights.mult}x faster for free!`, color: '#6dff8a' },
  rain: { title: 'RAINY DAY!', sub: 'Splash through the puddles, mama!', color: '#8fd0ff' },
  early: { title: "THE BABY'S COMING EARLY!", sub: 'The nurses will skip a room for you!', color: '#ff8ac2' },
}
const IDS = Object.keys(TRIP_EVENT_INFO)

// The event for a new trip, or null. `trips` = trips finished so far (the first trip has none).
export function rollTripEvent(trips, rand = Math.random) {
  if (trips < 1 || rand() > TRIP_EVENTS.chance) return null
  return IDS[Math.floor(rand() * IDS.length)]
}

// Rain: thin streaks (one InstancedMesh, recycled around the camera / you) and splashes on the ground.
// Point particles shrink to a pixel at a distance, so the drops are real 0.55 m streaks.
const DROPS = 260
const HIDDEN = new Matrix4().makeScale(0, 0, 0)
export function makeRain(fx, scene) {
  const geo = new CylinderGeometry(0.016, 0.016, 0.6, 3, 1)
  const mat = new MeshBasicMaterial({ color: '#b4cbe8', transparent: true, opacity: 0.68, depthWrite: false, fog: true })
  const mesh = new InstancedMesh(geo, mat, DROPS)
  mesh.frustumCulled = false
  mesh.visible = false
  scene.add(mesh)
  const p = new Float32Array(DROPS * 3)
  const m = new Matrix4()
  const tilt = new Quaternion().setFromEuler(new Euler(0.06, 0, 0.05)) // falling a little slanted, like the drops' drift
  const one = new Vector3(1, 1, 1)
  const at = new Vector3()
  let seeded = false
  let splashT = 0
  const reseed = (i, c, top) => {
    p[i * 3] = c.x + (Math.random() - 0.5) * 22
    p[i * 3 + 1] = top ? c.y + 4 + Math.random() * 6 : Math.random() * (c.y + 10)
    p[i * 3 + 2] = c.z + (Math.random() - 0.5) * 22
  }
  return {
    // on = raining now; around = the point the rain falls around (camera or player).
    // exclude(x, z): true where no rain may fall (under a roof: the house, the ambulance).
    update(dt, around, { on = true, splashAt = null, exclude = null } = {}) {
      mesh.visible = on
      if (!on) {
        seeded = false
        return
      }
      if (!seeded) {
        for (let i = 0; i < DROPS; i++) reseed(i, around, false)
        seeded = true
      }
      for (let i = 0; i < DROPS; i++) {
        p[i * 3] -= 0.9 * dt
        p[i * 3 + 1] -= 17 * dt
        p[i * 3 + 2] += 0.5 * dt
        // landed (bottom tip at the ground) or drifted out of the box: a new drop up top
        if (p[i * 3 + 1] < 0.28 || Math.abs(p[i * 3] - around.x) > 12 || Math.abs(p[i * 3 + 2] - around.z) > 12) reseed(i, around, true)
        at.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2])
        mesh.setMatrixAt(i, exclude?.(at.x, at.z) ? HIDDEN : m.compose(at, tilt, one))
      }
      mesh.instanceMatrix.needsUpdate = true
      // a splash at your feet as you walk, little rings where drops land near you
      splashT -= dt
      if (splashAt && splashT <= 0) {
        splashT = 0.2
        fx.dust({ x: splashAt.x, y: 0.05, z: splashAt.z }, { count: 2, color: '#bcdcff', size: 0.25, speed: 0.9, life: 0.4 })
      }
      if (Math.random() < dt * 4) fx.ring({ x: around.x + (Math.random() - 0.5) * 8, y: 0.1, z: around.z + (Math.random() - 0.5) * 8 }, '#cfe6ff', 0.35, 0.5)
    },
  }
}
