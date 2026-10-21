import { useMemo, useState } from 'react'
import { SortableTable, type Column } from '../components/SortableTable'
import { fmt, type University } from '../data'

export function Universities({ universities }: { universities: University[] }) {
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<'all' | 'public' | 'private' | 'online'>('all')

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return universities.filter((u) =>
      (kind === 'all' || (kind === 'online' ? u.is_online : !u.is_online && (kind === 'public') === u.is_state)) &&
      (!q || `${u.university} ${u.full_name} ${u.study_city ?? ''}`.toLowerCase().includes(q)))
  }, [universities, query, kind])

  const columns: Column<University>[] = [
    { key: 'name', label: 'University', value: (u) => u.university,
      render: (u) => <span title={u.full_name}>{u.university}{!u.is_state && <span className="tag">private</span>}{u.is_online && <span className="tag">online</span>}</span> },
    { key: 'city', label: 'City', value: (u) => u.study_city ?? (u.is_online ? 'online' : null) },
    { key: 'students', label: 'Students', value: (u) => u.students, render: (u) => fmt.int(u.students) },
    { key: 'chg', label: '5y change', value: (u) => u.students_change_5y_pct,
      render: (u) => (u.students_change_5y_pct == null ? '–' : `${u.students_change_5y_pct > 0 ? '+' : ''}${u.students_change_5y_pct.toFixed(0)}%`) },
    { key: 'intl', label: 'Intl', value: (u) => u.intl_pct, render: (u) => fmt.pct(u.intl_pct) },
    { key: 'fee', label: 'Avg fee', value: (u) => u.avg_fee_paying_eur, render: (u) => fmt.eur(u.avg_fee_paying_eur),
      title: 'Average yearly fee among students who pay (exempt students excluded)' },
    { key: 'grant', label: 'Grant coverage', value: (u) => u.scholarship_coverage_pct, render: (u) => fmt.pct(u.scholarship_coverage_pct, 0) },
    { key: 'e1', label: 'Employed 1y', value: (u) => u.employment_rate_master_1y, render: (u) => fmt.pct(u.employment_rate_master_1y) },
    { key: 'e5', label: 'Employed 5y', value: (u) => u.employment_rate_master_5y, render: (u) => fmt.pct(u.employment_rate_master_5y) },
    { key: 's5', label: 'Salary 5y', value: (u) => u.net_salary_master_5y, render: (u) => fmt.eur(u.net_salary_master_5y) },
  ]

  return (
    <section id="universities">
      <div className="section-head">
        <h2>Every university</h2>
        <p>
          {universities.length} institutions with enrolled students in 2024/25. Outcome columns are blank for
          universities that are not part of the AlmaLaurea consortium (for example Politecnico di Milano, Bocconi,
          Cattolica and Luiss).
        </p>
      </div>
      <div className="card">
        <div className="controls">
          <label className="control">Search
            <input type="search" placeholder="Name or city" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <div className="seg" role="group" aria-label="University type">
            {(['all', 'public', 'private', 'online'] as const).map((k) => (
              <button key={k} aria-pressed={k === kind} onClick={() => setKind(k)}>{k[0].toUpperCase() + k.slice(1)}</button>
            ))}
          </div>
          <span className="card-sub" style={{ margin: 0 }}>{rows.length} shown</span>
        </div>
        <SortableTable rows={rows} columns={columns} rowKey={(u) => u.ateneo_code} initialSort={{ key: 'students', desc: true }} />
      </div>
    </section>
  )
}
