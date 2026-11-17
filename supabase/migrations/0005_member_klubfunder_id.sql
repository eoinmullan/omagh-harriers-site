-- Klubfunder's own member id, carried through so it can be the identity.
--
-- Members were previously matched on first name + surname + date of birth.
-- That key is editable at the source: correcting a typo or a date of birth in
-- Klubfunder reads as one member leaving and a different one arriving, which
-- lapses a real member and creates a duplicate alongside them. Once credit and
-- attendance hang off a member row, that silently detaches their history.
--
-- The export now carries a stable MemberId, so match on that and treat name
-- and date of birth as ordinary mutable fields. Nullable, because manually
-- added members have no Klubfunder record, and because members created before
-- the export carried an id are backfilled on the next sync.

ALTER TABLE public.members
  ADD COLUMN klubfunder_member_id text;

CREATE UNIQUE INDEX members_klubfunder_member_id_unique_idx
  ON public.members (klubfunder_member_id)
  WHERE klubfunder_member_id IS NOT NULL;
