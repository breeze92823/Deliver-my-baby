// Bloxity custom characters: a whole-body .glb a player can wear instead of the regular avatar
// (SDK.avatar.getCharacter() for you, getCharacterFor(equipped) for the other moms; both
// { id, name, glbUrl, textureUrl, rig: { joints, anchors, height, fit? } } or null).
//
// Per the docs, a custom character shares player.glb's 22 bones, names and rest rotations (only
// the joint positions and the mesh differ), is authored in the same units (feet at y 0, 6.4 units
// tall), so it scales by the same factor and avatar/animator.js + emotes drive it unchanged. It
// wears NO skin, face / shirt / pants, body parts or proportions; its hat / hair / back / neck /
// chest / waist items are placed with SDK.avatar.characterAccessoryMatrix(character, bone) *
// translate(origin), or, for older characters without one, scale(rig.anchors[bone]) * the
// standard bone-local placement. avatar/belly.js finds its torso by skin weight like any other.
//
// "Never hide the player": anything missing or failing returns null and the caller draws the
// regular avatar instead. Nothing here throws outward.
import { Matrix4, SRGBColorSpace, TextureLoader } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { PLAYER_DIMS, RIG_HEIGHT } from '../config.js'
import { attachEquippedItems } from './loader.js'

const HAT_LIFT = 0.8
// Bones the animator, the belly and the items need; a .glb without them is not a usable character.
const REQUIRED_BONES = ['Rig1', 'Spine1', 'Spine2', 'Neck1', 'ArmL1', 'ArmR1', 'LegL1', 'LegR1']

const gltfLoader = new GLTFLoader()
const textureLoader = new TextureLoader()
const gltfs = new Map() // glbUrl -> Promise<gltf>: each character loads once, every wearer clones it
const textures = new Map() // textureUrl -> Promise<Texture | null>

export const isCharacter = (c) => !!c && typeof c === 'object' && typeof c.glbUrl === 'string' && !!c.glbUrl

function loadGltf(url) {
  let p = gltfs.get(url)
  if (!p) {
    p = gltfLoader.loadAsync(url)
    p.catch(() => gltfs.delete(url)) // a failed load can be retried next time
    gltfs.set(url, p)
  }
  return p
}

function loadTexture(url) {
  let p = textures.get(url)
  if (!p) {
    p = textureLoader
      .loadAsync(url)
      .then((t) => {
        t.flipY = false // glTF UV convention
        t.colorSpace = SRGBColorSpace
        return t
      })
      .catch(() => null)
    textures.set(url, p)
  }
  return p
}

// rig.anchors[bone] as an [x, y, z] scale (a number, an array, {x,y,z} or { scale }); 1 when unknown.
function anchorScale(character, bone) {
  const a = character?.rig?.anchors?.[bone]
  const v = a && typeof a === 'object' && !Array.isArray(a) && 'scale' in a ? a.scale : a
  if (typeof v === 'number' && v > 0) return [v, v, v]
  if (Array.isArray(v) && v.length >= 3 && v.every((n) => typeof n === 'number')) return v.slice(0, 3)
  if (v && typeof v === 'object' && ['x', 'y', 'z'].every((k) => typeof v[k] === 'number')) return [v.x, v.y, v.z]
  return [1, 1, 1]
}

// The item placement for this character (see the header), as a loader.js `place(slot, object)`.
function placer(character, accessoryMatrix) {
  const matrices = new Map()
  const matrixFor = (bone) => {
    if (!matrices.has(bone)) {
      let m = null
      try {
        const e = accessoryMatrix?.(character, bone)
        if (Array.isArray(e) || ArrayBuffer.isView(e)) {
          if (e.length === 16 && Array.from(e).every(Number.isFinite)) m = new Matrix4().fromArray(Array.from(e)) // column-major
        }
      } catch {
        m = null
      }
      matrices.set(bone, m)
    }
    return matrices.get(bone)
  }
  const local = new Matrix4()
  return (slot, object) => {
    const m = slot.origin ? matrixFor(slot.attach) : null
    if (m) {
      local.copy(m).multiply(new Matrix4().makeTranslation(...slot.origin))
      local.decompose(object.position, object.quaternion, object.scale)
      return
    }
    // Older character: the standard bone-local spot, scaled by the bone's anchor.
    const [sx, sy, sz] = anchorScale(character, slot.attach)
    const at = slot.at || (slot.key === 'hatId' ? [0, HAT_LIFT, 0] : [0, 0, 0])
    object.position.set(at[0] * sx, at[1] * sy, at[2] * sz)
    object.scale.set(sx, sy, sz)
  }
}

// A ready-to-draw character root (same shape as character.js's loadBaseCharacter(): `nodes`,
// `animations`, scaled to game metres), already wearing `equipped`'s items; null to fall back.
// `accessoryMatrix(character, bone)` is bloxity.characterAccessoryMatrix.
export async function loadCustomCharacter(character, equipped, { accessoryMatrix, signal } = {}) {
  if (!isCharacter(character)) return null
  try {
    const gltf = await loadGltf(character.glbUrl)
    if (signal?.aborted) return null
    const root = cloneSkeleton(gltf.scene)
    root.name = 'character'
    root.nodes = {}
    root.traverse((o) => {
      if (o.name && !root.nodes[o.name]) root.nodes[o.name] = o
    })
    const missing = REQUIRED_BONES.filter((b) => !root.nodes[b])
    if (missing.length) {
      console.warn('[customCharacter] rig is missing bones; using the regular avatar', character.id, missing)
      return null
    }
    let meshes = 0
    const bare = []
    root.traverse((o) => {
      if (!o.isMesh && !o.isSkinnedMesh) return
      meshes++
      o.castShadow = true
      o.frustumCulled = false
      // Each wearer gets its own materials (a texture swap must not leak onto other moms).
      o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material?.clone()
      for (const m of [o.material].flat()) if (m && !m.map) bare.push(m)
    })
    if (!meshes) return null
    // The texture is normally embedded; textureUrl only dresses materials that came without one.
    if (bare.length && typeof character.textureUrl === 'string' && character.textureUrl) {
      const tex = await loadTexture(character.textureUrl)
      if (signal?.aborted) return null
      if (tex) for (const m of bare) {
        m.map = tex
        if (m.color) m.color.set(0xffffff)
        m.needsUpdate = true
      }
    }
    root.animations = gltf.animations || []
    root.userData.customCharacter = { id: String(character.id ?? ''), name: character.name || '' }
    root.scale.setScalar(PLAYER_DIMS.height / RIG_HEIGHT)
    if (equipped) await attachEquippedItems(root, equipped, { signal, place: placer(character, accessoryMatrix) })
    if (signal?.aborted) return null
    return root
  } catch (err) {
    console.warn('[customCharacter] load failed; using the regular avatar', character?.id, err)
    return null
  }
}
