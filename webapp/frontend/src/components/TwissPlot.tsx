import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import type { Options } from 'uplot'
import 'uplot/dist/uPlot.min.css'
import type { Visibility } from '../types'

interface Props {
  s: number[] | null
  betaX: number[] | null
  betaY: number[] | null
  visibility: Visibility
}

const W = 460
const H = 300

export function TwissPlot({ s, betaX, betaY, visibility }: Props) {
  const elRef = useRef<HTMLDivElement>(null)
  const uRef = useRef<uPlot | null>(null)

  useEffect(() => {
    if (!elRef.current) return
    const opts: Options = {
      width: W,
      height: H,
      scales: { x: { time: false }, y: {} },
      legend: { show: true },
      axes: [
        { stroke: '#c9d1d9', grid: { stroke: '#30363d' }, ticks: { stroke: '#30363d' }, label: 's (m)' },
        { scale: 'y', stroke: '#c9d1d9', grid: { stroke: '#30363d' }, label: 'β (m)' },
      ],
      series: [
        {},
        { label: 'βx', stroke: '#79c0ff', scale: 'y', width: 2 },
        { label: 'βy', stroke: '#e3b341', scale: 'y', width: 2 },
      ],
    }
    const u = new uPlot(opts, [[], [], []], elRef.current)
    uRef.current = u
    return () => {
      u.destroy()
      uRef.current = null
    }
  }, [])

  useEffect(() => {
    const u = uRef.current
    if (!u) return
    if (!s || !betaX || !betaY) {
      u.setData([[], [], []])
      return
    }
    u.setData([s, betaX, betaY])
  }, [s, betaX, betaY])

  useEffect(() => {
    const u = uRef.current
    if (!u) return
    u.setSeries(1, { show: visibility.beta_x })
    u.setSeries(2, { show: visibility.beta_y })
  }, [visibility])

  return (
    <div className="panel">
      <div className="panel-title">Twiss Parameters along Accelerator</div>
      <div ref={elRef} className="uplot-host" />
    </div>
  )
}
