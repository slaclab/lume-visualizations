export interface ScreenInfo {
  key: string
  label: string
  has_image: boolean
}

export interface InputInfo {
  id: string
  label: string
  min: number
  max: number
  default: number
  unit: string
}

export interface ScalarInfo {
  id: string
  label: string
  unit: string
}

export interface ConfigResponse {
  model: string
  version: string
  screens: ScreenInfo[]
  inputs: InputInfo[]
  scalars: ScalarInfo[]
}

export interface Scalars {
  xrms_um: number
  yrms_um: number
  sigma_z_um: number
  norm_emit_x_um_rad: number
  norm_emit_y_um_rad: number
}

/** Decoded beam frame ready for rendering. */
export interface Frame {
  screenKey: string
  screenLabel: string
  image: Float32Array | null
  imageRows: number
  imageCols: number
  imageMessage: string
  imageCaption: string
  scalars: Scalars
  scatterX: Float32Array | null
  scatterPx: Float32Array | null
  twissS: number[] | null
  twissABeta: number[] | null
  twissBBeta: number[] | null
  frameIndex: number
  titleSuffix: string
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
