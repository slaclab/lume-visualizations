import { useEffect, useRef, useState } from 'react'
import { subscribeLive } from '../api/client'
import { Controls } from '../components/Controls'
import { DashboardLayout } from '../components/DashboardLayout'
import { DashboardPanels } from '../components/DashboardPanels'
import type { ConfigResponse, Frame, ScaleMode, Scalars, Visibility } from '../types'

type Tab = 'live' | 'interactive'

const ALL_VISIBLE: Visibility = {
  sigma_x: true,
  sigma_y: true,
  sigma_z: true,
  emit_x: true,
  emit_y: true,
  beta_x: true,
  beta_y: true,
}

export function LiveTab({
  config,
  tab,
  onTab,
}: {
  config: ConfigResponse
  tab: Tab
  onTab: (t: Tab) => void
}) {
  const [screen, setScreen] = useState(config.screens.find((s) => s.has_image)?.key ?? config.screens[0].key)
  const [scaleMode, setScaleMode] = useState<ScaleMode>('robust')
  const [visibility, setVisibility] = useState<Visibility>(ALL_VISIBLE)
  const [frame, setFrame] = useState<Frame | null>(null)
  const [tsPoint, setTsPoint] = useState<(Scalars & { x: number; key: string }) | null>(null)
  const [status, setStatus] = useState('Connecting…')
  const counterRef = useRef(0)

  useEffect(() => {
    setStatus('Connecting…')
    const unsub = subscribeLive(
      screen,
      (f) => {
        setFrame(f)
        const k = counterRef.current++
        setTsPoint({ ...f.scalars, x: f.timestamp, key: `${k}` })
        setStatus(`Live: frame ${f.frameIndex} for ${screen}`)
      },
      (msg) => setStatus(`Stream error: ${msg}`),
    )
    return unsub
  }, [screen])

  return (
    <DashboardLayout
      version={config.version}
      tab={tab}
      onTab={onTab}
      status={status}
      settings={
        <Controls
          screens={config.screens}
          screen={screen}
          onScreen={setScreen}
          scaleMode={scaleMode}
          onScaleMode={setScaleMode}
          visibility={visibility}
          onVisibility={setVisibility}
        />
      }
    >
      <DashboardPanels
        frame={frame}
        scaleMode={scaleMode}
        visibility={visibility}
        tsPoint={tsPoint}
        resetKey={screen}
        windowPoints={120}
        timeAxis
      />
    </DashboardLayout>
  )
}
