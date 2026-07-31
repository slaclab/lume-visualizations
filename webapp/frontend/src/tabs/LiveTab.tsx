import { useEffect, useRef, useState } from 'react'
import { subscribeLive } from '../api/client'
import { Controls } from '../components/Controls'
import { DashboardPanels } from '../components/DashboardPanels'
import type { ConfigResponse, Frame, ScaleMode, Scalars, Visibility } from '../types'

const ALL_VISIBLE: Visibility = {
  sigma_x: true,
  sigma_y: true,
  sigma_z: true,
  emit_x: true,
  emit_y: true,
  beta_x: true,
  beta_y: true,
}

export function LiveTab({ config }: { config: ConfigResponse }) {
  const [screen, setScreen] = useState(config.screens.find((s) => s.has_image)?.key ?? config.screens[0].key)
  const [scaleMode, setScaleMode] = useState<ScaleMode>('robust')
  const [visibility, setVisibility] = useState<Visibility>(ALL_VISIBLE)
  const [period, setPeriod] = useState(1.0)
  const [frame, setFrame] = useState<Frame | null>(null)
  const [tsPoint, setTsPoint] = useState<(Scalars & { x: number; key: string }) | null>(null)
  const [status, setStatus] = useState('Connecting…')
  const counterRef = useRef(0)

  useEffect(() => {
    setStatus('Connecting…')
    const unsub = subscribeLive(
      screen,
      period,
      (f) => {
        setFrame(f)
        const x = counterRef.current++
        setTsPoint({ ...f.scalars, x, key: `${x}` })
        setStatus(`Live: frame ${f.frameIndex} for ${screen}`)
      },
      (msg) => setStatus(`Stream error: ${msg}`),
    )
    return unsub
  }, [screen, period])

  return (
    <div>
      <Controls
        screens={config.screens}
        screen={screen}
        onScreen={setScreen}
        scaleMode={scaleMode}
        onScaleMode={setScaleMode}
        visibility={visibility}
        onVisibility={setVisibility}
      >
        <label>
          Poll period{' '}
          <input
            type="range"
            min={0.2}
            max={5}
            step={0.1}
            value={period}
            onChange={(e) => setPeriod(parseFloat(e.target.value))}
          />
          {period.toFixed(1)}s
        </label>
      </Controls>

      <DashboardPanels
        frame={frame}
        scaleMode={scaleMode}
        visibility={visibility}
        tsPoint={tsPoint}
        resetKey={screen}
        windowPoints={120}
      />

      <div className="status">{status}</div>
    </div>
  )
}
