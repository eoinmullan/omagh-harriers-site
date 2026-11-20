-- who has trained with a squad, each of them once
--
-- The registrar's Usuals list learns from history: anybody who has turned up to
-- a squad before is on its list. It used to work that out by fetching every
-- attendance row the squad had ever recorded and keeping the distinct member
-- ids in the browser. That grows by roughly 1,500 rows a season for a busy
-- squad, and PostgREST stops at 1000 rows without saying so. Past that, the
-- list would have learned from an arbitrary subset of the history and quietly
-- dropped people who had trained with the squad.
--
-- `usualsFor` only ever needed *who*, never how often. So the database answers
-- that question directly. The view returns one row per member per squad, so
-- its size is limited by the club's membership rather than its history. That
-- is one request on track wifi.
--
-- It's a view rather than a function so that RLS stays in charge.
-- security_invoker means the caller's own policies on `attendance` and
-- `training_sessions` decide what it returns: the whole club for a registrar,
-- their own household for a member, nothing for anyone else. There is no money
-- rule here to keep in step with the TypeScript, just a DISTINCT.

CREATE VIEW public.squad_regulars
  WITH (security_invoker = true)
AS
SELECT DISTINCT s.group_id, a.member_id
FROM public.attendance a
JOIN public.training_sessions s ON s.id = a.session_id
WHERE a.member_id IS NOT NULL;

COMMENT ON VIEW public.squad_regulars IS
  'Each member who has attended a session of the squad, once. Feeds the '
  'registrar''s Usuals list. Sized by membership, not by history, so it never '
  'meets PostgREST''s row limit.';

REVOKE ALL ON public.squad_regulars FROM anon;
GRANT SELECT ON public.squad_regulars TO authenticated;
