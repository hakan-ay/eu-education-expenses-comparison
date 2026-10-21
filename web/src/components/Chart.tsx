import { useEffect, useRef, useState } from 'react'
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

/** Chart tokens resolved from CSS custom properties, so charts follow the theme. */
export type Tokens = Record<
  | 'surface' | 'textPrimary' | 'textSecondary' | 'textMuted' | 'axisMuted' | 'grid' | 'baseline'
  | 'series1' | 'series2' | 'series3' | 'mutedMark' | 'border',
  string
>

function readTokens(): Tokens {
  const s = getComputedStyle(document.documentElement)
  const v = (name: string) => s.getPropertyValue(name).trim()
  return {
    surface: v('--surface'), textPrimary: v('--text-primary'), textSecondary: v('--text-secondary'),
    textMuted: v('--text-muted'), axisMuted: v('--axis-muted'), grid: v('--grid'), baseline: v('--baseline'),
    series1: v('--series-1'), series2: v('--series-2'), series3: v('--series-3'),
    mutedMark: v('--muted-mark'), border: v('--border'),
  }
}

/** Re-reads tokens whenever the OS scheme or the in-page theme toggle changes. */
export function useTokens(): Tokens {
  const [tokens, setTokens] = useState(readTokens)
  useEffect(() => {
    const update = () => setTokens(readTokens())
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', update)
    const mo = new MutationObserver(update)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => { mq.removeEventListener('change', update); mo.disconnect() }
  }, [])
  return tokens
}

/** Shared tooltip + axis styling (hairline grid, muted axis text, value-first tooltips). */
export function baseOption(t: Tokens) {
  const axisLabel = { color: t.axisMuted, fontSize: 12 }
  return {
    textStyle: { fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
    tooltip: {
      backgroundColor: t.surface,
      borderColor: t.border,
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: t.textPrimary, fontSize: 13 },
      extraCssText: 'border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.12);',
    },
    axis: {
      axisLine: { lineStyle: { color: t.baseline } },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: t.grid, width: 1, type: 'solid' as const } },
      axisLabel,
      nameTextStyle: { color: t.textSecondary, fontSize: 12 },
    },
  }
}

/** Escape text before it goes into an ECharts HTML tooltip (labels are data). */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

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
