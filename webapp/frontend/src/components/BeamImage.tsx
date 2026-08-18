import { useEffect, useRef } from 'react'
import { INFERNO } from '../lib/inferno'
import { makeNorm } from '../lib/imageScale'
import { useElementSize } from '../hooks/useElementSize'
import { PLOT_THEMES, useTheme } from '../theme'
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

const BAR_WIDTH = 12
const BAR_GAP = 6

export function BeamImage({
  image,
  imageRows,
  imageCols,
  imageMessage,
  screenLabel,
  caption,
  scaleMode,
}: Props) {
  const { theme } = useTheme()
  const colors = PLOT_THEMES[theme]
  const [rowRef, size] = useElementSize<HTMLDivElement>()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const barRef = useRef<HTMLCanvasElement>(null)

  const w = Math.max(1, size.width - BAR_WIDTH - BAR_GAP)
  const h = Math.max(1, size.height)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size.width === 0 || size.height === 0) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    if (!image || image.length === 0 || imageRows === 0 || imageCols === 0) {
      ctx.fillStyle = colors.bg
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = colors.muted
      ctx.font = '13px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(imageMessage || 'Waiting for data…', w / 2, h / 2)
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
    ctx.clearRect(0, 0, w, h)
    ctx.drawImage(offscreen, 0, 0, w, h)
  }, [image, imageRows, imageCols, imageMessage, scaleMode, w, h, size.width, size.height, colors])

  // Static inferno colorbar (low → high), redrawn when height changes.
  useEffect(() => {
    const bar = barRef.current
    if (!bar || size.height === 0) return
    const dpr = window.devicePixelRatio || 1
    bar.width = Math.round(BAR_WIDTH * dpr)
    bar.height = Math.round(h * dpr)
    const ctx = bar.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    for (let y = 0; y < h; y++) {
      const t = 1 - y / (h - 1)
      const idx = Math.max(0, Math.min(255, (t * 255) | 0)) * 3
      ctx.fillStyle = `rgb(${INFERNO[idx]},${INFERNO[idx + 1]},${INFERNO[idx + 2]})`
      ctx.fillRect(0, y, BAR_WIDTH, 1)
    }
  }, [h, size.height])

  return (
    <div className="panel">
      <div className="panel-title beam-title">
        <span className="beam-title-text">{screenLabel} Beam Image</span>
        <span className="info-tip" tabIndex={0} role="button" aria-label={`About the ${screenLabel} beam image`}>
          <span className="info-icon" aria-hidden="true">i</span>
        </span>
        <span className="info-popover" role="tooltip">
          <strong>Incoherent OTR image.</strong> Each frame is the tracked beam’s
          transverse density convolved with the screen point-spread function
          (image = PSF ∗ ρ), shown at the camera’s pixel-limited resolution
          (17 µm/px, σ = 1 px) for the 1000-particle sample to render as a continuous spot. 
          RMS size and emittance are computed from the particle coordinates, not this image. 
          Screen does <strong>not</strong> model coherent OTR (COTR).
        </span>
      </div>
      <div ref={rowRef} className="beam-image-row">
        <canvas ref={canvasRef} className="beam-canvas" style={{ width: w, height: h }} />
        <canvas ref={barRef} className="colorbar" style={{ width: BAR_WIDTH, height: h }} />
      </div>
      {caption ? <div className="panel-caption">{caption}</div> : null}
    </div>
  )
}
