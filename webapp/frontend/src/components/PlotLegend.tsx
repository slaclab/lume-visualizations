export interface LegendItem {
  label: string
  color: string
  dashed?: boolean
  hidden?: boolean
}

export function PlotLegend({ items }: { items: LegendItem[] }) {
  return (
    <div className="plot-legend">
      {items.map((it) => (
        <span
          key={it.label}
          className={`legend-item${it.hidden ? ' legend-item-off' : ''}`}
        >
          <span
            className="legend-swatch"
            style={{
              borderTopStyle: it.dashed ? 'dashed' : 'solid',
              borderTopColor: it.color,
            }}
          />
          {it.label}
        </span>
      ))}
    </div>
  )
}
