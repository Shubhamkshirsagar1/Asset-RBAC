import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

// The backend menu uses paths like '/', '/assets'. We render them verbatim.
function MenuNode({ node }) {
  return (
    <li>
      <NavLink to={node.path} end={node.path === '/'}>{node.label}</NavLink>
      {node.children?.length > 0 && (
        <ul>{node.children.map((c) => <MenuNode key={c.key} node={c} />)}</ul>
      )}
    </li>
  );
}

export function Layout() {
  const { user, menu, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="layout">
      <header className="topbar">
        <span className="brand">RBAC Console</span>
        <span className="spacer" />
        {user && (
          <span className="who">
            <strong>{user.email}</strong> · tenant <code>{user.tenantId?.slice(0, 8)}</code>
          </span>
        )}
        <button className="link" onClick={onLogout}>Log out</button>
      </header>
      <div className="body">
        <nav className="sidebar">
          <ul>{menu.map((node) => <MenuNode key={node.key} node={node} />)}</ul>
          <p className="muted small">Nav is built by the server from <code>/me/menu</code>.</p>
        </nav>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
