import { describe, it, expect } from 'vitest';
import { computeParamsHash, computeDedupHash } from './hash';

describe('computeParamsHash', () => {
  it('is deterministic with same input', () => {
    const params = { a: 1, b: 'hello', c: true };
    expect(computeParamsHash(params)).toBe(computeParamsHash(params));
  });

  it('produces different hash for different params', () => {
    expect(computeParamsHash({ a: 1 })).not.toBe(computeParamsHash({ a: 2 }));
  });

  it('is order-independent (canonical key sort)', () => {
    const p1 = { z: 1, a: 2, m: 3 };
    const p2 = { a: 2, m: 3, z: 1 };
    expect(computeParamsHash(p1)).toBe(computeParamsHash(p2));
  });

  it('handles nested objects canonically', () => {
    const p1 = { outer: { z: 1, a: 2 } };
    const p2 = { outer: { a: 2, z: 1 } };
    expect(computeParamsHash(p1)).toBe(computeParamsHash(p2));
  });
});

describe('computeDedupHash', () => {
  const base = ['tenant1', 'user1', 'PDF', 'tpl-001', 'abc123'] as const;

  it('is deterministic', () => {
    expect(computeDedupHash(...base)).toBe(computeDedupHash(...base));
  });

  it('changes if tenantId changes', () => {
    const [, ...rest] = base;
    expect(computeDedupHash('tenant2', ...rest)).not.toBe(
      computeDedupHash(...base),
    );
  });

  it('changes if format changes', () => {
    const [t, u, , tpl, ph] = base;
    expect(computeDedupHash(t, u, 'CSV', tpl, ph)).not.toBe(
      computeDedupHash(...base),
    );
  });

  it('changes if paramsHash changes', () => {
    const [t, u, f, tpl] = base;
    expect(computeDedupHash(t, u, f, tpl, 'different')).not.toBe(
      computeDedupHash(...base),
    );
  });
});
