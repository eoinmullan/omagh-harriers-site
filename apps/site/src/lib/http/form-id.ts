// An id for the row a create form will make, minted when the form is drawn.
//
// The page inserts with this id and ignores a conflict, so the same form
// submitted twice (a double click, or a resubmission that gets past the
// redirect) writes one row. It's the same idea as the ledger forms'
// per-render idempotency key, and as the registrar app minting a session's id
// on the phone.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function newFormId(): string {
  return crypto.randomUUID();
}

/**
 * The id a submitted form carried, if it carried a real one. Anything else is
 * ignored, so the insert gets a database-generated id instead: no protection
 * against a double submit, but no failure either.
 */
export function submittedFormId(value: FormDataEntryValue | null | undefined): string | undefined {
  return typeof value === 'string' && UUID.test(value) ? value : undefined;
}
