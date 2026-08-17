import { useEffect, useRef } from 'react'
import { useElementSize } from '../hooks/useElementSize'
import { PLOT_THEMES, useTheme } from '../theme'

interface Props {
  x: Float32Array | null
  px: Float32Array | null
  screenLabel: string
}

const PAD = 34

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

export function PhaseSpaceScatter({ x, px, screenLabel }: Props) {
  const { theme } = useTheme()
  const colors = PLOT_THEMES[theme]
  const [hostRef, size] = useElementSize<HTMLDivElement>()
  const canvasRef = useRef<HTMLCanvasElement>(null)

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

    if (!x || !px || x.length === 0) {
      ctx.fillStyle = colors.muted
      ctx.font = '13px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText('Waiting for data…', W / 2, H / 2)
      return
    }

    const [x0, x1] = range(x)
    const [y0, y1] = range(px)
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
    for (let i = 0; i < x.length; i++) {
      ctx.fillRect(sx(x[i]), sy(px[i]), 1.4, 1.4)
    }

    ctx.fillStyle = colors.muted
    ctx.font = '10px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('x (µm)', W / 2, H - 6)
    ctx.save()
    ctx.translate(10, H / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText('px (eV/c)', 0, 0)
    ctx.restore()
  }, [x, px, W, H, size.width, size.height, colors])

  return (
    <div className="panel">
      <div className="panel-title">Phase Space x–px at {screenLabel}</div>
      <div ref={hostRef} className="scatter-host">
        <canvas ref={canvasRef} className="beam-canvas" style={{ width: W, height: H }} />
      </div>
    </div>
  )
}
