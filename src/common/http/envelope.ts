/** Standard success envelope: { data, error, meta }. */
export function ok<T>(data: T, meta: Record<string, unknown> | null = null) {
  return { data, error: null, meta };
}
