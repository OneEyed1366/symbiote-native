import type { IPackageManager } from './types.js';

// Mirrors create-vue's utils/getCommand.ts. Printed in the outro, never spawned — see
// packages/cli/README.md's "Design decisions" section for why install stays a
// printed instruction rather than an automatic child_process call.
export function getCommand(
  packageManager: IPackageManager,
  script: 'install' | 'dev',
): string {
  if (script === 'install') {
    return packageManager === 'yarn' ? 'yarn' : `${packageManager} install`;
  }
  return packageManager === 'npm'
    ? `npm run ${script}`
    : `${packageManager} ${script}`;
}
