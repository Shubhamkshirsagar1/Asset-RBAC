// Tiny presentational table. columns: [{ key, label, render? }]
export function DataTable({ columns, rows, empty = 'Nothing to show.' }) {
  if (!rows?.length) return <p className="muted">{empty}</p>;
  return (
    <table className="data-table">
      <thead>
        <tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            {columns.map((c) => (
              <td key={c.key}>{c.render ? c.render(row) : row[c.key]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
