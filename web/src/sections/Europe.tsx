import { useMemo, useState } from 'react'
import { Chart, baseOption, esc, useTokens } from '../components/Chart'
import type { EuIndicator, EuLatest, EuSeries } from '../data'

const COUNTRY: Record<string, string> = {
  AT: 'Austria', BE: 'Belgium', BG: 'Bulgaria', CY: 'Cyprus', CZ: 'Czechia', DE: 'Germany', DK: 'Denmark',
  EE: 'Estonia', EL: 'Greece', ES: 'Spain', FI: 'Finland', FR: 'France', HR: 'Croatia', HU: 'Hungary',
  IE: 'Ireland', IT: 'Italy', LT: 'Lithuania', LU: 'Luxembourg', LV: 'Latvia', MT: 'Malta', NL: 'Netherlands',
  PL: 'Poland', PT: 'Portugal', RO: 'Romania', SE: 'Sweden', SI: 'Slovenia', SK: 'Slovakia', EU27_2020: 'EU-27',
}

const INDICATORS: Record<EuIndicator, { label: string; unit: string; help: string }> = {
  recent_grad_employment_pct: {
    label: 'Employment of recent graduates', unit: '%',
    help: 'Employment rate of 20–34 year-olds with a tertiary degree, 1–3 years after graduating (Eurostat edat_lfse_24).',
  },
  price_level_index: {
    label: 'Price level (EU-27 = 100)', unit: '',
    help: 'Price level index for household consumption; a proxy for cost of living (Eurostat prc_ppp_ind).',
  },
  tertiary_attainment_pct: {
    label: 'Tertiary attainment, age 25–34', unit: '%',
    help: 'Share of 25–34 year-olds with a tertiary degree (Eurostat edat_lfse_03).',
  },
  inbound_mobile_students_pct: {
    label: 'International students', unit: '%',
    help: 'Degree-mobile students from abroad as a share of all tertiary students (Eurostat educ_uoe_mobs02 / enrt01).',
  },
}

export function Europe({ latest, series }: { latest: EuLatest[]; series: EuSeries[] }) {
  const t = useTokens()
  const [ind, setInd] = useState<EuIndicator>('recent_grad_employment_pct')
  const meta = INDICATORS[ind]
  const fmtV = (v: number) => `${v.toFixed(1)}${meta.unit}`

  const rows = useMemo(() => latest.filter((r) => r.indicator === ind && r.geo !== 'EU27_2020').sort((a, b) => b.value - a.value), [latest, ind])
  const eu = latest.find((r) => r.indicator === ind && r.geo === 'EU27_2020')
  const it = rows.find((r) => r.geo === 'IT')
  const itRank = rows.findIndex((r) => r.geo === 'IT') + 1

  const barOption = useMemo(() => {
    const b = baseOption(t)
    return {
      ...b,
      grid: { left: 8, right: 8, top: 24, bottom: 8, containLabel: true },
      tooltip: {
        ...b.tooltip, trigger: 'item',
        formatter: (p: { dataIndex: number }) => {
          const r = rows[p.dataIndex]
          return `<div style="font-weight:650;font-size:15px">${esc(fmtV(r.value))}</div><div style="color:${t.textSecondary}">${esc(COUNTRY[r.geo])} · ${r.year}</div>`
        },
      },
      xAxis: { ...b.axis, type: 'category', data: rows.map((r) => r.geo === 'EL' ? 'GR' : r.geo), splitLine: { show: false },
        axisLabel: { ...b.axis.axisLabel, interval: 0, fontSize: 11 } },
      yAxis: { ...b.axis, type: 'value' },
      series: [{
        type: 'bar', barMaxWidth: 24,
        data: rows.map((r) => ({
          value: r.value,
          itemStyle: { color: r.geo === 'IT' ? t.series1 : t.mutedMark, borderRadius: [4, 4, 0, 0] },
        })),
        label: { show: true, position: 'top', color: t.textPrimary, fontWeight: 600, fontSize: 12,
          formatter: (p: { dataIndex: number }) => (rows[p.dataIndex].geo === 'IT' ? fmtV(rows[p.dataIndex].value) : '') },
        markLine: eu && {
          symbol: 'none', silent: true,
          lineStyle: { color: t.textMuted, type: 'solid', width: 1 },
          label: { formatter: `EU-27 ${fmtV(eu.value)}`, color: t.textSecondary, position: 'insideEndTop', fontSize: 12 },
          data: [{ yAxis: eu.value }],
        },
      }],
    }
  }, [rows, eu, t, ind])

  const lineOption = useMemo(() => {
    const b = baseOption(t)
    const pick = (geo: string) => series.filter((s) => s.geo === geo && s[ind] != null).sort((a, b) => a.year - b.year)
    const itS = pick('IT'), euS = pick('EU27_2020')
    const years = [...new Set([...itS, ...euS].map((s) => s.year))].sort()
    const line = (name: string, color: string, rows: EuSeries[]) => {
      const m = new Map(rows.map((r) => [r.year, r[ind]]))
      return { name, type: 'line', symbol: 'none', lineStyle: { width: 2, color }, itemStyle: { color },
        data: years.map((y) => m.get(y) ?? null), endLabel: { show: true, formatter: '{a}', color: t.textSecondary, fontSize: 12 } }
    }
    return {
      ...b,
      grid: { left: 8, right: 60, top: 16, bottom: 8, containLabel: true },
      tooltip: {
        ...b.tooltip, trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: t.baseline } },
        formatter: (ps: { axisValue: string; seriesName: string; value: number | null; color: string }[]) =>
          `<div style="color:${t.textSecondary}">${esc(ps[0].axisValue)}</div>` +
          ps.filter((p) => p.value != null).map((p) => `<div><span style="display:inline-block;width:10px;height:2px;background:${p.color};vertical-align:middle;margin-right:6px"></span><b>${esc(fmtV(p.value!))}</b> <span style="color:${t.textMuted}">${esc(p.seriesName)}</span></div>`).join(''),
      },
      xAxis: { ...b.axis, type: 'category', data: years, boundaryGap: false, splitLine: { show: false } },
      yAxis: { ...b.axis, type: 'value', scale: true },
      series: [line('Italy', t.series1, itS), line('EU-27', t.textMuted, euS)],
    }
  }, [series, ind, t])

  return (
    <section id="europe">
      <div className="section-head">
        <h2>Italy in a European context</h2>
        <p>How Italy compares with the other 26 EU countries on cost of living and graduate outcomes.</p>
      </div>
      <div className="card">
        <div className="controls">
          <div className="seg" role="group" aria-label="Indicator">
            {(Object.keys(INDICATORS) as EuIndicator[]).map((k) => (
              <button key={k} aria-pressed={k === ind} onClick={() => setInd(k)}>{INDICATORS[k].label}</button>
            ))}
          </div>
        </div>
        {it && <p className="callout" style={{ marginBottom: 12 }}>
          Italy: <strong>{fmtV(it.value)}</strong> in {it.year}, ranked <strong>{itRank} of {rows.length}</strong>
          {eu && <> (EU-27: {fmtV(eu.value)})</>}. {meta.help}
        </p>}
        <div className="grid-2" style={{ gridTemplateColumns: '2fr 1fr' }}>
          <div>
            <h3>{meta.label}, latest year</h3>
            <Chart option={barOption} height={320} ariaLabel={`${meta.label} for EU countries, Italy highlighted`} />
          </div>
          <div>
            <h3>Italy vs EU-27 over time</h3>
            <div className="legend" style={{ margin: '4px 0' }}>
              <span><i className="swatch" style={{ background: t.series1, height: 2, borderRadius: 0 }} />Italy</span>
              <span><i className="swatch" style={{ background: t.textMuted, height: 2, borderRadius: 0 }} />EU-27</span>
            </div>
            <Chart option={lineOption} height={290} ariaLabel={`${meta.label}: Italy vs EU-27 over time`} />
          </div>
        </div>
      </div>
    </section>
  )
}
