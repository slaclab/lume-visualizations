import { BeamImage } from './BeamImage'
import { PhaseSpaceScatter } from './PhaseSpaceScatter'
import { ScalarTimeseries } from './ScalarTimeseries'
import { TwissPlot } from './TwissPlot'
import { ScalarDisplay } from './ScalarDisplay'
import type { Frame, ScaleMode, Scalars, Visibility } from '../types'

interface Props {
  frame: Frame | null
  scaleMode: ScaleMode
  visibility: Visibility
  tsPoint: (Scalars & { x: number; key: string }) | null
  resetKey: string
  windowPoints?: number
}

const READOUTS: { id: keyof Scalars; label: string; unit: string }[] = [
  { id: 'xrms_um', label: 'σx', unit: 'µm' },
  { id: 'yrms_um', label: 'σy', unit: 'µm' },
  { id: 'sigma_z_um', label: 'σz', unit: 'µm' },
  { id: 'norm_emit_x_um_rad', label: 'εx', unit: 'µm·rad' },
  { id: 'norm_emit_y_um_rad', label: 'εy', unit: 'µm·rad' },
]

export function DashboardPanels({
  frame,
  scaleMode,
  visibility,
  tsPoint,
  resetKey,
  windowPoints,
}: Props) {
  const label = frame?.screenLabel ?? ''
  return (
    <div className="dashboard">
      <div className="scalar-row">
        {READOUTS.map((r) => (
          <ScalarDisplay
            key={r.id}
            label={r.label}
            value={frame ? frame.scalars[r.id] : 0}
            unit={r.unit}
          />
        ))}
      </div>
      <div className="panel-grid">
        <BeamImage
          image={frame?.image ?? null}
          imageRows={frame?.imageRows ?? 0}
          imageCols={frame?.imageCols ?? 0}
          imageMessage={frame?.imageMessage ?? ''}
          screenLabel={label}
          caption={frame?.imageCaption}
          scaleMode={scaleMode}
        />
        <PhaseSpaceScatter
          x={frame?.scatterX ?? null}
          px={frame?.scatterPx ?? null}
          screenLabel={label}
        />
        <ScalarTimeseries
          point={tsPoint}
          resetKey={resetKey}
          visibility={visibility}
          windowPoints={windowPoints}
        />
        <TwissPlot
          s={frame?.twissS ?? null}
          betaX={frame?.twissABeta ?? null}
          betaY={frame?.twissBBeta ?? null}
          visibility={visibility}
        />
      </div>
    </div>
  )
}
