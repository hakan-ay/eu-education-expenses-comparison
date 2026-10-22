import { useMemo, useState } from 'react'
import { Chart } from '../components/Chart'
import { baseOption, esc, useTokens } from '../components/chartTheme'
import { SortableTable, type Column } from '../components/SortableTable'
import {
  annualCost, annualRent, fmt, MACRO_GROUP, MACRO_GROUPS, RENT_SOURCE_LABEL,
  type Assumptions, type City,
} from '../data'

export type OutcomeKey =
  | 'employment_rate_master_1y' | 'employment_rate_master_5y'
  | 'net_salary_master_1y' | 'net_salary_master_5y'

const OUTCOMES: Record<OutcomeKey, { label: string; short: string; isPct: boolean }> = {
  employment_rate_master_1y: { label: "Employment rate, master's graduates after 1 year", short: 'Employed after 1y', isPct: true },
  employment_rate_master_5y: { label: "Employment rate, master's graduates after 5 years", short: 'Employed after 5y', isPct: true },
  net_salary_master_1y: { label: "Net monthly salary, master's graduates after 1 year", short: 'Salary after 1y', isPct: false },
  net_salary_master_5y: { label: "Net monthly salary, master's graduates after 5 years", short: 'Salary after 5y', isPct: false },
}

const LABELLED_CITIES = 12 // direct-label only the largest cities; the rest live in the tooltip & table

export function CostVsOutcomes({ cities, assumptions, outcome, setOutcome }: {
  cities: City[]
  assumptions: Assumptions
  outcome: OutcomeKey
  setOutcome: (o: OutcomeKey) => void
}) {
  const t = useTokens()
  const [minStudents, setMinStudents] = useState(5000)
  const o = OUTCOMES[outcome]
  const colors = useMemo(() => [t.series1, t.series2, t.series3], [t])

  const points = useMemo(() => cities
    .filter((c) => c.students >= minStudents)
    .map((c) => ({ c, x: annualCost(c, assumptions), y: c[outcome] }))
    .filter((p): p is { c: City; x: number; y: number } => p.x != null && p.y != null),
  [cities, assumptions, outcome, minStudents])

  const labelled = useMemo(
    () => new Set([...points].sort((a, b) => b.c.students - a.c.students).slice(0, LABELLED_CITIES).map((p) => p.c.study_city)),
    [points],
  )

  const option = useMemo(() => {
    const b = baseOption(t)
    const maxStudents = Math.max(...points.map((p) => p.c.students))
    return {
      ...b,
      grid: { left: 8, right: 24, top: 24, bottom: 8, containLabel: true },
      tooltip: {
        ...b.tooltip,
        trigger: 'item',
        formatter: (p: { data: { c: City; value: [number, number] } }) => {
          const { c, value } = p.data
          const yText = o.isPct ? fmt.pct(value[1]) : fmt.eur(value[1])
          return `<div style="font-weight:650;font-size:15px">${esc(yText)} · ${esc(fmt.eur(value[0]))}/yr</div>
            <div style="color:${t.textSecondary}">${esc(c.study_city)} (${esc(c.region_name.split('/')[0])})</div>
            <div style="color:${t.textMuted};font-size:12px;margin-top:4px">
              Fee ${esc(fmt.eur(c.reference_fee_eur))}${c.reference_fee_is_private ? ' (private only)' : ''}
              + rent ${esc(fmt.eur(annualRent(c, assumptions)))}<br/>
              ${esc(fmt.int(c.students))} students · rent source: ${esc(RENT_SOURCE_LABEL[c.rent_source_level])}
              ${c.outcomes_coverage_pct < 90 ? `<br/>Outcomes cover ${esc(fmt.pct(c.outcomes_coverage_pct, 0))} of students` : ''}
            </div>`
        },
      },
      xAxis: {
        ...b.axis, type: 'value', scale: true,
        name: 'Estimated yearly cost (fee + rent)', nameLocation: 'middle', nameGap: 30,
        axisLabel: { ...b.axis.axisLabel, formatter: (v: number) => `€${fmt.compact(v)}` },
      },
      yAxis: {
        ...b.axis, type: 'value', scale: true,
        axisLabel: { ...b.axis.axisLabel, formatter: (v: number) => (o.isPct ? `${v}%` : `€${fmt.compact(v)}`) },
      },
      series: MACRO_GROUPS.map((g, i) => ({
        name: g,
        type: 'scatter',
        data: points
          .filter((p) => MACRO_GROUP[p.c.macro_area] === g)
          .map((p) => ({ value: [p.x, p.y], c: p.c })),
        symbolSize: (_: unknown, p: { data: { c: City } }) => 8 + 26 * Math.sqrt(p.data.c.students / maxStudents),
        itemStyle: { color: colors[i], opacity: 0.85, borderColor: t.surface, borderWidth: 2 },
        emphasis: { scale: 1.15, itemStyle: { opacity: 1 } },
        label: {
          show: true,
          position: 'right',
          color: t.textSecondary,
          fontSize: 12,
          formatter: (p: { data: { c: City } }) => (labelled.has(p.data.c.study_city) ? p.data.c.study_city : ''),
        },
        labelLayout: { hideOverlap: true },
      })),
    }
  }, [points, labelled, t, o, assumptions, colors])

  const columns: Column<City>[] = [
    { key: 'city', label: 'City', value: (c) => c.study_city },
    { key: 'students', label: 'Students', value: (c) => c.students, render: (c) => fmt.int(c.students) },
    { key: 'fee', label: 'Avg fee', value: (c) => c.reference_fee_eur,
      render: (c) => <>{fmt.eur(c.reference_fee_eur)}{c.reference_fee_is_private && <span className="tag">private</span>}</> },
    { key: 'rent', label: 'Rent / yr', value: (c) => annualRent(c, assumptions),
      render: (c) => <>{fmt.eur(annualRent(c, assumptions))}<span className="tag">{RENT_SOURCE_LABEL[c.rent_source_level]}</span></> },
    { key: 'cost', label: 'Total / yr', value: (c) => annualCost(c, assumptions), render: (c) => <strong>{fmt.eur(annualCost(c, assumptions))}</strong> },
    { key: 'emp1', label: 'Employed 1y', value: (c) => c.employment_rate_master_1y, render: (c) => fmt.pct(c.employment_rate_master_1y) },
    { key: 'emp5', label: 'Employed 5y', value: (c) => c.employment_rate_master_5y, render: (c) => fmt.pct(c.employment_rate_master_5y) },
    { key: 'sal5', label: 'Salary 5y', value: (c) => c.net_salary_master_5y, render: (c) => fmt.eur(c.net_salary_master_5y) },
    { key: 'sch', label: 'Grant coverage', value: (c) => c.scholarship_coverage_pct, render: (c) => fmt.pct(c.scholarship_coverage_pct, 0),
      title: 'Scholarships awarded ÷ students eligible (regional DSU grants)' },
    { key: 'beds', label: 'Beds / 100', value: (c) => c.dsu_beds_per_100_students, render: (c) => c.dsu_beds_per_100_students?.toFixed(1) ?? '–',
      title: 'Publicly funded student beds per 100 enrolled students' },
  ]

  return (
    <section id="cities">
      <div className="section-head">
        <h2>Cost vs graduate outcomes, by city</h2>
        <p>
          Each dot is a university city. Further left is cheaper to study in; higher means better outcomes for its
          master's graduates. Dot size shows the number of students.
        </p>
      </div>
      <div className="card">
        <div className="controls">
          <label className="control">Outcome
            <select value={outcome} onChange={(e) => setOutcome(e.target.value as OutcomeKey)}>
              {Object.entries(OUTCOMES).map(([k, v]) => <option key={k} value={k}>{v.short}</option>)}
            </select>
          </label>
          <label className="control">Show cities with at least
            <select value={minStudents} onChange={(e) => setMinStudents(Number(e.target.value))}>
              {[0, 5000, 10000, 25000].map((n) => <option key={n} value={n}>{n === 0 ? 'any size' : `${fmt.int(n)} students`}</option>)}
            </select>
          </label>
          <div className="legend" style={{ marginLeft: 'auto' }}>
            {MACRO_GROUPS.map((g, i) => <span key={g}><i className="swatch" style={{ background: colors[i] }} />{g}</span>)}
          </div>
        </div>
        <div className="card-sub">{o.label} vs estimated yearly cost</div>
        <Chart option={option} height={460} ariaLabel={`Scatter plot of ${o.label} against estimated yearly cost for Italian university cities`} />
      </div>
      <div className="card">
        <div className="card-title"><h3>All cities</h3><span className="card-sub">Click a column to sort</span></div>
        <SortableTable rows={cities} columns={columns} rowKey={(c) => c.study_city}
          initialSort={{ key: 'students', desc: true }} />
        <p className="note">
          Fees are the average paid by fee-paying students at public universities in the city (private-only cities are
          tagged). Outcomes are weighted by AlmaLaurea respondents.
        </p>
      </div>
    </section>
  )
}
