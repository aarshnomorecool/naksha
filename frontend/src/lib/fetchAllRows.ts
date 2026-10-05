// Supabase/PostgREST caps a response at 1000 rows by default and truncates
// silently. Any query whose row count grows with real usage (attendance!)
// must page through with this, ordered by a unique column so pages don't
// overlap or skip rows.
const PAGE = 1000

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) return rows
  }
}
