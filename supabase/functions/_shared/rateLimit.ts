// Rate limiting for public, unauthenticated endpoints — share-token lookups
// today, Phase 4.1's free board meeting next. Token/IP enumeration is
// impractical against a UUIDv4 by brute force alone, but the check is cheap
// and closes the gap properly rather than relying on entropy alone.
//
// Backed by public_access_log (service-role only, no RLS policies) rather
// than in-memory state, since edge functions have no shared memory across
// invocations or regions.

// The client's IP: the leftmost X-Forwarded-For entry, as before. Whether
// the gateway's own headers are more trustworthy is unconfirmed, and picking
// one that holds a gateway address would put every visitor in one bucket.
// Once per worker, log (as booleans only, never values) whether those
// headers exist and agree with X-Forwarded-For, so the function logs can
// settle it.
let ipSourceLogged = false;
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
  if (!ipSourceLogged) {
    ipSourceLogged = true;
    const cf = req.headers.get('cf-connecting-ip'), real = req.headers.get('x-real-ip');
    console.log(`client IP headers: xff=${!!forwarded} cf=${!!cf} cf_matches_xff=${!!cf && cf === forwarded} real=${!!real} real_matches_xff=${!!real && real === forwarded}`);
  }
  return forwarded || req.headers.get('x-real-ip') || 'unknown';
}

// Keyed with IP_HASH_SECRET: a plain SHA-256 of an IPv4 address can be
// reversed by hashing all four billion of them.
export async function hashIp(ip: string): Promise<string> {
  // Refuse rather than store a reversible hash.
  const secret = Deno.env.get('IP_HASH_SECRET');
  if (!secret) throw new Error('IP_HASH_SECRET is not set');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const hashBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function checkRateLimit(
  // deno-lint-ignore no-explicit-any
  db: any,
  req: Request,
  endpoint: string,
  { maxRequests = 30, windowMinutes = 5 }: { maxRequests?: number; windowMinutes?: number } = {}
): Promise<boolean> {
  // Stored and compared hashed: the access log never holds a raw IP.
  const ip = await hashIp(getClientIp(req));
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
