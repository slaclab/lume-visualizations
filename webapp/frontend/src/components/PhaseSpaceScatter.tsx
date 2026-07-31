import { useEffect, useRef } from 'react'

interface Props {
  x: Float32Array | null
  px: Float32Array | null
  screenLabel: string
}

const W = 420
const H = 300
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
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#161b22'
    ctx.fillRect(0, 0, W, H)

    if (!x || !px || x.length === 0) {
      ctx.fillStyle = '#8b949e'
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
    ctx.strokeStyle = '#30363d'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD, 8)
    ctx.lineTo(PAD, H - PAD)
    ctx.lineTo(W - 8, H - PAD)
    ctx.stroke()

    ctx.fillStyle = 'rgba(88,166,255,0.35)'
    for (let i = 0; i < x.length; i++) {
      ctx.fillRect(sx(x[i]), sy(px[i]), 1.4, 1.4)
    }

    ctx.fillStyle = '#8b949e'
    ctx.font = '10px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('x (µm)', W / 2, H - 6)
    ctx.save()
    ctx.translate(10, H / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText('px (eV/c)', 0, 0)
    ctx.restore()
  }, [x, px])

  return (
    <div className="panel">
      <div className="panel-title">Phase Space x–px at {screenLabel}</div>
      <canvas ref={canvasRef} width={W} height={H} className="beam-canvas" />
    </div>
  )
}
