import type { Meta } from '../data'

const SOURCES = [
  { name: 'MUR – Ufficio Statistica (USTAT) open data', url: 'https://dati-ustat.mur.gov.it/',
    what: 'Enrolment by university, course and field; fees (contribuzione studentesca); scholarships, housing and student-support (DSU); university registry.' },
  { name: 'AlmaLaurea – Condizione occupazionale dei laureati, survey 2025', url: 'https://www.almalaurea.it/i-dati/le-nostre-indagini/condizione-occupazionale-laureati',
    what: 'Employment rate, net salary and job quality of graduates 1 and 5 years after graduation, by university and by field.' },
  { name: 'Agenzia delle Entrate – OMI, Rapporto Immobiliare 2026', url: 'https://www.agenziaentrate.gov.it/portale/web/guest/schede/fabbricatiterreni/omi/pubblicazioni/rapporti-immobiliari-residenziali',
    what: 'Average rent per m² of residential contracts registered in 2025, for 8 large cities and 19 regions, by contract type.' },
  { name: 'ISTAT – SITUAS register of municipalities', url: 'https://situas.istat.it/',
    what: 'Official municipality codes, provinces, regions and macro-areas used to geocode universities.' },
  { name: 'Eurostat', url: 'https://ec.europa.eu/eurostat/data/database',
    what: 'prc_ppp_ind, edat_lfse_24, edat_lfse_03, educ_uoe_mobs02, educ_uoe_enrt01 for the European comparison.' },
]

export function Methodology({ meta }: { meta: Meta }) {
  const passed = meta.tests.filter((t) => t.passed).length
  return (
    <section id="method">
      <div className="section-head">
        <h2>Methodology and data quality</h2>
        <p>How the numbers are built, what they can and cannot tell you, and the checks they pass.</p>
      </div>
      <div className="grid-2">
        <div className="card">
          <h3>Cost model</h3>
          <ul className="method-list">
            <li><strong>Yearly cost = average fee + rent.</strong> Rent = OMI average rent per m² per year × the
              floor area you set (default 25 m², a room plus a share of common areas).</li>
            <li><strong>Fee</strong> is MUR's average contribution paid by fee-paying students, weighted by enrolment
              across the city's public universities. Students under the ISEE "no-tax area" pay nothing, so this is an
              upper-bound for lower-income students.</li>
            <li><strong>Rent</strong> uses the city figure for the 8 largest cities. Elsewhere it uses the regional
              average <em>excluding</em> the big city ((region total − city total) ÷ (region m² − city m²)), so
              Bergamo is not priced like Milan. Trentino-Alto Adige is not covered by OMI and uses the Nord-Est
              average.</li>
            <li>OMI rents come from <em>registered</em> contracts, including long-running ones, so they are lower than
              today's asking prices for student rooms. Use them to <em>compare</em> cities, not to budget.</li>
            <li>Living costs other than rent (food, transport) are not included: no official source publishes them by
              city. Numbeo was considered and rejected because its terms do not allow reuse.</li>
          </ul>
        </div>
        <div className="card">
          <h3>Outcomes and coverage</h3>
          <ul className="method-list">
            <li>Employment and salary come from AlmaLaurea, which surveys graduates of its 80 member universities.
              Politecnico di Milano, Bocconi, Cattolica and Luiss are not members, so Milan's figures cover about half
              of its students. Each city shows its coverage.</li>
            <li>City outcomes are averages of each university's results, weighted by survey respondents.</li>
            <li>Outcomes describe where people <em>studied</em>, not where they work: a graduate from Bari working in
              Milan counts for Bari.</li>
            <li>Grant coverage = DSU scholarships awarded ÷ eligible students. Veneto's agencies report zeros for
              universities that run scholarships themselves, so Padova, Verona and Venezia show "–".</li>
          </ul>
          <h3 style={{ marginTop: 16 }}>Reference periods</h3>
          <ul className="method-list">
            {meta.reference_periods.map((p) => <li key={p.topic}><strong>{p.topic}</strong>: {p.period} — {p.note}</li>)}
          </ul>
        </div>
      </div>
      <div className="card">
        <div className="card-title">
          <h3>Automated data tests</h3>
          <span className={passed === meta.tests.length ? 'pass' : 'fail'}>{passed}/{meta.tests.length} passing</span>
        </div>
        <div className="card-sub">Each test is a SQL query that must return zero rows; the build fails otherwise.</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Test</th><th style={{ textAlign: 'left' }}>What it checks</th><th>Result</th></tr></thead>
            <tbody>
              {meta.tests.map((t) => (
                <tr key={t.test}>
                  <td><code>{t.test}</code></td>
                  <td style={{ textAlign: 'left', whiteSpace: 'normal' }}>{t.description}</td>
                  <td className={t.passed ? 'pass' : 'fail'}>{t.passed ? 'pass' : `fail (${t.failing_rows})`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <h3>Sources</h3>
        <ul className="method-list">
          {SOURCES.map((s) => <li key={s.name}><a href={s.url} target="_blank" rel="noreferrer">{s.name}</a> — {s.what}</li>)}
        </ul>
        <p className="note">Data built on {new Date(meta.generated_at).toLocaleDateString('en-GB', { dateStyle: 'long' })} from {meta.sources.length} files.
          Every file's URL and retrieval date is listed in <code>data/sources_manifest.json</code>.</p>
      </div>
    </section>
  )
}
