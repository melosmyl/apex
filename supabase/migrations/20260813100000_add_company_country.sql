-- The Progression Tree needs a jurisdiction to generate country-specific
-- branches against. Free text, not an enum, matching every other
-- onboarding-answer column on companies (business_model, team_size, etc).
alter table public.companies add column if not exists country text;
