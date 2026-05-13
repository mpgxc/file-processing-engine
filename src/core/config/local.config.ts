import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export function applyLocalConfig(): void {
  const templatesMountPath = resolve('./fixtures/templates');
  const outputsMountPath = resolve('./fixtures/outputs');

  process.env['TEMPLATES_MOUNT_PATH'] = templatesMountPath;
  process.env['OUTPUTS_MOUNT_PATH'] = outputsMountPath;

  mkdirSync(templatesMountPath, { recursive: true });
  mkdirSync(outputsMountPath, { recursive: true });
}
