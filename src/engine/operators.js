export function getPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

// A string starting with `$` is a ref into ctx (minus the `$`); everything else is a literal.
export function resolveOperand(operand, ctx) {
  if (typeof operand === 'string' && operand.startsWith('$')) {
    return getPath(ctx, operand.slice(1));
  }
  return operand;
}

function hhmm(date) {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}
function parseHHMM(s) {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

export const operators = {
  eq: (a, b) => a === b,
  ne: (a, b) => a !== b,
  lt: (a, b) => a < b,
  lte: (a, b) => a <= b,
  gt: (a, b) => a > b,
  gte: (a, b) => a >= b,
  in: (a, b) => Array.isArray(b) && b.includes(a),
  nin: (a, b) => Array.isArray(b) && !b.includes(a),
  exists: (a, b) => (b ? a != null : a == null),
  statusIs: (a, b) => (Array.isArray(b) ? b.includes(a) : a === b),
  owner: (a, _b, ctx) => a === ctx.user?.id,
  deptMember: (a, _b, ctx) =>
    Array.isArray(ctx.user?.departmentIds) && ctx.user.departmentIds.includes(a),
  timeWindow: (a, window) => {
    if (!(a instanceof Date) || !window) return false;
    const t = hhmm(a);
    return t >= parseHHMM(window.start) && t <= parseHHMM(window.end);
  },
};
