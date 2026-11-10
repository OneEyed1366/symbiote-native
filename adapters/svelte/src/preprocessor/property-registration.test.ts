// A Svelte `<style>` with `@property` rules registers them with the engine as the module loads

import { describe, expect, it } from 'vitest';
import { scopedStyles } from './scoped-styles';

const preprocess = scopedStyles();
const FILENAME = '/repo/src/Card.svelte';
const GAP = '@property --gap { syntax: "<length>"; inherits: false; initial-value: 8px; }';

async function run(source: string): Promise<string> {
  const { code } = await preprocess.markup({ content: source, filename: FILENAME });
  return code;
}

describe('scopedStyles with @property rules', () => {
  it('imports and calls the registration next to the rules', async () => {
    const code = await run(`<View class="card" />\n<style>${GAP} .card { padding: var(--gap); }</style>\n`);

    expect(code).toContain('registerProperties as __symbioteRegisterProperties');
    expect(code).toContain(
      '__symbioteRegisterProperties([{"name":"--gap","syntax":"<length>","inherits":false,"initialValue":"8px"}]);',
    );
  });

  it('ships the condition table beside a rule inside @media', async () => {
    const code = await run(
      '<View />\n<style>@media (min-width: 600px) { @property --gap { syntax: "*"; inherits: true; } }</style>\n',
    );

    expect(code).toContain(
      '__symbioteRegisterProperties([{"name":"--gap","syntax":"*","inherits":true,"cond":0}], [[">=","width",600]]);',
    );
  });

  it('registers a file whose only content is @property', async () => {
    const code = await run(`<View />\n<style>${GAP}</style>\n`);

    expect(code).toContain('__symbioteRegisterProperties(');
  });

  it('emits nothing for a file without @property', async () => {
    const code = await run('<View class="card" />\n<style>.card { padding: 4px; }</style>\n');

    expect(code).not.toContain('RegisterProperties');
  });
});
