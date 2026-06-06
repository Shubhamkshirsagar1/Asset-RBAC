import { useAuth } from '../auth.jsx';
import { DataTable } from '../components/DataTable.jsx';

export function Dashboard() {
  const { user, permissions } = useAuth();
  if (!user) return null;

  return (
    <div>
      <h2>Dashboard</h2>
      <div className="card">
        <p><strong>{user.email}</strong></p>
        <p className="muted">Tenant: <code>{user.tenantId}</code></p>
        <p className="muted">Roles: {user.roleIds?.length ? user.roleIds.map((r) => <code key={r}>{r.slice(0, 8)}</code>) : '—'}</p>
      </div>

      <h3>Effective permissions</h3>
      <DataTable
        columns={[
          { key: 'resourceTypeKey', label: 'Resource' },
          { key: 'actionKey', label: 'Action' },
          { key: 'scope', label: 'Scope' },
          { key: 'effect', label: 'Effect' },
          { key: 'condition', label: 'Condition', render: (g) => (g.condition ? <code>{JSON.stringify(g.condition)}</code> : '—') },
        ]}
        rows={permissions.map((p, i) => ({ id: p.id || i, ...p }))}
        empty="No grants — you can't do anything yet."
      />
    </div>
  );
}
