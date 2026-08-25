export interface LegendItem {
  label: string
  color: string
  dashed?: boolean
  hidden?: boolean
  /** Value at the hovered cursor position, shown when present. */
  value?: string
}

interface Props {
  items: LegendItem[]
  /** Readout for the hovered x position (e.g. a timestamp or index). */
  cursor?: string | null
}

export function PlotLegend({ items, cursor }: Props) {
  return (
    <div className="plot-legend">
      {cursor ? <span className="legend-cursor">{cursor}</span> : null}
      {items.map((it) => (
        <span key={it.label} className={`legend-item${it.hidden ? ' legend-item-off' : ''}`}>
          <span
            className="legend-swatch"
            style={{
              borderTopStyle: it.dashed ? 'dashed' : 'solid',
              borderTopColor: it.color,
            }}
          />
          {it.label}
          {it.value != null ? <span className="legend-value">{it.value}</span> : null}
        </span>
      ))}
    </div>
  )
}
