// Types mirror the mart tables exported by pipeline/build.py.
import { useEffect, useState } from 'react'

export type City = {
  study_city: string
  region_name: string
  macro_area: string
  universities: number
  state_universities: number
  students: number
  intl_pct: number | null
  private_share_pct: number
  avg_fee_state_eur: number | null
  avg_fee_all_eur: number | null
  min_fee_state_eur: number | null
  reference_fee_eur: number | null
  reference_fee_is_private: boolean
  rent_sqm_year: number
  rent_sqm_year_short_term: number
  rent_source_level: 'city' | 'region_excl_city' | 'region' | 'area'
  employment_rate_master_1y: number | null
  employment_rate_master_5y: number | null
  net_salary_master_1y: number | null
  net_salary_master_5y: number | null
  outcomes_coverage_pct: number
  scholarship_coverage_pct: number | null
  avg_scholarship_eur: number | null
  dsu_beds: number | null
  dsu_beds_per_100_students: number | null
}

export type University = {
  ateneo_code: number
  university: string
  full_name: string
  study_city: string | null
  region_name: string
  is_state: boolean
  is_online: boolean
  students: number
  female_pct: number
  intl_students: number | null
  intl_pct: number | null
  students_change_5y_pct: number | null
  avg_fee_paying_eur: number | null
  avg_fee_all_eur: number | null
  scholarship_coverage_pct: number | null
  avg_scholarship_eur: number | null
  employment_rate_bachelor_1y: number | null
  employment_rate_master_1y: number | null
  employment_rate_master_5y: number | null
  net_salary_master_1y: number | null
  net_salary_master_5y: number | null
  degree_effective_pct_master_5y: number | null
  has_outcomes_data: boolean
  note: string | null
}

export type FieldOutcome = {
  field_code: number
  field_name: string
  field_area: string
  degree: 'bachelor' | 'master' | 'single_cycle'
  years_after: number
  graduates: number
  respondents: number
  employment_rate: number | null
  unemployment_rate: number | null
  net_monthly_salary: number | null
  months_to_first_job: number | null
  degree_effective_pct: number | null
  job_satisfaction: number | null
  working_abroad_pct: number | null
  permanent_contract_pct: number | null
}

export type CityField = { study_city: string; field_code: number; field_name: string; students: number }
export type CityTrend = { study_city: string; academic_year: string; students: number }
export type EuLatest = { geo: string; indicator: EuIndicator; value: number; year: number }
export type EuSeries = { geo: string; year: number } & Partial<Record<EuIndicator, number | null>>
export type EuIndicator =
  | 'price_level_index'
  | 'recent_grad_employment_pct'
  | 'tertiary_attainment_pct'
  | 'inbound_mobile_students_pct'

export type Meta = {
  generated_at: string
  reference_periods: { topic: string; period: string; note: string }[]
  tests: { test: string; description: string; passed: boolean; failing_rows: number }[]
  sources: { file: string; url: string; retrieved_at: string }[]
}

export type Data = {
  cities: City[]
  universities: University[]
  fields: FieldOutcome[]
  cityFields: CityField[]
  cityTrend: CityTrend[]
  euLatest: EuLatest[]
  euSeries: EuSeries[]
  meta: Meta
}

const FILES = {
  cities: 'cities.json',
  universities: 'universities.json',
  fields: 'fields.json',
  cityFields: 'city_fields.json',
  cityTrend: 'city_trend.json',
  euLatest: 'eu_latest.json',
  euSeries: 'eu_series.json',
  meta: 'meta.json',
} as const

export function useData(): Data | null {
  const [data, setData] = useState<Data | null>(null)
  useEffect(() => {
    const base = import.meta.env.BASE_URL
    Promise.all(
      Object.entries(FILES).map(async ([key, file]) => {
        const res = await fetch(`${base}data/${file}`)
        return [key, await res.json()] as const
      }),
    ).then((entries) => setData(Object.fromEntries(entries) as Data))
  }, [])
  return data
}

// ---------- the cost model (documented in the Methodology section) ----------

export type RentSegment = 'long' | 'short'
export type Assumptions = { sqm: number; segment: RentSegment }

/** Rent for one student's share of a flat, per year (OMI €/m²/year × m²). */
export function annualRent(c: City, a: Assumptions): number {
  const perSqm = a.segment === 'long' ? c.rent_sqm_year : c.rent_sqm_year_short_term
  return perSqm * a.sqm
}

/** Estimated yearly cost of studying: average university fee + rent. */
export function annualCost(c: City, a: Assumptions): number | null {
  if (c.reference_fee_eur == null) return null
  return c.reference_fee_eur + annualRent(c, a)
}

export const MACRO_GROUP: Record<string, 'North' | 'Centre' | 'South & Islands'> = {
  'Nord-ovest': 'North',
  'Nord-est': 'North',
  Centro: 'Centre',
  Sud: 'South & Islands',
  Isole: 'South & Islands',
}
export const MACRO_GROUPS = ['North', 'Centre', 'South & Islands'] as const

export const RENT_SOURCE_LABEL: Record<City['rent_source_level'], string> = {
  city: 'city',
  region_excl_city: 'region excl. big city',
  region: 'region',
  area: 'macro-area',
}

// ---------- formatting ----------

const eur0 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const int = new Intl.NumberFormat('en-GB')
export const fmt = {
  eur: (v: number | null | undefined) => (v == null ? '–' : eur0.format(v)),
  int: (v: number | null | undefined) => (v == null ? '–' : int.format(Math.round(v))),
  pct: (v: number | null | undefined, d = 1) => (v == null ? '–' : `${v.toFixed(d)}%`),
  compact: (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}K` : `${v}`),
}
