import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { store } from '../db/store.js';
import { JWT_SECRET, JWT_TTL } from '../config.js';

const router = Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = store.findUserByEmail(email);

  if (!user || !bcrypt.compareSync(password || '', user.passwordHash)) {
    return res.status(401).json({ error: 'invalid credentials' });
  }

  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: JWT_TTL });
  res.json({ access_token: token, token_type: 'Bearer' });
});

export default router;
