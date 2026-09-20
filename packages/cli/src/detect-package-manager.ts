import type { IPackageManager } from './types.js';

// Same trick create-vue/create-vite use: `npm create x` / `pnpm create x` / `yarn create x`
// all set npm_config_user_agent to the invoking package manager's own name before running
// the bin, so the choice can be inferred without asking when the user already told us by
// how they invoked the command.
const USER_AGENT_PREFIXES: ReadonlyArray<readonly [string, IPackageManager]> = [
  ['pnpm', 'pnpm'],
  ['yarn', 'yarn'],
  ['npm', 'npm'],
];

export function detectPackageManagerFromUserAgent(
  userAgent = process.env.npm_config_user_agent,
): IPackageManager | undefined {
  if (userAgent === undefined) return undefined;
  const match = USER_AGENT_PREFIXES.find(([prefix]) =>
    userAgent.startsWith(prefix),
  );
  return match?.[1];
}
