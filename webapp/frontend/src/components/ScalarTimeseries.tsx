import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import type { Options } from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { useElementSize } from '../hooks/useElementSize'
import { PlotLegend } from './PlotLegend'
import { PLOT_THEMES, useTheme } from '../theme'
import type { Scalars, Visibility } from '../types'

interface Props {
  point: (Scalars & { x: number; key: string }) | null
  resetKey: string
  visibility: Visibility
  windowPoints?: number
}

// [xs, xrms, yrms, sigmaz, emx, emy]
type Cols = [number[], number[], number[], number[], number[], number[]]

const COLORS = ['#58a6ff', '#f78166', '#e3b341', '#3fb950', '#d2a8ff']
const LABELS = ['σx', 'σy', 'σz', 'εx', 'εy']
const DASHED = [false, false, false, true, true]
const VIS_KEYS: (keyof Visibility)[] = ['sigma_x', 'sigma_y', 'sigma_z', 'emit_x', 'emit_y']

export function ScalarTimeseries({ point, resetKey, visibility, windowPoints = 60 }: Props) {
  const { theme } = useTheme()
  const colors = PLOT_THEMES[theme]
  const [hostRef, size] = useElementSize<HTMLDivElement>()
  const uRef = useRef<uPlot | null>(null)
  const dataRef = useRef<Cols>([[], [], [], [], [], []])
  const lastKeyRef = useRef<string>('')

  // Recreate the plot when the theme changes so axis/grid colors update.
  useEffect(() => {
    if (!hostRef.current) return
    const opts: Options = {
      width: hostRef.current.clientWidth || 300,
      height: hostRef.current.clientHeight || 200,
      scales: { x: { time: false }, y: {}, e: {} },
      legend: { show: false },
      axes: [
        { stroke: colors.axis, grid: { stroke: colors.grid }, ticks: { stroke: colors.grid } },
        { scale: 'y', stroke: colors.axis, grid: { stroke: colors.grid }, label: 'RMS size (µm)' },
        { scale: 'e', side: 1, stroke: colors.axis, grid: { show: false }, label: 'Norm. emit (µm·rad)' },
      ],
      series: [
        {},
        { label: LABELS[0], stroke: COLORS[0], scale: 'y', width: 2 },
        { label: LABELS[1], stroke: COLORS[1], scale: 'y', width: 2 },
        { label: LABELS[2], stroke: COLORS[2], scale: 'y', width: 2 },
        { label: LABELS[3], stroke: COLORS[3], scale: 'e', width: 2, dash: [6, 3] },
        { label: LABELS[4], stroke: COLORS[4], scale: 'e', width: 2, dash: [6, 3] },
      ],
    }
    const u = new uPlot(opts, [[], [], [], [], [], []], hostRef.current)
    u.setData(dataRef.current)
    uRef.current = u
    return () => {
      u.destroy()
      uRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colors])

  // Resize the chart to fill its container.
  useEffect(() => {
    if (!uRef.current || size.width === 0 || size.height === 0) return
    uRef.current.setSize({ width: size.width, height: size.height })
  }, [size.width, size.height])

  // Reset history when the screen changes.
  useEffect(() => {
    dataRef.current = [[], [], [], [], [], []]
    lastKeyRef.current = ''
    uRef.current?.setData(dataRef.current)
  }, [resetKey])

  // Append new points.
  useEffect(() => {
    if (!point || point.key === lastKeyRef.current) return
    lastKeyRef.current = point.key
    const d = dataRef.current
    d[0].push(point.x)
    d[1].push(point.xrms_um)
    d[2].push(point.yrms_um)
    d[3].push(point.sigma_z_um)
    d[4].push(point.norm_emit_x_um_rad)
    d[5].push(point.norm_emit_y_um_rad)
    if (d[0].length > windowPoints) {
      for (const col of d) col.splice(0, col.length - windowPoints)
    }
    uRef.current?.setData(d)
  }, [point, windowPoints])

  // Toggle series visibility.
  useEffect(() => {
    const u = uRef.current
    if (!u) return
    const flags = [
      visibility.sigma_x,
      visibility.sigma_y,
      visibility.sigma_z,
      visibility.emit_x,
      visibility.emit_y,
    ]
    flags.forEach((show, i) => u.setSeries(i + 1, { show }))
  }, [visibility, colors])

  return (
    <div className="panel">
      <div className="panel-title">Scalar Diagnostics</div>
      <PlotLegend
        items={LABELS.map((label, i) => ({
          label,
          color: COLORS[i],
          dashed: DASHED[i],
          hidden: !visibility[VIS_KEYS[i]],
        }))}
      />
      <div ref={hostRef} className="uplot-host" />
    </div>
  )
}
