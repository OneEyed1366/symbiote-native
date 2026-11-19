// An SFC with `@media` registers conditional rules with an index into one merged condition table

import { describe, expect, it } from 'vitest';
import metroVueTransformer from '../metro-vue-transformer.cjs';

const {
  compileSfc,
}: { compileSfc: (src: string, filename: string) => Promise<string> } =
  metroVueTransformer;

type IRegistration = { rules: unknown; conditions: unknown };

// Runs the emitted `registerRules(...)` statement with a recorder, the way the bundle calls it
function registrationOf(code: string): IRegistration {
  const call = /^registerRules\(.*\);$/m.exec(code)?.[0];
  if (call === undefined)
    throw new Error('no registerRules(...) statement emitted');
  const seen: IRegistration = { rules: undefined, conditions: undefined };
  new Function('registerRules', call)((rules: unknown, conditions: unknown) => {
    seen.rules = rules;
    seen.conditions = conditions;
  });
  return seen;
}

const SCRIPT = '<script setup lang="ts">const label = "x";</script>';
const TEMPLATE = '<template><view class="card" /></template>';

describe('Vue SFC with @media', () => {
  it('ships the table and the cond index for a scoped block', async () => {
    const code = await compileSfc(
      `${SCRIPT}${TEMPLATE}<style scoped>.card { padding: 4px } @media (min-width: 600px) { .card { padding: 16px } }</style>`,
      'Card.vue',
    );
    const { rules, conditions } = registrationOf(code);

    expect(conditions).toEqual([['>=', 'width', 600]]);
    expect(rules).toEqual([
      expect.not.objectContaining({ cond: expect.anything() }),
      expect.objectContaining({ cond: 0, style: { padding: 16 } }),
    ]);
  });

  it('offsets cond indices so two blocks keep their own conditions', async () => {
    const code = await compileSfc(
      `${SCRIPT}${TEMPLATE}` +
        '<style>@media (min-width: 600px) { .a { margin: 1px } }</style>' +
        '<style>@media (min-width: 900px) { .b { margin: 2px } }</style>',
      'Two.vue',
    );
    const { rules, conditions } = registrationOf(code);

    expect(conditions).toEqual([
      ['>=', 'width', 600],
      ['>=', 'width', 900],
    ]);
    expect(rules).toEqual([
      expect.objectContaining({ tokens: ['a'], cond: 0 }),
      expect.objectContaining({ tokens: ['b'], cond: 1 }),
    ]);
  });

  it('passes no table for a file without @media', async () => {
    const code = await compileSfc(
      `${SCRIPT}${TEMPLATE}<style>.card { padding: 4px }</style>`,
      'Plain.vue',
    );

    expect(registrationOf(code).conditions).toBeUndefined();
  });
});
