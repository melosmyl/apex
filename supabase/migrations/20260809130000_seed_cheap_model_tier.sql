-- Registers the cheap/fast tier used for routine, non-strategic calls (e.g.
-- document-spec generation) — never board debate or chair synthesis, where
-- reasoning quality is the product. routeAdvisorRequest reads this row via
-- purpose='cheap_tier' and falls back to a hardcoded default if it's ever
-- deleted or deactivated, so this seed is documentation as much as config —
-- the admin console does not yet expose ai_model_configurations for editing.
insert into public.ai_model_configurations
  (provider, model_name, display_name, purpose, is_active, relative_cost_level, speed_level, quality_level, notes)
select 'openai', 'gpt-4o-mini', 'GPT-4o mini (cheap tier)', 'cheap_tier', true, 'low', 'fast', 'standard',
  'Used for routine, non-strategic tasks like document-spec generation. Not used for board debate or chair synthesis.'
where not exists (
  select 1 from public.ai_model_configurations where purpose = 'cheap_tier'
);
