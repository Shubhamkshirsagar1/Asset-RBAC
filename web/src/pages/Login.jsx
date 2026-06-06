import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [tenantSlug, setTenant] = useState('mercy');
  const [email, setEmail] = useState('bob@mercy.test');
  const [password, setPassword] = useState('password');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(tenantSlug, email, password);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="card login" onSubmit={submit}>
        <h1>RBAC Console</h1>
        <label>Tenant slug<input value={tenantSlug} onChange={(e) => setTenant(e.target.value)} /></label>
        <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <p className="error">{error}</p>}
        <button disabled={busy} type="submit">{busy ? '…' : 'Log in'}</button>
        <div className="muted small">
          <p>Demo (password <code>password</code>):</p>
          <p><code>mercy</code> · root / alice / bob / carol / dan @mercy.test</p>
          <p><code>acme</code> · dave / erin / frank @acme.test</p>
        </div>
      </form>
    </div>
  );
}
