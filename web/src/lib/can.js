// Client-side permission check used only to gray out controls.
// The server remains the source of truth; this never grants access by itself.
export function can(permissions, resourceType, action) {
  return (permissions || []).some(
    (p) =>
      (p.resourceTypeKey === resourceType || p.resourceTypeKey === '*') &&
      (p.actionKey === action || p.actionKey === '*')
  );
}
