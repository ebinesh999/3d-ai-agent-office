import { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import Desk from './Desk'
import Character from './Character'
import ThoughtPanel from './ThoughtPanel'
import { useWorld } from './useWorld'

export default function App() {
  const { layout, roster, connected, live, logs, agents, moveTo } = useWorld()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = selectedId ?? roster[0]?.id ?? null

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
        <Canvas shadows camera={{ position: [9, 8, 9], fov: 45 }}>
          <color attach="background" args={['#dfe6ee']} />
          <ambientLight intensity={0.6} />
          <directionalLight
            position={[6, 10, 4]}
            intensity={1.2}
            castShadow
            shadow-mapSize={[1024, 1024]}
            shadow-camera-left={-10}
            shadow-camera-right={10}
            shadow-camera-top={10}
            shadow-camera-bottom={-10}
          />

          {layout && (
            <>
              <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <boxGeometry args={[layout.floor, layout.floor, 0.2]} />
                <meshStandardMaterial color="#9aa7b5" flatShading />
              </mesh>

              {layout.desks.map((d) => (
                <Desk
                  key={d.id}
                  position={d.position}
                  rotationY={d.rotationY}
                  onSelect={() => selected && moveTo(selected, d.id)}
                />
              ))}

              {roster.map((r) => (
                <Character
                  key={r.id}
                  id={r.id}
                  name={r.name}
                  color={r.color}
                  agents={agents}
                  walking={live[r.id]?.status === 'walking'}
                  speech={live[r.id]?.speech}
                  selected={r.id === selected}
                  onSelect={() => setSelectedId(r.id)}
                />
              ))}
            </>
          )}

          <OrbitControls makeDefault maxPolarAngle={Math.PI / 2.1} minDistance={5} maxDistance={25} />
        </Canvas>
      </div>

      <ThoughtPanel
        roster={roster}
        live={live}
        logs={logs}
        selected={selected}
        connected={connected}
        onSelect={setSelectedId}
      />
    </div>
  )
}
