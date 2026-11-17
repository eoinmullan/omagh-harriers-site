-- One-off: attach Klubfunder ids to the seven members the natural key can't place.
--
-- Every other member still matches on first name + surname + date of birth, so
-- the next sync backfills their id by itself. These seven don't, because the
-- very edit that makes the id worth having is the thing that broke their key:
-- four had " left" appended to the surname at the source, three had a date of
-- birth corrected by a year.
--
-- Without this, the first sync lapses all seven and inserts duplicates beside
-- them. With it: 0 lapses, and all 287 existing members pick up their id.
--
-- Run after 0005 and before the next sync. Ids come from the export of
-- 17 November 2026. On a rebuilt database these match nothing and do nothing.

UPDATE public.members SET klubfunder_member_id = '14188' WHERE id = '7f9437ae-54e3-4f3e-aafd-325987b48f9e'; -- surname changed
UPDATE public.members SET klubfunder_member_id = '14189' WHERE id = 'f2989e83-299f-4019-9e6e-b1c957342f51'; -- surname changed
UPDATE public.members SET klubfunder_member_id = '25085' WHERE id = '36a22af1-9208-413c-8189-0073f8ecd10d'; -- date of birth changed
UPDATE public.members SET klubfunder_member_id = '27036' WHERE id = '435ad2ed-614c-44f7-a650-700a290cfe3d'; -- date of birth changed
UPDATE public.members SET klubfunder_member_id = '28363' WHERE id = '7f40767e-1e56-4017-a14b-53b875dd0f02'; -- surname changed
UPDATE public.members SET klubfunder_member_id = '29450' WHERE id = '65cd6a07-d5c1-4acf-915c-5a5077061235'; -- date of birth changed
UPDATE public.members SET klubfunder_member_id = '38054' WHERE id = '3acb9b59-f599-4f03-b478-37c7f9c34ff6'; -- surname changed
