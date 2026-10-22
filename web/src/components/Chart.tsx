import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, ScatterChart } from 'echarts/charts'
import {
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import type { EChartsCoreOption } from 'echarts/core'

echarts.use([BarChart, LineChart, ScatterChart, GridComponent, TooltipComponent, MarkLineComponent, SVGRenderer])

export function Chart({ option, height = 360, ariaLabel }: {
  option: EChartsCoreOption
  height?: number
  ariaLabel: string
}) {
  const el = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    chart.current = echarts.init(el.current!, undefined, { renderer: 'svg' })
    const ro = new ResizeObserver(() => chart.current?.resize())
    ro.observe(el.current!)
    return () => { ro.disconnect(); chart.current?.dispose() }
  }, [])

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true })
  }, [option])

  return <div ref={el} role="img" aria-label={ariaLabel} style={{ width: '100%', height }} />
}
