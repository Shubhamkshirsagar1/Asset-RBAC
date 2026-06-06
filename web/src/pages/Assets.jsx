import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { can } from '../lib/can.js';
import { DataTable } from '../components/DataTable.jsx';

export function Assets() {
  const { permissions } = useAuth();
  const [rows, setRows] = useState([]);
  const [name, setName] = useState('');
  const [value, setValue] = useState(0);
  const [msg, setMsg] = useState(null);

  const load = () => api('/assets').then((d) => setRows(d.assets)).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);

  const act = async (fn) => {
    setMsg(null);
    try { await fn(); await load(); } catch (e) { setMsg(`${e.status || ''} ${e.message}`); }
  };

  const create = () => act(async () => {
    await api('/assets', { method: 'POST', body: { name, value: Number(value) } });
    setName(''); setValue(0);
  });

  return (
    <div>
      <h2>Assets</h2>
      {msg && <p className="error">{msg}</p>}
      <div className="card row">
        <input placeholder="Asset name" value={name} onChange={(e) => setName(e.target.value)} />
        <input type="number" placeholder="Value" value={value} onChange={(e) => setValue(e.target.value)} />
        <button disabled={!can(permissions, 'asset', 'create')} onClick={create}>Create</button>
      </div>
      <DataTable
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'status', label: 'Status' },
          { key: 'value', label: 'Value' },
          {
            key: 'actions', label: '', render: (a) => (
              <button
                disabled={!can(permissions, 'asset', 'dispose') || a.status === 'disposed'}
                onClick={() => act(() => api(`/assets/${a.id}/dispose`, { method: 'POST' }))}
              >Dispose</button>
            ),
          },
        ]}
        rows={rows}
        empty="No assets visible to you (scope-filtered)."
      />
    </div>
  );
}
