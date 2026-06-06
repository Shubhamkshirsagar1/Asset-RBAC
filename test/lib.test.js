import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/lib/password.js';
import { signToken, verifyToken } from '../src/lib/jwt.js';

test('hashPassword + verifyPassword round-trips', async () => {
  const hash = await hashPassword('password');
  assert.notEqual(hash, 'password');
  assert.equal(await verifyPassword('password', hash), true);
  assert.equal(await verifyPassword('wrong', hash), false);
});

test('signToken + verifyToken round-trips the payload', () => {
  const token = signToken({ userId: 'u1', tenantId: 't1' });
  const decoded = verifyToken(token);
  assert.equal(decoded.userId, 'u1');
  assert.equal(decoded.tenantId, 't1');
});

test('verifyToken throws on a tampered token', () => {
  assert.throws(() => verifyToken('not.a.jwt'));
});
