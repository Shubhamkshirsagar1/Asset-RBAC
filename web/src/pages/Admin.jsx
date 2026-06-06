import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { DataTable } from '../components/DataTable.jsx';

const PRESETS = {
  '(none)': '',
  'Ownership': '{ "resource.ownerId": { "owner": true } }',
  'Cost ≤ 5000': '{ "resource.cost": { "lte": 5000 } }',
  'Status ≠ done': '{ "resource.status": { "ne": "done" } }',
  'Not self + ≤5000': '{ "resource.requestedById": { "ne": "$user.id" }, "resource.cost": { "lte": 5000 } }',
};

function useRoles() {
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState(null);
  const load = () => api('/admin/roles').then((d) => setRoles(d.roles)).catch((e) => setError(`${e.status || ''} ${e.message}`));
  useEffect(() => { load(); }, []);
  return { roles, error, reloadRoles: load };
}

function GrantBuilder({ roles }) {
  const [roleId, setRoleId] = useState('');
  const [resourceTypeKey, setRt] = useState('asset');
  const [actionKey, setAction] = useState('read');
  const [scope, setScope] = useState('own');
  const [condition, setCondition] = useState('');
  const [msg, setMsg] = useState(null);

  const submit = async () => {
    setMsg(null);
    let cond = null;
    if (condition.trim()) {
      try { cond = JSON.parse(condition); } catch { setMsg('Condition is not valid JSON'); return; }
    }
    try {
      await api(`/admin/roles/${roleId}/grants`, { method: 'POST', body: { resourceTypeKey, actionKey, scope, condition: cond } });
      setMsg('Grant created ✓ (cache invalidated)');
    } catch (e) { setMsg(`${e.status || ''} ${e.message}`); }
  };

  return (
    <section className="card">
      <h3>Grant builder</h3>
      <div className="grid">
        <label>Role
          <select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            <option value="">— pick a role —</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <label>Resource<input value={resourceTypeKey} onChange={(e) => setRt(e.target.value)} /></label>
        <label>Action<input value={actionKey} onChange={(e) => setAction(e.target.value)} /></label>
        <label>Scope
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            {['own', 'dept', 'facility', 'tenant', 'any'].map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <label>Condition preset
        <select onChange={(e) => setCondition(PRESETS[e.target.value])}>
          {Object.keys(PRESETS).map((k) => <option key={k}>{k}</option>)}
        </select>
      </label>
      <textarea rows={3} placeholder='Condition JSON (optional)' value={condition} onChange={(e) => setCondition(e.target.value)} />
      <button disabled={!roleId} onClick={submit}>Create grant</button>
      {msg && <p className="muted">{msg}</p>}
    </section>
  );
}

function PageToggles({ roles }) {
  const [roleId, setRoleId] = useState('');
  const [pages, setPages] = useState([]);
  const [disabled, setDisabled] = useState(new Set());
  const [msg, setMsg] = useState(null);

  useEffect(() => { api('/admin/pages').then((d) => setPages(d.pages)).catch((e) => setMsg(e.message)); }, []);
  useEffect(() => {
    if (!roleId) return;
    api(`/admin/roles/${roleId}/pages`)
      .then((d) => setDisabled(new Set(d.access.filter((a) => !a.enabled).map((a) => a.pageId))))
      .catch((e) => setMsg(e.message));
  }, [roleId]);

  const toggle = async (pageId, enabled) => {
    setMsg(null);
    try {
      await api(`/admin/roles/${roleId}/pages/${pageId}`, { method: 'PUT', body: { enabled } });
      setDisabled((prev) => { const next = new Set(prev); enabled ? next.delete(pageId) : next.add(pageId); return next; });
    } catch (e) { setMsg(`${e.status || ''} ${e.message}`); }
  };

  return (
    <section className="card">
      <h3>Page toggles</h3>
      <label>Role
        <select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
          <option value="">— pick a role —</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </label>
      {roleId && (
        <DataTable
          columns={[
            { key: 'label', label: 'Page' },
            { key: 'enabled', label: 'Enabled for role', render: (p) => (!disabled.has(p.id) ? 'yes' : 'no') },
            {
              key: 'actions', label: '', render: (p) => (
                <button onClick={() => toggle(p.id, disabled.has(p.id))}>
                  {disabled.has(p.id) ? 'Enable' : 'Disable'}
                </button>
              ),
            },
          ]}
          rows={pages}
        />
      )}
      {msg && <p className="error">{msg}</p>}
    </section>
  );
}

function Explainer() {
  const [form, setForm] = useState({ userId: '', action: 'approve', resourceType: 'work_order', resource: '{ "requestedById": "", "cost": 9000 }' });
  const [result, setResult] = useState(null);
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const run = async () => {
    setMsg(null); setResult(null);
    let resource = null;
    if (form.resource.trim()) {
      try { resource = JSON.parse(form.resource); } catch { setMsg('Resource is not valid JSON'); return; }
    }
    try {
      setResult(await api('/admin/explain', { method: 'POST', body: { userId: form.userId, action: form.action, resourceType: form.resourceType, resource } }));
    } catch (e) { setMsg(`${e.status || ''} ${e.message}`); }
  };

  return (
    <section className="card">
      <h3>Why? — decision explainer</h3>
      <div className="grid">
        <label>User id<input value={form.userId} onChange={set('userId')} /></label>
        <label>Action<input value={form.action} onChange={set('action')} /></label>
        <label>Resource type<input value={form.resourceType} onChange={set('resourceType')} /></label>
      </div>
      <textarea rows={3} value={form.resource} onChange={set('resource')} />
      <button onClick={run}>Explain</button>
      {msg && <p className="error">{msg}</p>}
      {result && (
        <pre className={result.decision.allowed ? 'ok' : 'deny'}>
{JSON.stringify(result.decision, null, 2)}
        </pre>
      )}
    </section>
  );
}

export function Admin() {
  const { roles, error } = useRoles();

  return (
    <div>
      <h2>Admin console</h2>
      {error && <p className="error">{error} — you need <code>rbac:manage</code> to administer.</p>}
      <section className="card">
        <h3>Roles</h3>
        <DataTable columns={[{ key: 'name', label: 'Name' }, { key: 'id', label: 'Id', render: (r) => <code>{r.id.slice(0, 8)}</code> }]} rows={roles} />
      </section>
      <GrantBuilder roles={roles} />
      <PageToggles roles={roles} />
      <Explainer />
    </div>
  );
}
