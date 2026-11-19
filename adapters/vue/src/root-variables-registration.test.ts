// An SFC with `:root` custom properties registers them against the one merged condition table

import { describe, expect, it } from 'vitest';
import metroVueTransformer from '../metro-vue-transformer.cjs';

const {
  compileSfc,
}: { compileSfc: (src: string, filename: string) => Promise<string> } =
  metroVueTransformer;

type ICall = { variables: unknown; conditions: unknown };

// Runs the emitted `registerRootVariables(...)` statement with a recorder
function rootCallOf(code: string): ICall | undefined {
  const call = /^registerRootVariables\(.*\);$/m.exec(code)?.[0];
  if (call === undefined) return undefined;
  let seen: ICall | undefined;
  new Function('registerRootVariables', call)(
    (variables: unknown, conditions: unknown) => {
      seen = { variables, conditions };
    },
  );
  return seen;
}

const SCRIPT = '<script setup lang="ts">const label = "x";</script>';
const TEMPLATE = '<template><view class="card" /></template>';

describe('Vue SFC with :root variables', () => {
  it('imports and registers them, whatever the block kind', async () => {
    const code = await compileSfc(
      `${SCRIPT}${TEMPLATE}<style scoped>:root { --gap: 8px } .card { padding: var(--gap) }</style>`,
      'Card.vue',
    );

    expect(code).toContain('registerRootVariables');
    expect(rootCallOf(code)).toEqual({
      variables: [{ name: '--gap', value: '8px' }],
      conditions: undefined,
    });
  });

  it('offsets cond indices so two blocks keep their own conditions', async () => {
    const code = await compileSfc(
      `${SCRIPT}${TEMPLATE}` +
        '<style>@media (min-width: 600px) { :root { --a: 1px } }</style>' +
        '<style>@media (min-width: 900px) { :root { --b: 2px } }</style>',
      'Two.vue',
    );

    expect(rootCallOf(code)).toEqual({
      variables: [
        { name: '--a', value: '1px', cond: 0 },
        { name: '--b', value: '2px', cond: 1 },
      ],
      conditions: [
        ['>=', 'width', 600],
        ['>=', 'width', 900],
      ],
    });
  });

  it('emits no call for a file without them', async () => {
    const code = await compileSfc(
      `${SCRIPT}${TEMPLATE}<style>.card { padding: 4px }</style>`,
      'Plain.vue',
    );

    expect(code).not.toContain('registerRootVariables');
  });
});
