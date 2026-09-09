import type {
  ConfigResponse,
  EvaluateRequest,
  Frame,
  SnapshotResponse,
} from '../types'
import type { components } from './schema'

const API_BASE = import.meta.env.VITE_API_URL || '.'

/** Particles requested per evaluate. Enough for a dense scatter plot without making the
 * payload dominate the frame. Matches the backend's own default cap. */
const MAX_SCATTER_POINTS = 3000

function decodeFloat32(b64: string | null): Float32Array | null {
  if (!b64) return null
  const bin = atob(b64)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new Float32Array(bytes.buffer)
}

/** Wire shape returned by /api/v1/evaluate and the SSE stream. One shape for both.
 *
 * Required<> because a response always carries every key, including the opt-in ones,
 * which are null rather than absent when not requested. Without it the generator's
 * optional markers would force null-checks that can never fire. On the SSE path this is
 * not guaranteed by FastAPI: the stream json.dumps the dict without validating it, so it
 * rests on frame_to_wire() in webapp/backend/serialize.py staying unconditional, which
 * tests/test_wire_shape.py enforces across every screen.
 */
type WireFrame = Required<components['schemas']['EvaluateV1Response']>

/** Payload of the SSE `error` event (webapp/backend/live_hub.py). Not described by OpenAPI. */
interface LiveError {
  message: string
}

/** Particle charge. Present in the distribution for physics callers, but it is not a
 * phase-space axis, so it must not reach the scatter plot's axis pickers. */
const NON_AXIS_COORDS = new Set(['weight'])

export function unpackFrame(p: WireFrame): Frame {
  const coords = p.distribution?.coords ?? {}
  const units = p.distribution?.units ?? {}
  const axes = Object.keys(coords).filter((k) => !NON_AXIS_COORDS.has(k))
  return {
    screenKey: p.screen,
    screenLabel: p.screen_label,
    image: decodeFloat32(p.image?.data_b64 ?? null),
    imageRows: p.image ? p.image.shape[0] : 0,
    imageCols: p.image ? p.image.shape[1] : 0,
    imageMessage: p.image_message,
    imageCaption: p.image_caption,
    scalars: p.scalars,
    scatter: Object.fromEntries(axes.map((k) => [k, decodeFloat32(coords[k])!])),
    scatterUnits: Object.fromEntries(axes.map((k) => [k, units[k] ?? ''])),
    twissS: p.twiss?.s ?? null,
    twissABeta: p.twiss?.beta_x ?? null,
    twissBBeta: p.twiss?.beta_y ?? null,
    frameIndex: p.frame_index,
    timestamp: p.timestamp,
  }
}

export async function fetchConfig(): Promise<ConfigResponse> {
  const res = await fetch(`${API_BASE}/api/config`)
  if (!res.ok) throw new Error(`config: ${res.status}`)
  return res.json()
}

export async function evaluate(
  screen: string,
  inputs: Record<string, number>,
): Promise<Frame> {
  // The dashboard renders all four panels, so it opts into every output. This is the
  // same endpoint external callers use, they just ask for less.
  const body: EvaluateRequest = {
    screen,
    inputs,
    include_image: true,
    include_distribution: true,
    include_twiss: true,
    max_particles: MAX_SCATTER_POINTS,
  }
  const res = await fetch(`${API_BASE}/api/v1/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`evaluate: ${res.status}`)
  return unpackFrame(await res.json())
}

export async function machineSnapshot(): Promise<Record<string, number>> {
  const res = await fetch(`${API_BASE}/api/machine-snapshot`)
  if (!res.ok) throw new Error(`machine-snapshot: ${res.status}`)
  const data: SnapshotResponse = await res.json()
  return data.inputs
}

/** Subscribe to the read-only live SSE stream. Returns an unsubscribe fn. */
export function subscribeLive(
  screen: string,
  onFrame: (frame: Frame) => void,
  onError?: (message: string) => void,
): () => void {
  const url = `${API_BASE}/api/live/stream?screen=${encodeURIComponent(screen)}`
  const es = new EventSource(url)
  es.addEventListener('frame', (ev) => {
    onFrame(unpackFrame(JSON.parse((ev as MessageEvent).data)))
  })
  es.addEventListener('error', (ev) => {
    const data = (ev as MessageEvent).data
    if (data && onError) {
      try {
        onError((JSON.parse(data) as LiveError).message)
      } catch {
        onError('stream error')
      }
    }
  })
  return () => es.close()
}

export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}
