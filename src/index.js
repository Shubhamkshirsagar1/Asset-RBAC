import { createApp } from './app.js';
import { PORT } from './config.js';

createApp().listen(PORT, () => {
  console.log(`RBAC demo API listening on http://localhost:${PORT}`);
  console.log('Try: POST /auth/login { "email": "alice@example.com", "password": "password" }');
});
