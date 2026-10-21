import { useMemo, useState } from 'react'
import { Chart, baseOption, esc, useTokens, type Tokens } from '../components/Chart'
import { SortableTable, type Column } from '../components/SortableTable'
import { annualCost, fmt, type Assumptions, type City, type CityField, type FieldOutcome } from '../data'

const COHORTS = [
  { key: 'master-1', degree: 'master', years: 1, label: "Master's, 1 year after" },
  { key: 'master-5', degree: 'master', years: 5, label: "Master's, 5 years after" },
  { key: 'bachelor-1', degree: 'bachelor', years: 1, label: 'Bachelor, 1 year after' },
  { key: 'single_cycle-5', degree: 'single_cycle', years: 5, label: 'Single-cycle (e.g. medicine, law), 5 years after' },
] as const

function barOption(t: Tokens, rows: FieldOutcome[], value: (f: FieldOutcome) => number | null, isPct: boolean) {
  const b = baseOption(t)
  const data = rows.filter((r) => value(r) != null).sort((a, b) => value(a)! - value(b)!)
  const show = (v: number) => (isPct ? fmt.pct(v) : fmt.eur(v))
  return {
    ...b,
    grid: { left: 8, right: 64, top: 4, bottom: 4, containLabel: true },
    tooltip: {
      ...b.tooltip, trigger: 'item',
      formatter: (p: { name: string; value: number; dataIndex: number }) =>
        `<div style="font-weight:650;font-size:15px">${esc(show(p.value))}</div>
         <div style="color:${t.textSecondary}">${esc(p.name)}</div>
         <div style="color:${t.textMuted};font-size:12px">${esc(fmt.int(data[p.dataIndex].respondents))} graduates interviewed</div>`,
    },
    xAxis: { ...b.axis, type: 'value', show: false, min: isPct ? 0 : undefined },
    yAxis: { ...b.axis, type: 'category', data: data.map((r) => r.field_name),
      axisLabel: { color: t.textSecondary, fontSize: 12 }, axisLine: { show: false }, splitLine: { show: false } },
    series: [{
      type: 'bar', barMaxWidth: 16, data: data.map((r) => value(r)),
      itemStyle: { color: t.series1, borderRadius: [0, 4, 4, 0] },
      emphasis: { itemStyle: { opacity: 0.85 } },
      label: { show: true, position: 'right', color: t.textSecondary, fontSize: 12, formatter: (p: { value: number }) => show(p.value) },
    }],
  }
}

export function Fields({ fields, cityFields, cities, assumptions }: {
  fields: FieldOutcome[]
  cityFields: CityField[]
  cities: City[]
  assumptions: Assumptions
}) {
  const t = useTokens()
  const [cohortKey, setCohortKey] = useState<(typeof COHORTS)[number]['key']>('master-1')
  const cohort = COHORTS.find((c) => c.key === cohortKey)!
  const rows = useMemo(() => fields.filter((f) => f.degree === cohort.degree && f.years_after === cohort.years), [fields, cohort])

  const fieldNames = useMemo(() => [...new Set(cityFields.map((r) => r.field_name))].sort(), [cityFields])
  const [field, setField] = useState('Informatica e Tecnologie ICT')

  const cityRows = useMemo(() => {
    const byCity = new Map(cities.map((c) => [c.study_city, c]))
    const totals = new Map<string, number>()
    cityFields.forEach((r) => totals.set(r.study_city, (totals.get(r.study_city) ?? 0) + r.students))
    return cityFields
      .filter((r) => r.field_name === field && r.students > 0 && byCity.has(r.study_city))
      .map((r) => ({ ...r, share: (100 * r.students) / totals.get(r.study_city)!, city: byCity.get(r.study_city)! }))
  }, [cityFields, cities, field])

  type Row = (typeof cityRows)[number]
  const columns: Column<Row>[] = [
    { key: 'city', label: 'City', value: (r) => r.study_city },
    { key: 'students', label: `Students in field`, value: (r) => r.students, render: (r) => fmt.int(r.students) },
    { key: 'share', label: 'Share of city', value: (r) => r.share, render: (r) => fmt.pct(r.share) },
    { key: 'cost', label: 'Total / yr', value: (r) => annualCost(r.city, assumptions), render: (r) => fmt.eur(annualCost(r.city, assumptions)) },
    { key: 'emp', label: 'City: employed 1y', value: (r) => r.city.employment_rate_master_1y, render: (r) => fmt.pct(r.city.employment_rate_master_1y) },
    { key: 'sal', label: 'City: salary 5y', value: (r) => r.city.net_salary_master_5y, render: (r) => fmt.eur(r.city.net_salary_master_5y) },
  ]

  return (
    <section id="fields">
      <div className="section-head">
        <h2>Fields of study: what happens after graduation</h2>
        <p>
          National AlmaLaurea results for the 15 MUR field groups. One year after graduating, the field you choose
          shifts your chances of being employed about as much as the city you study in; salaries differ about 1.5 times more
          by field than by city.
        </p>
      </div>
      <div className="card">
        <div className="controls">
          <div className="seg" role="group" aria-label="Graduate cohort">
            {COHORTS.map((c) => (
              <button key={c.key} aria-pressed={c.key === cohortKey} onClick={() => setCohortKey(c.key)}>{c.label}</button>
            ))}
          </div>
        </div>
        <div className="grid-2">
          <div>
            <h3>Employment rate</h3>
            <div className="card-sub">Share employed (ISTAT definition, includes paid training)</div>
            <Chart option={barOption(t, rows, (f) => f.employment_rate, true)} height={60 + rows.length * 26}
              ariaLabel={`Employment rate by field, ${cohort.label}`} />
          </div>
          <div>
            <h3>Net monthly salary</h3>
            <div className="card-sub">Average for employed graduates, € per month</div>
            <Chart option={barOption(t, rows, (f) => f.net_monthly_salary, false)} height={60 + rows.length * 26}
              ariaLabel={`Net monthly salary by field, ${cohort.label}`} />
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-title">
          <h3>Where to study a field</h3>
          <label className="control" style={{ gridAutoFlow: 'column', alignItems: 'center', gap: 8 }}>Field
            <select value={field} onChange={(e) => setField(e.target.value)}>
              {fieldNames.map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
        </div>
        <div className="card-sub">Cities by number of students enrolled in this field (2024/25), with each city's cost and outcomes</div>
        <SortableTable rows={cityRows} columns={columns} rowKey={(r) => r.study_city} initialSort={{ key: 'students', desc: true }} />
      </div>
    </section>
  )
}
