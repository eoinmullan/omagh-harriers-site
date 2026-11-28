-- Why somebody can open Emergency contacts.
--
-- The list of logins holding the flag (0026) is the answer to "who can see
-- emergency contacts?", for the committee, a DPIA or a parent. A short reason
-- beside each one ("Coach, Juniors", "Welfare officer") makes that list
-- explain itself, as `trains_free_reason` does for members who train free
-- (0025).
--
-- Required when the flag is given, which the admin form enforces
-- (`planEmergencyAccess`); the database allows it only while the flag is on,
-- and never blank. Logins given the flag before this migration have none until
-- an admin next saves the setting.
--
-- For admins, who read principals with the service role, so it stays out of
-- the column grant (0018).

ALTER TABLE public.principals
  ADD COLUMN emergency_contacts_reason text,
  ADD CONSTRAINT principals_emergency_contacts_reason_only_while_held
    CHECK (opens_emergency_contacts OR emergency_contacts_reason IS NULL),
  ADD CONSTRAINT principals_emergency_contacts_reason_not_blank
    CHECK (emergency_contacts_reason IS NULL OR length(btrim(emergency_contacts_reason)) > 0);

COMMENT ON COLUMN public.principals.emergency_contacts_reason IS
  'Why this login can open Emergency contacts. Set by an admin with the flag.';
