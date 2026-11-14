// A file with `@property` rules hands them to the engine's registry as the module loads
import { describe, expect, it } from 'vitest';
import { compileCssFile } from './index';

// Runs the emitted module with recording hooks, the way the bundle would call them
function propertiesOf(code: string): unknown {
  let seen: unknown;
  const body = code.replace(/^import .*$/m, '');
  new Function('registerRules', 'registerProperties', body)(
    () => {},
    (properties: unknown) => {
      seen = properties;
    },
  );
  return seen;
}

const TOKENS = `
@property --gap { syntax: "<length>"; inherits: false; initial-value: 8px; }
@property --ink { syntax: "<color>"; inherits: true; initial-value: #111; }
.card { padding: var(--gap); color: var(--ink) }
`;

describe('compileCssFile with @property rules', () => {
  it('registers them in source order', async () => {
    const { code } = await compileCssFile(TOKENS, 'tokens.css');

    expect(propertiesOf(code)).toEqual([
      { name: '--gap', syntax: '<length>', inherits: false, initialValue: '8px' },
      { name: '--ink', syntax: '<color>', inherits: true, initialValue: '#111' },
    ]);
  });

  it('imports the registration next to registerRules', async () => {
    const { code } = await compileCssFile(TOKENS, 'tokens.css');

    expect(code.split('\n')[0]).toBe(
      `import { registerRules, registerProperties } from '@symbiote-native/engine';`,
    );
  });

  it('ships the condition table beside a rule inside @media', async () => {
    const css = '@media (min-width: 600px) { @property --gap { syntax: "*"; inherits: true; } }';
    const { code } = await compileCssFile(css, 'wide.css');

    expect(code).toContain(
      'registerProperties([{"name":"--gap","syntax":"*","inherits":true,"cond":0}], [[">=","width",600]]);',
    );
  });

  it('emits no call and no import for a file without @property', async () => {
    const { code } = await compileCssFile('.card { padding: 4px }', 'plain.css');

    expect(propertiesOf(code)).toBeUndefined();
    expect(code).not.toContain('registerProperties');
  });

  it('keeps the call in a .module.css file too', async () => {
    const { code } = await compileCssFile(TOKENS, 'Tokens.module.css');

    expect(propertiesOf(code.replace(/^export default .*$/m, ''))).toHaveLength(2);
  });
});
