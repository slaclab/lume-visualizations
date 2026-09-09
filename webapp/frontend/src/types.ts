import type { components } from './api/schema'

type S = components['schemas']

// Wire shapes are generated from the backend OpenAPI schema, not hand-written. After
// changing webapp/backend/schemas.py run `npm run gen:api`, or CI fails the drift check.
// Request types are never wrapped in Required<>, because an absent field is legitimate
// in a request body.
export type ScreenInfo = S['ScreenInfo']
export type InputInfo = S['InputInfo']
export type ScalarInfo = S['ScalarInfo']
export type ConfigResponse = S['ConfigResponse']
export type Scalars = S['Scalars']
export type SnapshotResponse = S['SnapshotResponse']
export type EvaluateRequest = S['EvaluateV1Request']

/** Decoded beam frame ready for rendering. UI-side shape, no backend counterpart. */
export interface Frame {
  screenKey: string
  screenLabel: string
  image: Float32Array | null
  imageRows: number
  imageCols: number
  imageMessage: string
  imageCaption: string
  scalars: Scalars
  /** Plottable phase-space coords from the response distribution, keyed by coord name
   * (x, px, y, py, z, pz). `weight` is stripped in unpackFrame: it is a particle charge,
   * not an axis. */
  scatter: Record<string, Float32Array>
  /** Unit for each coord as stated by the response, e.g. { x: "µm", px: "eV/c" }. */
  scatterUnits: Record<string, string>
  twissS: number[] | null
  twissABeta: number[] | null
  twissBBeta: number[] | null
  frameIndex: number
  timestamp: number
}

export type ScaleMode = 'robust' | 'fixed' | 'auto'

export interface Visibility {
  sigma_x: boolean
  sigma_y: boolean
  sigma_z: boolean
  emit_x: boolean
  emit_y: boolean
  beta_x: boolean
  beta_y: boolean
}
