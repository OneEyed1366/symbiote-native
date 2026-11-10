import { afterEach, beforeEach } from 'vitest';

// Forces `isTTY` off, so a resolver that would prompt has to fall back or fail fast
// If it reached `clack.*` the prompt would hang the runner on a stdin that never answers
export function useNonInteractiveTerminal(): void {
  const originalIsTTY = process.stdin.isTTY;
  const originalUserAgent = process.env.npm_config_user_agent;

  beforeEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: false,
      configurable: true,
    });
    // pnpm sets this for the runner, and `resolvePackageManager` would stop at it
    delete process.env.npm_config_user_agent;
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: originalIsTTY,
      configurable: true,
    });
    if (originalUserAgent !== undefined)
      process.env.npm_config_user_agent = originalUserAgent;
  });
}
