-- a squad's regulars are who has trained with it in the last eight weeks
--
-- 0020's view answered "who has ever attended this squad", once each. One
-- visit two seasons ago kept somebody on the registrar's Usuals for good, so
-- every squad's list only grew. Now a regular is somebody who has trained with
-- the squad in the last eight weeks, and they drop off when they stop coming,
-- unless an admin has made them a member of the squad (member_groups), which
-- keeps them on the list regardless.
--
-- It also says how often and how recently, for the squad's admin page, which
-- shows who has been turning up without being a member so an admin can make
-- them one. The registrar app still reads only member_id.
--
-- The window is here and nowhere else, so the registrar's list and the admin
-- page can't disagree about who counts. now() is read per query, so the window
-- moves on by itself.
--
-- Still security_invoker, as in 0020, so the caller's RLS decides what it
-- returns. CREATE OR REPLACE keeps 0020's grants; the two new columns go on
-- the end, which is all a replaced view may change.

CREATE OR REPLACE VIEW public.squad_regulars
  WITH (security_invoker = true)
AS
SELECT
  s.group_id,
  a.member_id,
  count(*)::integer AS sessions_attended,
  max(s.starts_at) AS last_attended_at
FROM public.attendance a
JOIN public.training_sessions s ON s.id = a.session_id
WHERE a.member_id IS NOT NULL
  AND s.starts_at >= now() - interval '8 weeks'
GROUP BY s.group_id, a.member_id;

COMMENT ON VIEW public.squad_regulars IS
  'Each member who has trained with the squad in the last eight weeks, once, '
  'with how many of its sessions they came to and when they last did. Feeds '
  'the registrar''s Usuals list and the squad''s admin page. Sized by '
  'membership, not by history, so it never meets PostgREST''s row limit.';
