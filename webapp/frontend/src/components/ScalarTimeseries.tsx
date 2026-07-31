import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import type { Options } from 'uplot'
import 'uplot/dist/uPlot.min.css'
import type { Scalars, Visibility } from '../types'

interface Props {
  point: (Scalars & { x: number; key: string }) | null
  resetKey: string
  visibility: Visibility
  windowPoints?: number
}

const W = 460
const H = 300
// [xs, xrms, yrms, sigmaz, emx, emy]
type Cols = [number[], number[], number[], number[], number[], number[]]

const COLORS = ['#58a6ff', '#f78166', '#e3b341', '#3fb950', '#d2a8ff']
const LABELS = ['σx', 'σy', 'σz', 'εx', 'εy']

export function ScalarTimeseries({ point, resetKey, visibility, windowPoints = 60 }: Props) {
  const elRef = useRef<HTMLDivElement>(null)
  const uRef = useRef<uPlot | null>(null)
  const dataRef = useRef<Cols>([[], [], [], [], [], []])
  const lastKeyRef = useRef<string>('')

  useEffect(() => {
    if (!elRef.current) return
    const opts: Options = {
      width: W,
      height: H,
      scales: { x: { time: false }, y: {}, e: {} },
      legend: { show: true },
      axes: [
        { stroke: '#c9d1d9', grid: { stroke: '#30363d' }, ticks: { stroke: '#30363d' } },
        { scale: 'y', stroke: '#c9d1d9', grid: { stroke: '#30363d' }, label: 'RMS size (µm)' },
        { scale: 'e', side: 1, stroke: '#c9d1d9', grid: { show: false }, label: 'Norm. emit (µm·rad)' },
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
    const u = new uPlot(opts, [[], [], [], [], [], []], elRef.current)
    uRef.current = u
    return () => {
      u.destroy()
      uRef.current = null
    }
  }, [])

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
  }, [visibility])

  return (
    <div className="panel">
      <div className="panel-title">Scalar Diagnostics</div>
      <div ref={elRef} className="uplot-host" />
    </div>
  )
}
