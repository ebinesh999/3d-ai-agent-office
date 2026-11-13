type Props = {
  position: [number, number, number]
  rotationY?: number
  onSelect?: () => void
}

const legOffsets: [number, number][] = [
  [-0.8, -0.4],
  [0.8, -0.4],
  [-0.8, 0.4],
  [0.8, 0.4],
]

export default function Desk({ position, rotationY = 0, onSelect }: Props) {
  return (
    <group
      position={position}
      rotation={[0, rotationY, 0]}
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
      {/* Desktop */}
      <mesh position={[0, 0.8, 0]} castShadow receiveShadow>
        <boxGeometry args={[2, 0.1, 1.1]} />
        <meshStandardMaterial color="#c58b4e" flatShading />
      </mesh>
      {/* Legs */}
      {legOffsets.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.4, z]} castShadow>
          <boxGeometry args={[0.1, 0.8, 0.1]} />
          <meshStandardMaterial color="#5a4630" flatShading />
        </mesh>
      ))}
      {/* Monitor */}
      <mesh position={[0, 1.2, -0.25]} castShadow>
        <boxGeometry args={[0.8, 0.5, 0.05]} />
        <meshStandardMaterial color="#2b2f36" flatShading />
      </mesh>
      <mesh position={[0, 0.93, -0.25]} castShadow>
        <boxGeometry args={[0.15, 0.15, 0.1]} />
        <meshStandardMaterial color="#2b2f36" flatShading />
      </mesh>
      {/* Chair (low-poly cylinder + seat) */}
      <mesh position={[0, 0.45, 1]} castShadow>
        <cylinderGeometry args={[0.35, 0.35, 0.1, 6]} />
        <meshStandardMaterial color="#3d6fb6" flatShading />
      </mesh>
      <mesh position={[0, 0.9, 1.3]} castShadow>
        <boxGeometry args={[0.6, 0.6, 0.08]} />
        <meshStandardMaterial color="#3d6fb6" flatShading />
      </mesh>
    </group>
  )
}
