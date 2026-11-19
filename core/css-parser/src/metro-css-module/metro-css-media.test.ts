// The emitted module hands the engine each rule's `cond` index and the shared conditions table

import { describe, expect, it } from 'vitest';
import { compileCssFile } from './index';

type IRegistration = { rules: unknown; conditions: unknown };

// Runs the emitted module with a recording `registerRules`, the way the bundle would call it
function registrationOf(code: string): IRegistration {
  const seen: IRegistration = { rules: undefined, conditions: undefined };
  const body = code.replace(/^import .*$/m, '');
  new Function('registerRules', body)((rules: unknown, conditions: unknown) => {
    seen.rules = rules;
    seen.conditions = conditions;
  });
  return seen;
}

const WIDE_CARD = `
.card { padding: 4px }
@media (min-width: 600px) { .card { padding: 16px } }
`;

describe('compileCssFile with @media', () => {
  it('ships the condition table and a cond index on the conditional rule', async () => {
    const { code } = await compileCssFile(WIDE_CARD, 'card.css');
    const { rules, conditions } = registrationOf(code);

    expect(conditions).toEqual([['>=', 'width', 600]]);
    expect(rules).toEqual([
      expect.not.objectContaining({ cond: expect.anything() }),
      expect.objectContaining({ cond: 0, style: { padding: 16 } }),
    ]);
  });

  it('passes no table when the file has no @media', async () => {
    const { code } = await compileCssFile(
      '.card { padding: 4px }',
      'plain.css',
    );

    expect(registrationOf(code).conditions).toBeUndefined();
  });

  it('keeps the condition table in a .module.css file too', async () => {
    const { code } = await compileCssFile(WIDE_CARD, 'Card.module.css');

    expect(
      registrationOf(code.replace(/^export default .*$/m, '')).conditions,
    ).toEqual([['>=', 'width', 600]]);
  });
});
