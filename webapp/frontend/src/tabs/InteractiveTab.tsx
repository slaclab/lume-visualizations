import { useCallback, useEffect, useRef, useState } from 'react'
import { evaluate, machineSnapshot } from '../api/client'
import { Controls } from '../components/Controls'
import { DashboardLayout } from '../components/DashboardLayout'
import { DashboardPanels } from '../components/DashboardPanels'
import { SliderControl } from '../components/SliderControl'
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

const SCAN_PV = 'QUAD:IN20:525:BCTRL'
const SCAN_STEPS = 20

export function InteractiveTab({
  config,
  tab,
  onTab,
}: {
  config: ConfigResponse
  tab: Tab
  onTab: (t: Tab) => void
}) {
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(config.inputs.map((i) => [i.id, i.default])),
  )
  const [screen, setScreen] = useState(config.screens.find((s) => s.has_image)?.key ?? config.screens[0].key)
  const [scaleMode, setScaleMode] = useState<ScaleMode>('robust')
  const [visibility, setVisibility] = useState<Visibility>(ALL_VISIBLE)
  const [frame, setFrame] = useState<Frame | null>(null)
  const [tsPoint, setTsPoint] = useState<(Scalars & { x: number; key: string }) | null>(null)
  const [status, setStatus] = useState('')

  const reqSeqRef = useRef(0)
  const counterRef = useRef(0)
  const scanRef = useRef(false)

  const runEval = useCallback(
    async (inputs: Record<string, number>, scr: string) => {
      // Sequence each request; only the newest result is applied so a slower
      // in-flight eval can't overwrite the frame for a later slider position.
      const seq = ++reqSeqRef.current
      try {
        const f = await evaluate(scr, inputs)
        if (seq !== reqSeqRef.current) return // superseded by a newer request
        setFrame(f)
        const x = counterRef.current++
        setTsPoint({ ...f.scalars, x, key: `${x}` })
        setStatus(`Eval #${x} for ${scr}`)
      } catch (e) {
        if (seq !== reqSeqRef.current) return
        setStatus(`Error: ${(e as Error).message}`)
      }
    },
    [],
  )

  // Initial + screen-change evaluate.
  useEffect(() => {
    void runEval(values, screen)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen])

  // Evaluate once on mount.
  useEffect(() => {
    void runEval(values, screen)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Live value update while dragging — updates the slider/label only, no eval.
  const handleSlider = useCallback((id: string, value: number) => {
    setValues((prev) => ({ ...prev, [id]: value }))
  }, [])

  // Commit on release (pointer up / key up / reset): run exactly one eval for the
  // final value. Avoids the eval-storm of evaluating every intermediate drag value.
  const handleCommit = useCallback(
    (id: string, value: number) => {
      setValues((prev) => {
        const next = { ...prev, [id]: value }
        void runEval(next, screen)
        return next
      })
    },
    [runEval, screen],
  )

  const applyMachine = useCallback(async () => {
    try {
      const snap = await machineSnapshot()
      setValues((prev) => {
        const next = { ...prev, ...snap }
        void runEval(next, screen)
        return next
      })
      setStatus(`Applied ${Object.keys(snap).length} machine values`)
    } catch (e) {
      setStatus(`Snapshot failed: ${(e as Error).message}`)
    }
  }, [runEval, screen])

  const scanQuad = useCallback(async () => {
    const cfg = config.inputs.find((i) => i.id === SCAN_PV)
    if (!cfg) {
      setStatus(`${SCAN_PV} not available`)
      return
    }
    scanRef.current = true
    for (let i = 0; i < SCAN_STEPS; i++) {
      if (!scanRef.current) break
      const v = cfg.min + ((cfg.max - cfg.min) * i) / (SCAN_STEPS - 1)
      const next = { ...values, [SCAN_PV]: v }
      setValues(next)
      setStatus(`Scan ${SCAN_PV}: step ${i + 1}/${SCAN_STEPS} = ${v.toFixed(3)}`)
      await runEval(next, screen)
      await new Promise((r) => setTimeout(r, 700))
    }
    scanRef.current = false
  }, [config.inputs, values, runEval, screen])

  useEffect(() => () => {
    scanRef.current = false
  }, [])

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
        >
          <button onClick={() => void applyMachine()}>Apply current machine values</button>
          <button onClick={() => void scanQuad()}>Scan Quad</button>
        </Controls>
      }
      sliders={config.inputs.map((cfg) => (
        <SliderControl
          key={cfg.id}
          config={cfg}
          value={values[cfg.id]}
          onChange={handleSlider}
          onCommit={handleCommit}
        />
      ))}
    >
      <DashboardPanels
        frame={frame}
        scaleMode={scaleMode}
        visibility={visibility}
        tsPoint={tsPoint}
        resetKey={screen}
      />
    </DashboardLayout>
  )
}
