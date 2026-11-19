// An SFC with `@property` rules registers them with the engine as the module loads

import { describe, expect, it } from 'vitest';
import metroVueTransformer from '../metro-vue-transformer.cjs';

const {
  compileSfc,
}: { compileSfc: (src: string, filename: string) => Promise<string> } =
  metroVueTransformer;

// Runs the emitted `registerProperties(...)` statement with a recorder
function propertiesOf(code: string): unknown {
  const call = /^registerProperties\(.*\);$/m.exec(code)?.[0];
  if (call === undefined) return undefined;
  let seen: unknown;
  new Function('registerProperties', call)((properties: unknown) => {
    seen = properties;
  });
  return seen;
}

const SCRIPT = '<script setup lang="ts">const label = "x";</script>';
const TEMPLATE = '<template><view class="card" /></template>';
const GAP =
  '@property --gap { syntax: "<length>"; inherits: false; initial-value: 8px; }';
const INK =
  '@property --ink { syntax: "<color>"; inherits: true; initial-value: #111; }';

describe('Vue SFC with @property rules', () => {
  it('imports and registers them, whatever the block kind', async () => {
    const code = await compileSfc(
      `${SCRIPT}${TEMPLATE}<style scoped>${GAP} .card { padding: var(--gap) }</style>`,
      'Card.vue',
    );

    expect(code).toContain('registerProperties');
    expect(propertiesOf(code)).toEqual([
      {
        name: '--gap',
        syntax: '<length>',
        inherits: false,
        initialValue: '8px',
      },
    ]);
  });

  it('keeps the rules of every block in source order', async () => {
    const code = await compileSfc(
      `${SCRIPT}${TEMPLATE}<style>${GAP}</style><style module>${INK}</style>`,
      'Two.vue',
    );

    expect(propertiesOf(code)).toEqual([
      {
        name: '--gap',
        syntax: '<length>',
        inherits: false,
        initialValue: '8px',
      },
      {
        name: '--ink',
        syntax: '<color>',
        inherits: true,
        initialValue: '#111',
      },
    ]);
  });

  it('offsets cond indices so two blocks keep their own conditions', async () => {
    const code = await compileSfc(
      `${SCRIPT}${TEMPLATE}` +
        '<style>@media (min-width: 600px) { @property --a { syntax: "*"; inherits: true; } }</style>' +
        '<style>@media (min-width: 900px) { @property --b { syntax: "*"; inherits: true; } }</style>',
      'Wide.vue',
    );

    expect(code).toContain(
      'registerProperties([{"name":"--a","syntax":"*","inherits":true,"cond":0},' +
        '{"name":"--b","syntax":"*","inherits":true,"cond":1}], [[">=","width",600],[">=","width",900]]);',
    );
  });

  it('registers a file whose only content is @property', async () => {
    const code = await compileSfc(
      `${SCRIPT}${TEMPLATE}<style>${GAP}</style>`,
      'Only.vue',
    );

    expect(propertiesOf(code)).toHaveLength(1);
  });

  it('emits no call for a file without them', async () => {
    const code = await compileSfc(
      `${SCRIPT}${TEMPLATE}<style>.card { padding: 4px }</style>`,
      'Plain.vue',
    );

    expect(code).not.toContain('registerProperties');
  });
});
