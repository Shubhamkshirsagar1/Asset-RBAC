// Permission matching: strings are "resource:action:scope".
// "*" matches anything within a segment. Scope is hierarchical: "any" covers "own".
//
//   invoices:read:any        -> read any invoice
//   invoices:read:own        -> read only your own
//   invoices:*:any           -> every action on invoices
//   *:*:*                     -> superadmin

function segMatch(granted, required) {
  return granted === '*' || granted === required;
}

// Does a single granted permission satisfy the required one?
export function matchesOne(granted, required) {
  const [gRes, gAct, gScope = 'any'] = granted.split(':');
  const [rRes, rAct, rScope = 'any'] = required.split(':');

  if (!segMatch(gRes, rRes)) return false;
  if (!segMatch(gAct, rAct)) return false;

  // scope: "*" matches both; exact match passes; a broader "any" grant
  // satisfies a narrower "own" requirement, but never the reverse.
  if (gScope === '*' || gScope === rScope) return true;
  if (gScope === 'any' && rScope === 'own') return true;
  return false;
}

// Does ANY granted permission satisfy the required one?
export function matches(grantedList, required) {
  return grantedList.some((g) => matchesOne(g, required));
}
