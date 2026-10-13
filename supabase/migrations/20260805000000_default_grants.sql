-- Supabase's standard permissions for the public schema, stated in the repo
-- so a fresh database matches production. Production's platform already
-- set these, so there this changes nothing. Row-level security still
-- decides which rows anyone sees, and later migrations narrow these
-- (revokes and column grants) as they do in production.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
