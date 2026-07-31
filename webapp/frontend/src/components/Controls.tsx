import type { ReactNode } from 'react'
import type { ScaleMode, ScreenInfo, Visibility } from '../types'

interface Props {
  screens: ScreenInfo[]
  screen: string
  onScreen: (s: string) => void
  scaleMode: ScaleMode
  onScaleMode: (m: ScaleMode) => void
  visibility: Visibility
  onVisibility: (v: Visibility) => void
  children?: ReactNode
}

const VIS_ITEMS: { key: keyof Visibility; label: string }[] = [
  { key: 'sigma_x', label: 'σx' },
  { key: 'sigma_y', label: 'σy' },
  { key: 'sigma_z', label: 'σz' },
  { key: 'emit_x', label: 'εx' },
  { key: 'emit_y', label: 'εy' },
  { key: 'beta_x', label: 'βx' },
  { key: 'beta_y', label: 'βy' },
]

export function Controls({
  screens,
  screen,
  onScreen,
  scaleMode,
  onScaleMode,
  visibility,
  onVisibility,
  children,
}: Props) {
  return (
    <div className="controls-row">
      <label>
        Screen{' '}
        <select value={screen} onChange={(e) => onScreen(e.target.value)}>
          {screens.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Image scale{' '}
        <select value={scaleMode} onChange={(e) => onScaleMode(e.target.value as ScaleMode)}>
          <option value="robust">robust</option>
          <option value="fixed">fixed</option>
          <option value="auto">auto</option>
        </select>
      </label>
      <span className="vis-group">
        <b>Show:</b>
        {VIS_ITEMS.map((item) => (
          <label key={item.key} className="vis-check">
            <input
              type="checkbox"
              checked={visibility[item.key]}
              onChange={(e) => onVisibility({ ...visibility, [item.key]: e.target.checked })}
            />
            {item.label}
          </label>
        ))}
      </span>
      {children}
    </div>
  )
}
