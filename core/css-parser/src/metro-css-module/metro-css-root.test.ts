// A file with `:root` custom properties hands them to the engine with their own condition table
import { describe, expect, it } from 'vitest';
import { compileCssFile } from './index';

type ICall = { variables: unknown; conditions: unknown };

// Runs the emitted module with recording hooks, the way the bundle would call them
function rootCallOf(code: string): ICall | undefined {
  let seen: ICall | undefined;
  const body = code.replace(/^import .*$/m, '');
  new Function('registerRules', 'registerRootVariables', body)(
    () => {},
    (variables: unknown, conditions: unknown) => {
      seen = { variables, conditions };
    },
  );
  return seen;
}

const TOKENS = `
:root { --gap: 8px; --ink: #111 }
@media (prefers-color-scheme: dark) { :root { --ink: #eee } }
.card { padding: var(--gap); color: var(--ink) }
`;

describe('compileCssFile with :root variables', () => {
  it('registers them in source order with the condition of an enclosing @media', async () => {
    const { code } = await compileCssFile(TOKENS, 'tokens.css');

    expect(rootCallOf(code)).toEqual({
      variables: [
        { name: '--gap', value: '8px' },
        { name: '--ink', value: '#111' },
        { name: '--ink', value: '#eee', cond: 0 },
      ],
      conditions: [['=', 'prefers-color-scheme', 'dark']],
    });
  });

  it('imports the registration next to registerRules', async () => {
    const { code } = await compileCssFile(TOKENS, 'tokens.css');

    expect(code.split('\n')[0]).toBe(
      `import { registerRules, registerRootVariables } from '@symbiote-native/engine';`,
    );
  });

  it('emits no call and no import for a file without :root variables', async () => {
    const { code } = await compileCssFile(
      '.card { padding: 4px }',
      'plain.css',
    );

    expect(rootCallOf(code)).toBeUndefined();
    expect(code).not.toContain('registerRootVariables');
  });

  it('keeps the call in a .module.css file too', async () => {
    const { code } = await compileCssFile(TOKENS, 'Tokens.module.css');

    expect(
      rootCallOf(code.replace(/^export default .*$/m, ''))?.variables,
    ).toHaveLength(3);
  });
});
