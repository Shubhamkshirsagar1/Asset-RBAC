import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { can } from '../lib/can.js';
import { DataTable } from '../components/DataTable.jsx';

export function Tasks() {
  const { permissions } = useAuth();
  const [rows, setRows] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [msg, setMsg] = useState(null);

  const load = () => api('/tasks').then((d) => setRows(d.tasks)).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);

  const act = async (fn) => {
    setMsg(null);
    try { await fn(); await load(); } catch (e) { setMsg(`${e.status || ''} ${e.message}`); }
  };

  return (
    <div>
      <h2>Tasks</h2>
      {msg && <p className="error">{msg}</p>}
      <div className="card row">
        <input placeholder="Project id" value={projectId} onChange={(e) => setProjectId(e.target.value)} />
        <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button
          disabled={!can(permissions, 'task', 'create')}
          onClick={() => act(async () => { await api('/tasks', { method: 'POST', body: { projectId, title } }); setTitle(''); })}
        >Create</button>
      </div>
      <DataTable
        columns={[
          { key: 'title', label: 'Title' },
          { key: 'status', label: 'Status' },
          {
            key: 'actions', label: '', render: (t) => (
              <button
                disabled={!can(permissions, 'task', 'complete') || t.status === 'done'}
                onClick={() => act(() => api(`/tasks/${t.id}/complete`, { method: 'POST' }))}
              >Complete</button>
            ),
          },
        ]}
        rows={rows}
        empty="No tasks visible to you."
      />
    </div>
  );
}
