import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { can } from '../lib/can.js';
import { DataTable } from '../components/DataTable.jsx';

export function Projects() {
  const { permissions } = useAuth();
  const [rows, setRows] = useState([]);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState(null);

  const load = () => api('/projects').then((d) => setRows(d.projects)).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);

  const act = async (fn) => {
    setMsg(null);
    try { await fn(); await load(); } catch (e) { setMsg(`${e.status || ''} ${e.message}`); }
  };

  return (
    <div>
      <h2>Projects</h2>
      {msg && <p className="error">{msg}</p>}
      <div className="card row">
        <input placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} />
        <button
          disabled={!can(permissions, 'project', 'create')}
          onClick={() => act(async () => { await api('/projects', { method: 'POST', body: { name } }); setName(''); })}
        >Create</button>
      </div>
      <DataTable
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'ownerId', label: 'Owner', render: (p) => <code>{p.ownerId?.slice(0, 8)}</code> },
        ]}
        rows={rows}
        empty="No projects visible to you (scope-filtered)."
      />
    </div>
  );
}
