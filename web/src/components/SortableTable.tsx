import { useMemo, useState, type ReactNode } from 'react'

export type Column<T> = {
  key: string
  label: string
  value: (row: T) => number | string | null | undefined
  render?: (row: T) => ReactNode
  title?: string
}

/** Plain sortable table: the accessible "table view" behind every chart. */
export function SortableTable<T>({ rows, columns, initialSort, rowKey }: {
  rows: T[]
  columns: Column<T>[]
  initialSort: { key: string; desc: boolean }
  rowKey: (row: T) => string | number
}) {
  const [sort, setSort] = useState(initialSort)
  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort.key) ?? columns[0]
    return [...rows].sort((a, b) => {
      const va = col.value(a), vb = col.value(b)
      if (va == null && vb == null) return 0
      if (va == null) return 1            // missing values always sink to the bottom
      if (vb == null) return -1
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
      return sort.desc ? -cmp : cmp
    })
  }, [rows, columns, sort])

  return (
    <div className="table-wrap scroll-y">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} title={c.title}
                aria-sort={sort.key === c.key ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
                <button onClick={() => setSort((s) => ({ key: c.key, desc: s.key === c.key ? !s.desc : true }))}>
                  {c.label}{sort.key === c.key ? (sort.desc ? ' ↓' : ' ↑') : ''}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={rowKey(r)}>
              {columns.map((c) => {
                const v = c.value(r)
                return <td key={c.key}>{c.render ? c.render(r) : v == null ? <span className="na">–</span> : v}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
