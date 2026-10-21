import { useEffect, useMemo, useState } from 'react'
import { annualCost, fmt, MACRO_GROUP, useData, type Assumptions, type Data, type RentSegment } from './data'
import { CostVsOutcomes, type OutcomeKey } from './sections/CostVsOutcomes'
import { CompareCities } from './sections/CompareCities'
import { Fields } from './sections/Fields'
import { Universities } from './sections/Universities'
import { Europe } from './sections/Europe'
import { Methodology } from './sections/Methodology'

function ThemeToggle() {
  const [theme, setTheme] = useState<string | null>(() => {
    try { return localStorage.getItem('theme') } catch { return null }
  })
  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme
    else delete document.documentElement.dataset.theme
    try { if (theme) localStorage.setItem('theme', theme); else localStorage.removeItem('theme') } catch { /* private mode */ }
  }, [theme])
  const isDark = theme ? theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  return (
    <button className="theme-toggle" onClick={() => setTheme(isDark ? 'light' : 'dark')} aria-label="Toggle colour theme">
      {isDark ? 'Light' : 'Dark'}
    </button>
  )
}

/** Headline numbers, computed from the data so they stay true after a refresh. */
function Headlines({ data, a }: { data: Data; a: Assumptions }) {
  const big = data.cities.filter((c) => c.students >= 10000 && annualCost(c, a) != null)
  const byCost = [...big].sort((x, y) => annualCost(x, a)! - annualCost(y, a)!)
  const cheap = byCost[0], dear = byCost[byCost.length - 1]

  const empBy = (g: string) => {
    const cs = data.cities.filter((c) => MACRO_GROUP[c.macro_area] === g && c.employment_rate_master_1y != null)
    return cs.reduce((s, c) => s + c.employment_rate_master_1y! * c.students, 0) / cs.reduce((s, c) => s + c.students, 0)
  }
  const online = data.universities.filter((u) => u.is_online).reduce((s, u) => s + u.students, 0)
  const total = data.universities.reduce((s, u) => s + u.students, 0)
  const itGrad = data.euLatest.find((r) => r.geo === 'IT' && r.indicator === 'recent_grad_employment_pct')
  const euGrad = data.euLatest.find((r) => r.geo === 'EU27_2020' && r.indicator === 'recent_grad_employment_pct')

  return (
    <div className="tiles">
      <div className="tile">
        <div className="tile-label">Most vs least expensive large city</div>
        <div className="tile-value">{(annualCost(dear, a)! / annualCost(cheap, a)!).toFixed(1)}×</div>
        <div className="tile-note">{dear.study_city} {fmt.eur(annualCost(dear, a))} vs {cheap.study_city} {fmt.eur(annualCost(cheap, a))} a year</div>
      </div>
      <div className="tile">
        <div className="tile-label">Employed 1 year after a master's</div>
        <div className="tile-value">{fmt.pct(empBy('North'), 0)} <span style={{ fontSize: 18, color: 'var(--text-muted)' }}>vs {fmt.pct(empBy('South & Islands'), 0)}</span></div>
        <div className="tile-note">North vs South & Islands, weighted by students</div>
      </div>
      <div className="tile">
        <div className="tile-label">Recent graduates in work</div>
        <div className="tile-value">{itGrad ? fmt.pct(itGrad.value, 0) : '–'}</div>
        <div className="tile-note">Italy, vs {euGrad ? fmt.pct(euGrad.value, 0) : '–'} EU-27 average ({itGrad?.year})</div>
      </div>
      <div className="tile">
        <div className="tile-label">Students at online universities</div>
        <div className="tile-value">{fmt.pct((100 * online) / total, 0)}</div>
        <div className="tile-note">{fmt.int(online)} of {fmt.int(total)} students, 2024/25</div>
      </div>
    </div>
  )
}

export default function App() {
  const data = useData()
  const [sqm, setSqm] = useState(25)
  const [segment, setSegment] = useState<RentSegment>('long')
  const [outcome, setOutcome] = useState<OutcomeKey>('employment_rate_master_1y')
  const assumptions = useMemo(() => ({ sqm, segment }), [sqm, segment])

  return (
    <>
      <nav className="nav">
        <div className="nav-inner">
          <span className="nav-brand">Study in Italy: cost vs outcomes</span>
          <a href="#cities">Cities</a>
          <a href="#compare">Compare</a>
          <a href="#fields">Fields</a>
          <a href="#universities">Universities</a>
          <a href="#europe">Europe</a>
          <a href="#method">Method</a>
          <ThemeToggle />
        </div>
      </nav>
      <main>
        <header className="hero">
          <span className="eyebrow">Open-data analysis · Italian universities</span>
          <h1>Where in Italy do you get the most out of a degree for what it costs?</h1>
          <p>
            This dashboard combines official data on fees, scholarships, student housing, rents and graduate
            employment for every Italian university city, then puts Italy in a European context.
          </p>
        </header>

        {!data ? <p className="note">Loading data…</p> : (
          <>
            <Headlines data={data} a={assumptions} />

            <div className="card" style={{ marginTop: 16 }} role="group" aria-label="Cost assumptions">
              <div className="controls" style={{ marginBottom: 0 }}>
                <strong style={{ alignSelf: 'center' }}>Cost assumptions</strong>
                <label className="control">Floor area per student: <output>{sqm} m²</output>
                  <input type="range" min={12} max={60} step={1} value={sqm} onChange={(e) => setSqm(Number(e.target.value))} />
                </label>
                <div className="control">Rent contracts
                  <div className="seg" role="group" aria-label="Rent contract type">
                    <button aria-pressed={segment === 'long'} onClick={() => setSegment('long')}>Long-term</button>
                    <button aria-pressed={segment === 'short'} onClick={() => setSegment('short')}>Short-term</button>
                  </div>
                </div>
                <p className="note" style={{ margin: 0, maxWidth: 420 }}>
                  These settings apply to every cost on the page. Yearly cost = average university fee + rent for the
                  chosen floor area.
                </p>
              </div>
            </div>

            <CostVsOutcomes cities={data.cities} assumptions={assumptions} outcome={outcome} setOutcome={setOutcome} />
            <CompareCities cities={data.cities} trend={data.cityTrend} assumptions={assumptions} />
            <Fields fields={data.fields} cityFields={data.cityFields} cities={data.cities} assumptions={assumptions} />
            <Universities universities={data.universities} />
            <Europe latest={data.euLatest} series={data.euSeries} />
            <Methodology meta={data.meta} />
          </>
        )}
      </main>
      <footer>
        Built with Python, DuckDB and React from public data by MUR, AlmaLaurea, Agenzia delle Entrate (OMI), ISTAT and
        Eurostat. Source code and pipeline on <a href="https://github.com/hakan-ay/eu-education-expenses-comparison">GitHub</a>.
      </footer>
    </>
  )
}
