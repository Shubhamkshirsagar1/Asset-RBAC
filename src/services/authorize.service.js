import { models } from '../db/index.js';
import { evaluateAccess, resolveScope } from '../engine/index.js';
import { buildSubject } from './subject.service.js';
import { collectGrants } from './rbac.service.js';

const { AuditLog } = models;

async function record(subject, action, resourceType, resourceId, decision) {
  await AuditLog.create({
    tenantId: subject.tenantId,
    userId: subject.id,
    action,
    resourceType,
    resourceId: resourceId ?? null,
    decision: decision.allowed ? 'allow' : 'deny',
    reason: decision.reason,
    matchedGrantId: decision.matchedGrant?.id ?? null,
  });
}

// Full authorization for a specific resource. Records an audit row.
export async function can(userId, action, resourceType, resource = null, env = { now: new Date() }) {
  const subject = await buildSubject(userId);
  const grants = await collectGrants(userId);
  const decision = evaluateAccess({ grants, action, resourceType, user: subject, resource, env });
  await record(subject, action, resourceType, resource?.id, decision);
  return decision;
}

// Capability/list-mode scope resolution (no specific resource). Not audited (high frequency).
export async function listScope(userId, action, resourceType, env = { now: new Date() }) {
  const subject = await buildSubject(userId);
  const grants = await collectGrants(userId);
  return resolveScope({ grants, action, resourceType, user: subject, env });
}

// Non-auditing dry-run for /admin/explain (Phase 3b).
export async function explain(userId, action, resourceType, resource = null, env = { now: new Date() }) {
  const subject = await buildSubject(userId);
  const grants = await collectGrants(userId);
  const decision = evaluateAccess({ grants, action, resourceType, user: subject, resource, env });
  return { decision, subject, consideredGrants: grants.length };
}
