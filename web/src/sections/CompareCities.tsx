import { useMemo, useState, type ReactNode } from 'react'
import { Chart, baseOption, esc, useTokens } from '../components/Chart'
import { annualCost, annualRent, fmt, RENT_SOURCE_LABEL, type Assumptions, type City, type CityTrend } from '../data'

const DEFAULT = ['Milano', 'Bologna', 'Padova']

export function CompareCities({ cities, trend, assumptions }: {
  cities: City[]
  trend: CityTrend[]
  assumptions: Assumptions
}) {
  const t = useTokens()
  const [picked, setPicked] = useState<string[]>(DEFAULT)
  const byName = useMemo(() => new Map(cities.map((c) => [c.study_city, c])), [cities])
  const selected = picked.map((n) => byName.get(n)).filter((c): c is City => !!c)
  const sortedNames = useMemo(() => cities.map((c) => c.study_city).sort((a, b) => a.localeCompare(b)), [cities])
  const colors = [t.series1, t.series2, t.series3]

  const costOption = useMemo(() => {
    const b = baseOption(t)
    const names = selected.map((c) => c.study_city).reverse() // first pick on top
    const rows = [...selected].reverse()
    const bar = { type: 'bar', stack: 'cost', barMaxWidth: 24 }
    return {
      ...b,
      grid: { left: 8, right: 70, top: 8, bottom: 8, containLabel: true },
      tooltip: {
        ...b.tooltip, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(127,127,127,0.08)' } },
        formatter: (ps: { name: string; seriesName: string; value: number; color: string }[]) =>
          `<div style="font-weight:650;font-size:15px">${esc(fmt.eur(ps.reduce((s, p) => s + p.value, 0)))}/yr</div>
           <div style="color:${t.textSecondary}">${esc(ps[0].name)}</div>` +
          ps.map((p) => `<div><span style="display:inline-block;width:10px;height:2px;background:${p.color};vertical-align:middle;margin-right:6px"></span>${esc(fmt.eur(p.value))} <span style="color:${t.textMuted}">${esc(p.seriesName)}</span></div>`).join(''),
      },
      xAxis: { ...b.axis, type: 'value', axisLabel: { ...b.axis.axisLabel, formatter: (v: number) => `€${fmt.compact(v)}` } },
      yAxis: { ...b.axis, type: 'category', data: names, axisLabel: { color: t.textSecondary, fontSize: 13 }, splitLine: { show: false } },
      series: [
        { ...bar, name: 'University fee', data: rows.map((c) => c.reference_fee_eur ?? 0),
          itemStyle: { color: t.series1, borderColor: t.surface, borderWidth: 1 } },
        { ...bar, name: 'Rent', data: rows.map((c) => Math.round(annualRent(c, assumptions))),
          itemStyle: { color: t.series2, borderRadius: [0, 4, 4, 0], borderColor: t.surface, borderWidth: 1 },
          label: { show: true, position: 'right', color: t.textPrimary, fontWeight: 600, fontSize: 12,
            formatter: (p: { dataIndex: number }) => fmt.eur(annualCost(rows[p.dataIndex], assumptions)) } },
      ],
    }
  }, [selected, t, assumptions])

  // Enrolment indexed to 2015/16 = 100 so cities of very different size share one axis.
  const trendOption = useMemo(() => {
    const b = baseOption(t)
    const years = [...new Set(trend.map((r) => r.academic_year))].sort()
    return {
      ...b,
      grid: { left: 8, right: 70, top: 16, bottom: 8, containLabel: true },
      tooltip: {
        ...b.tooltip, trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: t.baseline } },
        formatter: (ps: { axisValue: string; seriesName: string; value: number; color: string }[]) =>
          `<div style="color:${t.textSecondary};margin-bottom:2px">${esc(ps[0].axisValue)}</div>` +
          ps.map((p) => `<div><span style="display:inline-block;width:10px;height:2px;background:${p.color};vertical-align:middle;margin-right:6px"></span><b>${p.value?.toFixed(0)}</b> <span style="color:${t.textMuted}">${esc(p.seriesName)}</span></div>`).join(''),
      },
      xAxis: { ...b.axis, type: 'category', data: years, boundaryGap: false,
        axisLabel: { ...b.axis.axisLabel, formatter: (v: string) => v.slice(0, 4) }, splitLine: { show: false } },
      yAxis: { ...b.axis, type: 'value', scale: true },
      series: selected.map((c, i) => {
        const rows = new Map(trend.filter((r) => r.study_city === c.study_city).map((r) => [r.academic_year, r.students]))
        const base = rows.get(years[0])
        return {
          name: c.study_city, type: 'line', symbol: 'none', smooth: false,
          lineStyle: { width: 2, color: colors[i] }, itemStyle: { color: colors[i] },
          data: years.map((y) => (base && rows.get(y) ? (100 * rows.get(y)!) / base : null)),
          endLabel: { show: true, color: t.textSecondary, fontSize: 12, formatter: '{a}' },
        }
      }),
    }
  }, [selected, trend, t, colors])

  const rows: [string, (c: City) => ReactNode][] = [
    ['Students (2024/25)', (c) => fmt.int(c.students)],
    ['Universities', (c) => `${c.universities} (${c.state_universities} public)`],
    ['International students', (c) => fmt.pct(c.intl_pct)],
    ['Average fee, public universities', (c) => fmt.eur(c.avg_fee_state_eur)],
    ['Cheapest public university fee', (c) => fmt.eur(c.min_fee_state_eur)],
    [`Rent for ${assumptions.sqm} m², per year`, (c) => <>{fmt.eur(annualRent(c, assumptions))}<span className="tag">{RENT_SOURCE_LABEL[c.rent_source_level]}</span></>],
    ['Estimated total per year', (c) => <strong>{fmt.eur(annualCost(c, assumptions))}</strong>],
    ["Employed 1 year after master's", (c) => fmt.pct(c.employment_rate_master_1y)],
    ["Employed 5 years after master's", (c) => fmt.pct(c.employment_rate_master_5y)],
    ['Net salary after 1 year', (c) => fmt.eur(c.net_salary_master_1y)],
    ['Net salary after 5 years', (c) => fmt.eur(c.net_salary_master_5y)],
    ['Eligible students who got a grant', (c) => fmt.pct(c.scholarship_coverage_pct, 0)],
    ['Average grant', (c) => fmt.eur(c.avg_scholarship_eur)],
    ['Public student beds per 100 students', (c) => c.dsu_beds_per_100_students?.toFixed(1) ?? '–'],
    ['Students covered by outcome data', (c) => fmt.pct(c.outcomes_coverage_pct, 0)],
  ]

  return (
    <section id="compare">
      <div className="section-head">
        <h2>Compare up to three cities</h2>
        <p>Pick cities to see where the money goes and what graduates get back.</p>
      </div>
      <div className="card">
        <div className="controls">
          {[0, 1, 2].map((i) => (
            <label className="control" key={i}>
              <span><i className="swatch" style={{ background: colors[i], marginRight: 6 }} />City {i + 1}</span>
              <select value={picked[i] ?? ''} onChange={(e) => setPicked((p) => { const n = [...p]; n[i] = e.target.value; return n.filter(Boolean) })}>
                {i > 0 && <option value="">—</option>}
                {sortedNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          ))}
        </div>
        <div className="grid-2">
          <div>
            <div className="card-title"><h3>Estimated yearly cost</h3>
              <div className="legend">
                <span><i className="swatch rect" style={{ background: t.series1 }} />University fee</span>
                <span><i className="swatch rect" style={{ background: t.series2 }} />Rent</span>
              </div>
            </div>
            <Chart option={costOption} height={70 + selected.length * 56} ariaLabel="Stacked bars of fee and rent per selected city" />
          </div>
          <div>
            <div className="card-title"><h3>Enrolment trend</h3><span className="card-sub">Index, 2015/16 = 100</span></div>
            <Chart option={trendOption} height={230} ariaLabel="Line chart of enrolment indexed to 2015/16 for selected cities" />
          </div>
        </div>
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table>
            <thead><tr><th>Metric</th>{selected.map((c) => <th key={c.study_city}>{c.study_city}</th>)}</tr></thead>
            <tbody>
              {rows.map(([label, f]) => (
                <tr key={label}><td>{label}</td>{selected.map((c) => <td key={c.study_city}>{f(c)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
