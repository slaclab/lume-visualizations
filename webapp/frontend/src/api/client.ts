import type {
  ConfigResponse,
  EvaluateRequest,
  Frame,
  SnapshotResponse,
} from '../types'
import type { components } from './schema'

const API_BASE = import.meta.env.VITE_API_URL || '.'

function decodeFloat32(b64: string | null): Float32Array | null {
  if (!b64) return null
  const bin = atob(b64)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new Float32Array(bytes.buffer)
}

/** Wire shape returned by /api/evaluate and the SSE stream.
 *
 * Required<> because a response always carries every field, so the optional markers the
 * generator adds for defaulted and nullable fields would be a lie here. On the SSE path
 * that guarantee is not FastAPI's: the stream json.dumps the dict without validating it
 * against FrameResponse, so it rests on frame_to_wire() in webapp/backend/serialize.py
 * staying unconditional.
 */
type WireFrame = Required<components['schemas']['FrameResponse']>

/** Payload of the SSE `error` event (webapp/backend/live_hub.py). Not described by OpenAPI. */
interface LiveError {
  message: string
}

export function unpackFrame(p: WireFrame): Frame {
  return {
    screenKey: p.screen_key,
    screenLabel: p.screen_label,
    image: decodeFloat32(p.image_b64),
    imageRows: p.image_shape ? p.image_shape[0] : 0,
    imageCols: p.image_shape ? p.image_shape[1] : 0,
    imageMessage: p.image_message,
    imageCaption: p.image_caption,
    scalars: p.scalars,
    scatter: p.scatter_b64
      ? Object.fromEntries(
          Object.entries(p.scatter_b64).map(([k, v]) => [k, decodeFloat32(v)!]),
        )
      : {},
    scatterUnits: p.scatter_units ?? {},
    twissS: p.twiss_s,
    twissABeta: p.twiss_a_beta,
    twissBBeta: p.twiss_b_beta,
    frameIndex: p.frame_index,
    titleSuffix: p.title_suffix,
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
  const body: EvaluateRequest = { screen, inputs }
  const res = await fetch(`${API_BASE}/api/evaluate`, {
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
