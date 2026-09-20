// A style value React Native refuses must leave the view at its default — proven on the view.
//
// This started as a migration of `core/engine/src/__tests__/processor-undefined-is-absent.test.ts`
// and the migration FAILED, which is the useful part. That file asks whether a refused prop reaches
// the payload as an explicit `undefined` or as no key at all. `transformOrigin` is not in
// `getDebugProps`'s hand-written selection, so it is absent here whatever happens and the question
// cannot be asked on this side at all — three of its four cases went green for that reason and the
// control went red, which is exactly what a control is for.
//
// The line that fell out of it: what the engine SENDS is a question for `fabricProps`, which ships
// and can be called directly — that is not a model of anything and belongs in vitest. What the
// PLATFORM ended up holding is a question for here. The file keeps the second half, on two props
// the read-back does cover.
//
// `nativeID` on every node because Fabric flattens a view with no reason to exist, and a flattened
// view has no props to read (`mounted-tree.cpp`).

import {
  createElement,
  createSurface,
  routeProp,
  setProp,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, report } from './harness';

function commitStyle(style: Record<string, unknown>): Record<string, string> {
  const surface = createSurface(1);
  const node = createElement('RCTView');
  setProp(node, 'nativeID', 'subject');
  routeProp(node, 'style', style);
  surface.appendChild(node);
  surface.commit();
  return mounted().children[0].props;
}

describe('a value the renderer refuses leaves the view at its default', () => {
  // why: the control, and it goes first. Without a value that DOES arrive, every assertion below
  // could be passing because nothing was read at all.
  it('takes an opacity it accepts', () => {
    expect(commitStyle({ opacity: 0.5 }).opacity).toBe('0.5');
  });

  // why: `opacity` is a float prop and a string is not one. What must not happen is a view left
  // holding some coerced value; it must stand at the default, which is absence from this report.
  it('refuses an opacity that is not a number', () => {
    expect(Object.hasOwn(commitStyle({ opacity: 'half' }), 'opacity')).toBe(
      false,
    );
  });

  // why: the same rule through a different processor, so this is about refusal rather than one
  // prop's quirk. A colour the parser cannot read must not paint.
  it('refuses a colour it cannot parse', () => {
    expect(
      Object.hasOwn(
        commitStyle({ backgroundColor: 'not-a-colour' }),
        'backgroundColor',
      ),
    ).toBe(false);
  });

  // why: the colour control. Proves the key appears when the value is real, so the assertion above
  // is measuring refusal and not a gap in what this harness can see.
  it('takes a colour it can parse', () => {
    expect(
      Object.hasOwn(
        commitStyle({ backgroundColor: '#ff0000' }),
        'backgroundColor',
      ),
    ).toBe(true);
  });
});

report();
