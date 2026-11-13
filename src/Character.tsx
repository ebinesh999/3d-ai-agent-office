import { Component, Suspense, useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, useAnimations, useGLTF } from '@react-three/drei'
import { Color, Group, MathUtils, Mesh, MeshStandardMaterial } from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { AgentState } from '../shared/protocol'

/**
 * Drop any Mixamo character here (exported as .glb with its Idle and Walk clips).
 * Clips are matched by name: /idle/i and /walk/i.
 */
export const MODEL_URL = '/models/character.glb'
const GROUND_Y = 0.1 // top of the floor slab
const NAME_Y = 2.15
const BUBBLE_Y = 2.8

type Props = {
  id: string
  name: string
  color: string
  agents: MutableRefObject<Map<string, AgentState>>
  walking: boolean
  speech?: string | null
  selected?: boolean
  onSelect?: () => void
}

/** The animated Mixamo-rigged model: one skeleton clone per agent, crossfading idle <-> walk. */
function ModelBody({ color, walking }: { color: string; walking: boolean }) {
  const { scene, animations } = useGLTF(MODEL_URL)
  const root = useRef<Group>(null)

  const model = useMemo(() => {
    const c = cloneSkinned(scene)
    // Soft tint so the three agents are tell-apart-able without losing the textures
    const tint = new Color(color).lerp(new Color('#ffffff'), 0.5)
    c.traverse((o) => {
      const mesh = o as Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      const mat = (mesh.material as MeshStandardMaterial).clone()
      if (mat.name !== 'visor' && !/visor/i.test(mesh.name)) mat.color.copy(tint)
      mesh.material = mat
    })
    return c
  }, [scene, color])

  const { actions } = useAnimations(animations, root)

  useEffect(() => {
    const find = (re: RegExp) => Object.entries(actions).find(([n]) => re.test(n))?.[1] ?? null
    const next = find(walking ? /walk/i : /idle/i)
    if (!next) return
    next.setEffectiveTimeScale(walking ? 1.6 : 1) // match the server's walking speed
    next.reset().fadeIn(0.25).play()
    return () => {
      next.fadeOut(0.25)
    }
  }, [walking, actions])

  return (
    <group ref={root}>
      <primitive object={model} />
    </group>
  )
}

function CapsuleBody({ color }: { color: string }) {
  return (
    <mesh position={[0, 0.7, 0]} castShadow>
      <capsuleGeometry args={[0.3, 0.8, 2, 6]} />
      <meshStandardMaterial color={color} flatShading />
    </mesh>
  )
}

/** If the .glb is missing or fails to parse, fall back to the capsule instead of crashing the scene. */
class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(err: unknown) {
    console.warn(`Could not load ${MODEL_URL}; using capsule fallback.`, err)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** Pure renderer: eases toward the latest server snapshot, never decides where to go. */
export default function Character({ id, name, color, agents, walking, speech, selected, onSelect }: Props) {
  const ref = useRef<Group>(null)
  const placed = useRef(false)

  useFrame((_, dt) => {
    const g = ref.current
    const s = agents.current.get(id)
    if (!g || !s) return
    dt = Math.min(dt, 0.05)
    if (!placed.current) {
      g.position.set(s.x, GROUND_Y, s.z)
      g.rotation.y = s.heading
      placed.current = true
    }
    // Smooth the 20Hz snapshots into per-frame motion
    g.position.x = MathUtils.damp(g.position.x, s.x, 18, dt)
    g.position.z = MathUtils.damp(g.position.z, s.z, 18, dt)
    const diff = MathUtils.euclideanModulo(s.heading - g.rotation.y + Math.PI, Math.PI * 2) - Math.PI
    g.rotation.y += diff * (1 - Math.exp(-18 * dt))
  })

  const fallback = <CapsuleBody color={color} />

  return (
    <group ref={ref} position={[0, GROUND_Y, 0]}>
      <Html position={[0, NAME_Y, 0]} center distanceFactor={10} style={{ pointerEvents: 'none' }}>
        <div style={{ font: '600 13px sans-serif', color: '#fff', background: color, padding: '1px 8px', borderRadius: 8 }}>
          {name}
        </div>
      </Html>
      {speech && (
        <Html position={[0, BUBBLE_Y, 0]} center distanceFactor={10} zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
          <div
            style={{
              background: 'white',
              color: '#222',
              padding: '6px 10px',
              borderRadius: 10,
              border: `2px solid ${color}`,
              font: '14px sans-serif',
              width: 'max-content',
              maxWidth: 220,
              boxShadow: '0 2px 8px rgba(0,0,0,.25)',
            }}
          >
            {speech}
          </div>
        </Html>
      )}

      {selected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.55, 0.68, 24]} />
          <meshBasicMaterial color={color} />
        </mesh>
      )}

      <ModelBoundary fallback={fallback}>
        <Suspense fallback={fallback}>
          <ModelBody color={color} walking={walking} />
        </Suspense>
      </ModelBoundary>

      {/* Invisible click target: skinned meshes raycast against their bind pose, so use a simple proxy */}
      <mesh
        position={[0, 0.9, 0]}
        onClick={(e) => {
          e.stopPropagation()
          onSelect?.()
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          document.body.style.cursor = ''
        }}
      >
        <capsuleGeometry args={[0.4, 1.0, 2, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}

useGLTF.preload(MODEL_URL)
