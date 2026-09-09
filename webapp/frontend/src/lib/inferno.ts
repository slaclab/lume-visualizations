// Inferno colormap LUT (256 entries) built by interpolating anchor colors
// sampled from matplotlib's `inferno`. Used for the beam image + colorbar so the
// React port matches the marimo dashboard (which used cmap="inferno").

type RGB = [number, number, number]

const ANCHORS: RGB[] = [
  [0, 0, 4],
  [22, 11, 57],
  [66, 10, 104],
  [106, 23, 110],
  [147, 38, 103],
  [188, 55, 84],
  [221, 81, 58],
  [243, 120, 25],
  [252, 165, 10],
  [246, 215, 70],
  [252, 255, 164],
]

function buildLUT(): Uint8Array {
  const lut = new Uint8Array(256 * 3)
  const segs = ANCHORS.length - 1
  for (let i = 0; i < 256; i++) {
    const t = i / 255
    const pos = t * segs
    const lo = Math.min(Math.floor(pos), segs - 1)
    const frac = pos - lo
    const a = ANCHORS[lo]
    const b = ANCHORS[lo + 1]
    lut[i * 3] = Math.round(a[0] + (b[0] - a[0]) * frac)
    lut[i * 3 + 1] = Math.round(a[1] + (b[1] - a[1]) * frac)
    lut[i * 3 + 2] = Math.round(a[2] + (b[2] - a[2]) * frac)
  }
  return lut
}

export const INFERNO = buildLUT()

/** Map a normalized value in [0,1] to an [r,g,b] triple. */
export function infernoRGB(v: number): RGB {
  const i = Math.max(0, Math.min(255, Math.round(v * 255)))
  return [INFERNO[i * 3], INFERNO[i * 3 + 1], INFERNO[i * 3 + 2]]
}
