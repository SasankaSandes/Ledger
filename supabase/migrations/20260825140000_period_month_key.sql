-- Periods no longer store a freeform display label. Instead they carry a
-- canonical "2026-08"-style month_key, so a new period can be computed as
-- "the month after the current one" (August -> September) — advancing like
-- a calendar page each time the user starts a new month, regardless of
-- today's actual date — rather than being re-derived from real-world
-- "today" each time (which produced duplicate "August 2026" labels for
-- every period started within the same calendar month).
--
-- Safely re-runnable, same as the previous migration.

alter table periods add column if not exists month_key text;

update periods set month_key = to_char(started_at, 'YYYY-MM') where month_key is null;

alter table periods alter column month_key set not null;

alter table periods drop column if exists label;
