import { useEffect, useRef, useState } from 'react'
import { useElementSize } from '../hooks/useElementSize'
import { PLOT_THEMES, useTheme } from '../theme'

interface Props {
  scatter: Record<string, Float32Array>
  units: Record<string, string>
  screenLabel: string
}

const PAD = 42
// Fallback ordering only. The real coord list comes from the response, so a model that
// exposes different coords needs no change here. `weight` is already stripped upstream in
// unpackFrame, since it is a particle charge rather than a phase-space axis.
const COORD_ORDER = ['x', 'px', 'y', 'py', 'z', 'pz']

function range(a: Float32Array): [number, number] {
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < a.length; i++) {
    if (a[i] < lo) lo = a[i]
    if (a[i] > hi) hi = a[i]
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [-1, 1]
  const pad = Math.max((hi - lo) * 0.08, 1)
  return [lo - pad, hi + pad]
}

function axisLabel(coord: string, units: Record<string, string>): string {
  const u = units[coord]
  return u ? `${coord} (${u})` : coord
}

export function PhaseSpaceScatter({ scatter, units, screenLabel }: Props) {
  const { theme } = useTheme()
  const colors = PLOT_THEMES[theme]
  const [hostRef, size] = useElementSize<HTMLDivElement>()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [xCoord, setXCoord] = useState<string>('x')
  const [yCoord, setYCoord] = useState<string>('px')

  // Axis options come from the frame itself. Sorted into the conventional order where
  // recognised, so the picker does not reshuffle as coords arrive.
  const coords = Object.keys(scatter).sort((a, b) => {
    const ia = COORD_ORDER.indexOf(a)
    const ib = COORD_ORDER.indexOf(b)
    return (ia < 0 ? COORD_ORDER.length : ia) - (ib < 0 ? COORD_ORDER.length : ib)
  })

  const W = Math.max(1, size.width)
  const H = Math.max(1, size.height)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size.width === 0 || size.height === 0) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = colors.bg
    ctx.fillRect(0, 0, W, H)

    const xs = scatter[xCoord]
    const ys = scatter[yCoord]
    if (!xs || !ys || xs.length === 0) {
      ctx.fillStyle = colors.muted
      ctx.font = '13px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText('Waiting for data…', W / 2, H / 2)
      return
    }

    const [x0, x1] = range(xs)
    const [y0, y1] = range(ys)
    const sx = (v: number) => PAD + ((v - x0) / (x1 - x0)) * (W - PAD - 8)
    const sy = (v: number) => H - PAD - ((v - y0) / (y1 - y0)) * (H - PAD - 8)

    // axes
    ctx.strokeStyle = colors.grid
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD, 8)
    ctx.lineTo(PAD, H - PAD)
    ctx.lineTo(W - 8, H - PAD)
    ctx.stroke()

    ctx.fillStyle = colors.scatter
    const n = Math.min(xs.length, ys.length)
    for (let i = 0; i < n; i++) {
      ctx.fillRect(sx(xs[i]), sy(ys[i]), 1.4, 1.4)
    }

    ctx.fillStyle = colors.muted
    ctx.font = '10px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText(axisLabel(xCoord, units), W / 2, H - 6)
    ctx.save()
    ctx.translate(12, H / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText(axisLabel(yCoord, units), 0, 0)
    ctx.restore()
  }, [scatter, xCoord, yCoord, units, W, H, size.width, size.height, colors])

  return (
    <div className="panel">
      <div className="panel-title scatter-title">
        <span>Phase Space{screenLabel ? ` @ ${screenLabel}` : ''}</span>
        <span className="axis-picker">
          <label>
            Y
            <select value={yCoord} onChange={(e) => setYCoord(e.target.value)}>
              {coords.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            X
            <select value={xCoord} onChange={(e) => setXCoord(e.target.value)}>
              {coords.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </span>
      </div>
      <div ref={hostRef} className="scatter-host">
        <canvas ref={canvasRef} className="beam-canvas" style={{ width: W, height: H }} />
      </div>
    </div>
  )
}
