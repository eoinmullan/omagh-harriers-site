// A page read that failed is a failed page, not an empty one.
//
// supabase-js hands back `{ data, error }` and never throws. A page that read
// `data` and never looked at `error` showed a Supabase blip as an empty club:
// no households, a £0.00 float, a statement with no lines. That invited
// somebody to add a member again, or pay again. This throws instead, and
// Astro renders src/pages/500.astro, which says the records couldn't be
// reached.
//
// `data` is still null for a `.maybeSingle()` that found nothing, and that is
// an answer, not a failure, so it comes back as null.

export function orThrow<Data>(result: { data: Data; error: { message: string } | null }): Data {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
