import { BeamImage } from './BeamImage'
import { PhaseSpaceScatter } from './PhaseSpaceScatter'
import { ScalarTimeseries } from './ScalarTimeseries'
import { TwissPlot } from './TwissPlot'
import { ScalarDisplay } from './ScalarDisplay'
import type { Frame, ScalarInfo, ScaleMode, Scalars, Visibility } from '../types'

interface Props {
  frame: Frame | null
  /** Readout ids, labels and units, straight from GET /api/config. The backend owns
   * these, so they are not duplicated here. */
  scalars: ScalarInfo[]
  scaleMode: ScaleMode
  visibility: Visibility
  tsPoint: (Scalars & { x: number; key: string }) | null
  resetKey: string
  windowPoints?: number
  timeAxis?: boolean
}

export function DashboardPanels({
  frame,
  scalars,
  scaleMode,
  visibility,
  tsPoint,
  resetKey,
  windowPoints,
  timeAxis,
}: Props) {
  const label = frame?.screenLabel ?? ''
  return (
    <div className="dashboard">
      <div className="scalar-row">
        {scalars.map((s) => (
          <ScalarDisplay
            key={s.id}
            label={s.label}
            // The cast is the one seam left: the generated ScalarInfo.id is a plain
            // string, while Scalars has known keys. The backend owns both ends (these
            // ids come from SCALAR_INFO in schemas.py, the same module that defines
            // Scalars), so they cannot disagree without the contract test noticing.
            value={frame ? frame.scalars[s.id as keyof Scalars] : 0}
            unit={s.unit}
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
          scatter={frame?.scatter ?? {}}
          units={frame?.scatterUnits ?? {}}
          screenLabel={label}
        />
        <ScalarTimeseries
          point={tsPoint}
          resetKey={resetKey}
          visibility={visibility}
          windowPoints={windowPoints}
          timeAxis={timeAxis}
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
