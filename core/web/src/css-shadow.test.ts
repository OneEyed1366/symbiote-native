// A shadow is spread over several style keys. The group is read together and written as one
// declaration

import { describe, expect, it } from 'vitest';
import { groupDeclarations } from './css-shadow';

describe('shadow groups', () => {
  it('writes a view shadow from offset, radius and color', () => {
    expect(
      groupDeclarations({
        shadowOpacity: 1,
        shadowColor: 'red',
        shadowOffset: { width: 2, height: 3 },
        shadowRadius: 4,
      }),
    ).toEqual({ 'box-shadow': '2px 3px 4px red' });
  });

  it('writes nothing while the opacity is zero or unset, as iOS paints nothing then', () => {
    expect(groupDeclarations({ shadowColor: 'red', shadowRadius: 4 })).toEqual(
      {},
    );
    expect(groupDeclarations({ shadowOpacity: 0, shadowRadius: 4 })).toEqual(
      {},
    );
  });

  it('defaults to a black shadow with no offset and no blur', () => {
    expect(groupDeclarations({ shadowOpacity: 1 })).toEqual({
      'box-shadow': '0px 0px 0px black',
    });
  });

  it('folds a partial opacity into the color', () => {
    expect(
      groupDeclarations({ shadowOpacity: 0.5, shadowColor: 'red' }),
    ).toEqual({
      'box-shadow': '0px 0px 0px color-mix(in srgb, red 50%, transparent)',
    });
  });

  it('writes a text shadow from its own three keys', () => {
    expect(
      groupDeclarations({
        textShadowColor: 'blue',
        textShadowOffset: { width: 1, height: 2 },
        textShadowRadius: 3,
      }),
    ).toEqual({ 'text-shadow': '1px 2px 3px blue' });
  });

  it('writes no text shadow when none of its keys is set', () => {
    expect(groupDeclarations({ color: 'red' })).toEqual({});
  });
});
