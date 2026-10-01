// Rate limiting for public, unauthenticated endpoints — share-token lookups
// today, Phase 4.1's free board meeting next. Token/IP enumeration is
// impractical against a UUIDv4 by brute force alone, but the check is cheap
// and closes the gap properly rather than relying on entropy alone.
//
// Backed by public_access_log (service-role only, no RLS policies) rather
// than in-memory state, since edge functions have no shared memory across
// invocations or regions.

// The client's IP, preferring headers the platform sets itself over
// X-Forwarded-For, whose leftmost entry a client can write. Which of these
// Supabase's gateway provides is logged once per worker (names only, never
// values) so it can be confirmed from the function logs.
let ipSourceLogged = false;
export function getClientIp(req: Request): string {
  const platform = req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip');
  if (!ipSourceLogged) {
    ipSourceLogged = true;
    const present = ['cf-connecting-ip', 'x-real-ip', 'x-forwarded-for'].filter((h) => req.headers.has(h));
    console.log(`client IP headers present: ${present.join(', ') || 'none'}`);
  }
  if (platform) return platform.trim();
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return 'unknown';
}

// Keyed with IP_HASH_SECRET: a plain SHA-256 of an IPv4 address can be
// reversed by hashing all four billion of them.
export async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip);
  const secret = Deno.env.get('IP_HASH_SECRET');
  let hashBuffer: ArrayBuffer;
  if (secret) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    hashBuffer = await crypto.subtle.sign('HMAC', key, data);
  } else {
    console.error('IP_HASH_SECRET is not set; falling back to an unkeyed hash');
    hashBuffer = await crypto.subtle.digest('SHA-256', data);
  }
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
