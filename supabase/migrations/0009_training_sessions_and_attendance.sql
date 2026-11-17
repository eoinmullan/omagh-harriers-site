-- training sessions, attendance, and the registrar role
--
-- A training session is a first-class row rather than something derived from
-- the published timetable. Publishing the timetable and running training are
-- two different jobs done by two different people in the club, and the two
-- are deliberately kept apart.
--
-- Attendance is NOT append-only. Only credit_transactions is. A mis-tapped
-- sign-in is cleared by removing the attendance row; the money it moved is
-- corrected in the ledger by a compensating row, as ever.

-- registrar role ----------------------------------------------------------
--
-- A volunteer signing runners in on a borrowed phone needs to record
-- attendance and take cash, and none of what `admin` carries: reassigning
-- roles, deactivating households, moving balances between them.

ALTER TABLE public.principals
  DROP CONSTRAINT principals_role_check;

ALTER TABLE public.principals
  ADD CONSTRAINT principals_role_check
  CHECK (role IN ('member', 'registrar', 'admin', 'superuser'));

-- groups ------------------------------------------------------------------
--
-- The squads the club actually trains in. Admins add them through the UI, so
-- the list is never a deploy away.
--
-- Retiring a group is `is_active = false`, never a delete, so its sessions and
-- their attendance keep meaning something.

CREATE TABLE public.groups (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive, so "Endurance" and "endurance" can't both exist. The
-- column stays plain text because the name is a display string, not a key.
CREATE UNIQUE INDEX groups_name_unique_idx ON public.groups (lower(name));

CREATE INDEX groups_is_active_idx ON public.groups (is_active) WHERE is_active;

-- training_sessions -------------------------------------------------------
--
-- `price_pence` is copied from the £2 constant in code at creation time. The
-- session keeps its own copy, so changing the constant never rewrites a
-- session that has already run, and never contradicts the ledger, which
-- records what was actually charged.
--
-- `id` has a default, but the sign-in PWA supplies its own: a session created
-- offline has to sync as one session, not one per retry.

CREATE TABLE public.training_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  group_id     uuid NOT NULL REFERENCES public.groups(id) ON DELETE RESTRICT,
  starts_at    timestamptz NOT NULL,
  location     text,
  -- Strictly positive: a zero-price session could produce no ledger row at
  -- all, since credit_transactions refuses a zero amount.
  price_pence  integer NOT NULL CHECK (price_pence > 0),
  is_cancelled boolean NOT NULL DEFAULT false,
  created_by   uuid NOT NULL REFERENCES public.principals(id) ON DELETE RESTRICT,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX training_sessions_starts_at_idx
  ON public.training_sessions (starts_at DESC);

CREATE INDEX training_sessions_group_id_starts_at_idx
  ON public.training_sessions (group_id, starts_at DESC);

-- member_groups -----------------------------------------------------------
--
-- Which squads a member trains with. This is what makes the Usuals list
-- useful on the first night, before any attendance history exists to refine
-- it with.

CREATE TABLE public.member_groups (
  member_id  uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  group_id   uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, group_id)
);

CREATE INDEX member_groups_group_id_idx ON public.member_groups (group_id);

-- guests ------------------------------------------------------------------
--
-- A non-member is a name and an attendance row: no principal, no auth user,
-- no balance that could go negative. They pay at the time.
--
-- Deliberately no uniqueness on the name. Two genuine Jack Kellys would
-- collide, and a constraint violation in front of a queue is the exact
-- failure this phase exists to avoid. Keeping one person from becoming three
-- is the picker's job — it searches this list before offering to add.

CREATE TABLE public.guests (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  surname    text NOT NULL,
  created_by uuid NOT NULL REFERENCES public.principals(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX guests_surname_idx ON public.guests (lower(surname), lower(first_name));

-- attendance --------------------------------------------------------------
--
-- One row per runner per session, member or guest, never both. Members draw
-- on household credit, which is a ledger row; guests hand over the session
-- price, which `amount_paid_pence` records.
--
-- Uniqueness is per session, not per day: a member can quite legitimately be
-- at two sessions on the same date.

CREATE TABLE public.attendance (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        uuid NOT NULL REFERENCES public.training_sessions(id) ON DELETE RESTRICT,
  member_id         uuid REFERENCES public.members(id) ON DELETE RESTRICT,
  guest_id          uuid REFERENCES public.guests(id) ON DELETE RESTRICT,
  amount_paid_pence integer CHECK (amount_paid_pence > 0),
  recorded_by       uuid NOT NULL REFERENCES public.principals(id) ON DELETE RESTRICT,
  idempotency_key   text NOT NULL UNIQUE,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT attendance_names_a_member_or_a_guest CHECK (
    (member_id IS NOT NULL) <> (guest_id IS NOT NULL)
  ),

  -- Only guests pay cash for a session. A member's £2 comes out of the
  -- household pot, so the amount lives in the ledger and not here.
  CONSTRAINT attendance_only_guests_pay_at_the_track CHECK (
    member_id IS NULL OR amount_paid_pence IS NULL
  )
);

CREATE UNIQUE INDEX attendance_member_session_unique_idx
  ON public.attendance (member_id, session_id)
  WHERE member_id IS NOT NULL;

CREATE UNIQUE INDEX attendance_guest_session_unique_idx
  ON public.attendance (guest_id, session_id)
  WHERE guest_id IS NOT NULL;

CREATE INDEX attendance_session_id_idx ON public.attendance (session_id);

-- Training history in the members' area reads this way round.
CREATE INDEX attendance_member_id_created_at_idx
  ON public.attendance (member_id, created_at DESC)
  WHERE member_id IS NOT NULL;

-- credit_transactions gains its session link -------------------------------
--
-- `session_id` is what makes "cash taken tonight" answerable, so the tin can
-- be checked against something. The registrar app always sets it — the app
-- cannot show a list of names until a session has been chosen, so there is no
-- screen where a top-up could be recorded unattached. The admin site never
-- sets it: a top-up away from the track genuinely belongs to no session.
-- Which of the two happened is then a fact rather than a guess.
--
-- There is deliberately no `attendance_id` beside it. A foreign key to
-- attendance would be the tidier way to join a debit back to the sign-in that
-- caused it, but it would also be a RESTRICT reference holding that attendance
-- row in place, and unticking a member has to remove it. SET NULL is no way
-- out — the nulling is an UPDATE, which the append-only trigger refuses.
--
-- So the join goes the other way round, through `(member_id, session_id)`,
-- which `attendance` already indexes uniquely. One debit per sign-in is held
-- by the unique `idempotency_key`, which names the attendance row the phone
-- minted — a retry presents the same key and writes nothing, while a re-tick
-- after an untick is a new row and a new charge.

ALTER TABLE public.credit_transactions
  ADD COLUMN session_id uuid REFERENCES public.training_sessions(id) ON DELETE RESTRICT;

CREATE INDEX credit_transactions_session_id_idx
  ON public.credit_transactions (session_id)
  WHERE session_id IS NOT NULL;

-- Finding a member's debit for a session, which is the join that replaces the
-- foreign key above.
CREATE INDEX credit_transactions_member_id_session_id_idx
  ON public.credit_transactions (member_id, session_id)
  WHERE member_id IS NOT NULL AND session_id IS NOT NULL;
