import { createHash } from 'node:crypto';

function sortKeys(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.keys(obj)
      .sort()
      .map((k) => {
        const val = obj[k];
        if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
          return [k, sortKeys(val as Record<string, unknown>)];
        }
        return [k, val];
      }),
  );
}

export function computeParamsHash(params: Record<string, unknown>): string {
  const canonical = JSON.stringify(sortKeys(params));
  return createHash('sha256').update(canonical).digest('hex');
}

export function computeDedupHash(
  tenantId: string,
  userId: string,
  format: string,
  templateId: string,
  paramsHash: string,
): string {
  const input = [tenantId, userId, format, templateId, paramsHash].join('|');
  return createHash('sha256').update(input).digest('hex');
}
