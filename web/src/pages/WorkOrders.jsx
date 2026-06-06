import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { can } from '../lib/can.js';
import { DataTable } from '../components/DataTable.jsx';

export function WorkOrders() {
  const { permissions } = useAuth();
  const [rows, setRows] = useState([]);
  const [assetId, setAssetId] = useState('');
  const [cost, setCost] = useState(0);
  const [msg, setMsg] = useState(null);

  const load = () => api('/work-orders').then((d) => setRows(d.workOrders)).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);

  const act = async (fn) => {
    setMsg(null);
    try { await fn(); await load(); } catch (e) { setMsg(`${e.status || ''} ${e.message}`); }
  };

  const create = () => act(async () => {
    await api('/work-orders', { method: 'POST', body: { assetId, cost: Number(cost) } });
    setAssetId(''); setCost(0);
  });

  return (
    <div>
      <h2>Work Orders</h2>
      {msg && <p className="error">{msg}</p>}
      <div className="card row">
        <input placeholder="Asset id" value={assetId} onChange={(e) => setAssetId(e.target.value)} />
        <input type="number" placeholder="Cost" value={cost} onChange={(e) => setCost(e.target.value)} />
        <button disabled={!can(permissions, 'work_order', 'create')} onClick={create}>Request</button>
      </div>
      <DataTable
        columns={[
          { key: 'id', label: 'Id', render: (w) => <code>{w.id.slice(0, 8)}</code> },
          { key: 'status', label: 'Status' },
          { key: 'cost', label: 'Cost' },
          {
            key: 'actions', label: '', render: (w) => (
              <button
                disabled={!can(permissions, 'work_order', 'approve') || w.status === 'approved'}
                onClick={() => act(() => api(`/work-orders/${w.id}/approve`, { method: 'POST' }))}
              >Approve</button>
            ),
          },
        ]}
        rows={rows}
        empty="No work orders visible to you."
      />
      <p className="muted small">
        Approve is gray unless you hold <code>work_order:approve</code>. Even when enabled, the server
        re-checks the cost-threshold and requester≠approver condition — a denial shows above.
      </p>
    </div>
  );
}
