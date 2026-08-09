// Rate limiting for public, unauthenticated endpoints — share-token lookups
// today, Phase 4.1's free board meeting next. Token/IP enumeration is
// impractical against a UUIDv4 by brute force alone, but the check is cheap
// and closes the gap properly rather than relying on entropy alone.
//
// Backed by public_access_log (service-role only, no RLS policies) rather
// than in-memory state, since edge functions have no shared memory across
// invocations or regions.

function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

export async function checkRateLimit(
  // deno-lint-ignore no-explicit-any
  db: any,
  req: Request,
  endpoint: string,
  { maxRequests = 30, windowMinutes = 5 }: { maxRequests?: number; windowMinutes?: number } = {}
): Promise<boolean> {
  const ip = getClientIp(req);
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();

  const { count } = await db
    .from('public_access_log')
    .select('*', { count: 'exact', head: true })
    .eq('ip_address', ip)
    .eq('endpoint', endpoint)
    .gte('created_at', since);

  // Log this attempt regardless of outcome — a denied request still counts
  // toward the window, or a hammering client could reset its own limit by
  // getting denied.
  await db.from('public_access_log').insert({ ip_address: ip, endpoint });

  return (count ?? 0) < maxRequests;
}
