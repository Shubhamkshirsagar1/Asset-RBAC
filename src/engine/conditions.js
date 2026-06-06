import { getPath, resolveOperand, operators } from './operators.js';

// Evaluates a condition object against ctx { user, resource, env }.
// Each entry is path -> { op: operand }; all entries must hold (AND).
export function evaluateCondition(condition, ctx) {
  if (!condition) return true;
  for (const [path, test] of Object.entries(condition)) {
    const actual = getPath(ctx, path);
    for (const [op, rawOperand] of Object.entries(test)) {
      const fn = operators[op];
      if (!fn) throw new Error(`Unknown operator: ${op}`);
      const operand = resolveOperand(rawOperand, ctx);
      if (!fn(actual, operand, ctx)) return false;
    }
  }
  return true;
}
