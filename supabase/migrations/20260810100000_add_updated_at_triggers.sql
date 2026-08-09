-- updated_at has been a pure creation-time default everywhere — no trigger
-- ever bumped it on UPDATE, so it silently never reflected reality. This
-- broke the Documents page's "Recently Updated" sort (a no-op dressed as a
-- real feature) and blocked anything, like the Chair's opening statement,
-- that needs to know when a task actually became done rather than when it
-- was created.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  for t in
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'updated_at'
  loop
    execute format(
      'drop trigger if exists set_updated_at on public.%I; create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at();',
      t, t
    );
  end loop;
end $$;
