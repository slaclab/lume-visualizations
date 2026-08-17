import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import type { Options } from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { useElementSize } from '../hooks/useElementSize'
import { PlotLegend } from './PlotLegend'
import { PLOT_THEMES, useTheme } from '../theme'
import type { Visibility } from '../types'

const BETA_X_COLOR = '#79c0ff'
const BETA_Y_COLOR = '#e3b341'

interface Props {
  s: number[] | null
  betaX: number[] | null
  betaY: number[] | null
  visibility: Visibility
}

export function TwissPlot({ s, betaX, betaY, visibility }: Props) {
  const { theme } = useTheme()
  const colors = PLOT_THEMES[theme]
  const [hostRef, size] = useElementSize<HTMLDivElement>()
  const uRef = useRef<uPlot | null>(null)

  // Recreate the plot when the theme changes so axis/grid colors update.
  useEffect(() => {
    if (!hostRef.current) return
    const opts: Options = {
      width: hostRef.current.clientWidth || 300,
      height: hostRef.current.clientHeight || 200,
      scales: { x: { time: false }, y: {} },
      legend: { show: false },
      axes: [
        { stroke: colors.axis, grid: { stroke: colors.grid }, ticks: { stroke: colors.grid }, label: 's (m)' },
        { scale: 'y', stroke: colors.axis, grid: { stroke: colors.grid }, label: 'β (m)' },
      ],
      series: [
        {},
        { label: 'βx', stroke: BETA_X_COLOR, scale: 'y', width: 2 },
        { label: 'βy', stroke: BETA_Y_COLOR, scale: 'y', width: 2 },
      ],
    }
    const u = new uPlot(opts, [[], [], []], hostRef.current)
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

  useEffect(() => {
    const u = uRef.current
    if (!u) return
    if (!s || !betaX || !betaY) {
      u.setData([[], [], []])
      return
    }
    u.setData([s, betaX, betaY])
  }, [s, betaX, betaY, colors])

  useEffect(() => {
    const u = uRef.current
    if (!u) return
    u.setSeries(1, { show: visibility.beta_x })
    u.setSeries(2, { show: visibility.beta_y })
  }, [visibility, colors])

  return (
    <div className="panel">
      <div className="panel-title">Twiss Parameters along Accelerator</div>
      <PlotLegend
        items={[
          { label: 'βx', color: BETA_X_COLOR, hidden: !visibility.beta_x },
          { label: 'βy', color: BETA_Y_COLOR, hidden: !visibility.beta_y },
        ]}
      />
      <div ref={hostRef} className="uplot-host" />
    </div>
  )
}
