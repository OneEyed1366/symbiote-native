// A throw inside a microtask must reach the log, as Svelte runs its effects in one
// Without it a component that fails during an update vanishes and its test can pass on nothing

import { describe, expect, it, report } from './harness';
import { tick } from './svelte-leak-steps';

describe('a microtask that throws', () => {
  it('reports the error instead of dropping it', async () => {
    const reported: string[] = [];
    const printError = console.error;
    console.error = (...parts: unknown[]): void => {
      reported.push(parts.join(' '));
    };

    queueMicrotask(() => {
      throw new Error('boom in a microtask');
    });
    await tick();
    await tick();
    console.error = printError;

    expect(reported.join('\n')).toContain('boom in a microtask');
  });
});

report();
