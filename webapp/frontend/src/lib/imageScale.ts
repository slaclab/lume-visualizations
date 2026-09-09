// Image intensity scaling, ported from lume_visualizations/dashboard.py:
//   robust -> vmin=0, vmax=99.7th percentile of positive pixels, PowerNorm(gamma=0.55)
//   fixed  -> vmin=0, vmax=max, linear
//   auto   -> vmin=min, vmax=max, linear (per-frame autoscale)
import type { ScaleMode } from '../types'

const GAMMA = 0.55
const PCT_HIGH = 99.7

function percentile(sorted: Float32Array, p: number): number {
  if (sorted.length === 0) return 1
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))))
  return sorted[idx]
}

function bounds(image: Float32Array, mode: ScaleMode): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < image.length; i++) {
    const v = image[i]
    if (!Number.isFinite(v)) continue
    if (v < min) min = v
    if (v > max) max = v
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1]

  if (mode === 'auto') return [min, max > min ? max : min + 1e-9]
  if (mode === 'fixed') return [0, max > 0 ? max : 1e-9]

  // robust: 99.7th percentile of positive pixels
  const positive = image.filter((v) => Number.isFinite(v) && v > 0)
  if (positive.length === 0) return [0, max > 0 ? max : 1e-9]
  const sorted = Float32Array.from(positive).sort()
  const high = Math.max(percentile(sorted, PCT_HIGH), sorted[sorted.length - 1])
  return [0, high > 0 ? high : 1e-9]
}

/**
 * Return a fn mapping a raw pixel value to a normalized [0,1] intensity for the
 * given scale mode over this image.
 */
export function makeNorm(image: Float32Array, mode: ScaleMode): (v: number) => number {
  const [vmin, vmax] = bounds(image, mode)
  const span = vmax - vmin || 1e-9
  if (mode === 'robust') {
    return (v: number) => {
      const t = Math.max(0, Math.min(1, (v - vmin) / span))
      return Math.pow(t, GAMMA)
    }
  }
  return (v: number) => Math.max(0, Math.min(1, (v - vmin) / span))
}
