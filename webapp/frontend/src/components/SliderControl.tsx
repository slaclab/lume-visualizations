import type { SyntheticEvent } from 'react'
import type { InputInfo } from '../types'

interface Props {
  config: InputInfo
  value: number
  /** Live value change while dragging (updates the slider only). */
  onChange: (id: string, value: number) => void
  /** Commit the final value (on release / keyup / reset) — triggers an eval. */
  onCommit: (id: string, value: number) => void
}

export function SliderControl({ config, value, onChange, onCommit }: Props) {
  const step = (config.max - config.min) / 200 || 0.001

  const commit = (e: SyntheticEvent<HTMLInputElement>) =>
    onCommit(config.id, parseFloat(e.currentTarget.value))

  return (
    <div className="slider-control">
      <div className="slider-header">
        <span className="slider-label">{config.label}</span>
        <span className="slider-value">
          {value.toFixed(3)} {config.unit}
        </span>
      </div>
      <input
        type="range"
        min={config.min}
        max={config.max}
        step={step}
        value={value}
        onChange={(e) => onChange(config.id, parseFloat(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
      />
      <div className="slider-range">
        <span>{config.min.toFixed(2)}</span>
        <button
          className="reset-btn"
          onClick={() => onCommit(config.id, config.default)}
          title="Reset to default"
        >
          Reset
        </button>
        <span>{config.max.toFixed(2)}</span>
      </div>
    </div>
  )
}
