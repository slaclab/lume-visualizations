import { useEffect, useRef } from 'react'
import { INFERNO } from '../lib/inferno'
import { makeNorm } from '../lib/imageScale'
import type { ScaleMode } from '../types'

interface Props {
  image: Float32Array | null
  imageRows: number
  imageCols: number
  imageMessage: string
  screenLabel: string
  caption?: string
  scaleMode: ScaleMode
}

const CANVAS_WIDTH = 420
const CANVAS_HEIGHT = 300

export function BeamImage({
  image,
  imageRows,
  imageCols,
  imageMessage,
  screenLabel,
  caption,
  scaleMode,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const barRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    if (!image || image.length === 0 || imageRows === 0 || imageCols === 0) {
      ctx.fillStyle = '#161b22'
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
      ctx.fillStyle = '#8b949e'
      ctx.font = '13px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(imageMessage || 'Waiting for data…', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2)
      return
    }

    const rows = imageRows
    const cols = imageCols
    const norm = makeNorm(image, scaleMode)
    const imgData = ctx.createImageData(cols, rows)
    const data = imgData.data
    const N = rows * cols
    for (let i = 0; i < N; i++) {
      const t = norm(image[i])
      const idx = Math.max(0, Math.min(255, (t * 255) | 0)) * 3
      const o = i * 4
      data[o] = INFERNO[idx]
      data[o + 1] = INFERNO[idx + 1]
      data[o + 2] = INFERNO[idx + 2]
      data[o + 3] = 255
    }

    const offscreen = new OffscreenCanvas(cols, rows)
    const offCtx = offscreen.getContext('2d')!
    offCtx.putImageData(imgData, 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
    ctx.drawImage(offscreen, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  }, [image, imageRows, imageCols, imageMessage, scaleMode])

  // Static inferno colorbar (low → high).
  useEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const ctx = bar.getContext('2d')
    if (!ctx) return
    const h = bar.height
    for (let y = 0; y < h; y++) {
      const t = 1 - y / (h - 1)
      const idx = Math.max(0, Math.min(255, (t * 255) | 0)) * 3
      ctx.fillStyle = `rgb(${INFERNO[idx]},${INFERNO[idx + 1]},${INFERNO[idx + 2]})`
      ctx.fillRect(0, y, bar.width, 1)
    }
  }, [])

  return (
    <div className="panel">
      <div className="panel-title">{screenLabel} Beam Image</div>
      <div className="beam-image-row">
        <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="beam-canvas" />
        <canvas ref={barRef} width={12} height={CANVAS_HEIGHT} className="colorbar" />
      </div>
      {caption ? <div className="panel-caption">{caption}</div> : null}
    </div>
  )
}
