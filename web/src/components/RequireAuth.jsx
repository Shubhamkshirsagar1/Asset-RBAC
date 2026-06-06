import { Navigate } from 'react-router-dom';
import { getToken } from '../api.js';

export function RequireAuth({ children }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return children;
}
