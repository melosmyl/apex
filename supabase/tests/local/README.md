# Local end-to-end tests

Run against a local Supabase stack (`supabase start`) with fake model providers,
so they cost nothing and never touch production.

1. Start the fake providers: `deno run --allow-net supabase/tests/local/fake_providers.ts`
   (port 54399; real Anthropic and OpenAI wire formats).
2. Serve the functions with an env file that points the providers at it:
   `ANTHROPIC_BASE_URL=http://host.docker.internal:54399` and
   `OPENAI_BASE_URL=http://host.docker.internal:54399/v1`, plus fake
   `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`.
   For the alert emails (quality_e2e): `RESEND_API_URL=http://host.docker.internal:54399/emails`,
   a fake `RESEND_API_KEY` and `ALERT_EMAIL_TO=owner@example.test`.
   And any `IP_HASH_SECRET` (the share page's rate limit hashes the caller's IP with it).
3. `LOCAL_ANON_KEY=… LOCAL_SERVICE_KEY=… deno run -A supabase/tests/local/stage1_e2e.ts`
   (keys from `supabase status -o env`; the script uses the
   `supabase_db_localstack` container for SQL checks).

`stage1_e2e.ts` covers Phase 1b Stage 1: thinking and effort sent on every
Claude call, output limits per call type, native answer formats, retries
(busy provider, mid-reply error, cut-off, refusal, rejected schema), and the
usage log (thinking tokens, real prices).

`knowledge_e2e.ts` covers Knowledge read by passage (23 October 2026): the
part of a long item that bears on the question reaches a meeting or task,
edits are read fresh, archived items and another founder's never are, and
with embeddings down (`{"failEmbeddings": true}` on `/__script`) everything
is read by its opening, as before.
