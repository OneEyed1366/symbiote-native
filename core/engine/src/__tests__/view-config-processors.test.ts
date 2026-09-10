// A third-party view's own prop processors — `validAttributes[*].process` off its ViewConfig —
// have to reach the payload without anybody editing the engine, and specifically without anybody
// editing C++.
//
// WHY THE FOLD AND NOT `fabricProps`. On a device the payload is built by
// `core/engine/cpp/SymbioteFabricProps.cpp`, and it cannot read this registry: the registry holds
// JS closures, populated lazily from an injected `ReactNativeViewConfigRegistry` lookup. What the
// C++ CAN do is call one JS function per node — `payloadFold`, which it probes once and caches. So
// the processors are installed there, at `createElement`, and the device gets the same answer this
// file asserts. Before that they lived inside `fabricProps`, where the C++ half never saw them, and
// the cost was `@symbiote-native/slider` committing its track tints as CSS STRINGS: iOS answers a
// string colour with `clearColor()`, so the slider dragged correctly with no track drawn at all.
//
// The one thing no test here can prove is that the C++ agrees — there is no C++ harness in this
// repo. What it CAN pin is that the processors live on the seam C++ reads, which is the property
// that was missing.

import { describe, expect, it, beforeEach } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import {
  createElement,
  registerComponent,
  registerHostBehavior,
  setProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { fabricProps } from '../fabric-props';

installFabric();

// Not a real Fabric name on purpose: a built-in short-circuits the registry to EMPTY, so a case
// written on `RCTView` would assert nothing.
const THIRD_PARTY = 'RNCTestSlider';
const TINT = 'minimumTrackTintColor';

// Stands in for `processColor` — the shape that matters is that it is the COMPONENT's own function
// and that it converts, not what it converts to.
const PROCESSED = 0xff112233;
let calls: string[] = [];

beforeEach(() => {
  calls = [];
  registerComponent(THIRD_PARTY, {
    processors: {
      [TINT]: value => {
        calls.push(String(value));
        return PROCESSED;
      },
    },
  });
});

function payloadOf(
  node: ISymbioteNode,
  bag: Record<string, unknown>,
): Record<string, unknown> {
  return fabricProps(node, bag);
}

describe('Positive', () => {
  // why: THE BUG. A prop the engine has no built-in knowledge of reaches the payload converted,
  // because the component's own ViewConfig said how — no name list anywhere in the engine.
  it("applies a component's own processor to a prop the engine never heard of", () => {
    const node = createElement(THIRD_PARTY);
    setProp(node, TINT, '#112233');

    expect(payloadOf(node, { [TINT]: '#112233' })[TINT]).toBe(PROCESSED);
    expect(calls).toEqual(['#112233']);
  });

  // why: converting twice is not a no-op — `processColor` shifts its input, so a colour run through
  // it a second time comes out a DIFFERENT colour. The fold is the only place these may run.
  it('runs the processor exactly once per payload build', () => {
    const node = createElement(THIRD_PARTY);
    payloadOf(node, { [TINT]: '#112233' });

    expect(calls).toHaveLength(1);
  });

  // why: `node.props` is the live bag every other fold hands back by identity, and a component
  // whose config declares processors for props this node never sets must not allocate a copy.
  it('returns the bag by identity when no declared prop is present', () => {
    const node = createElement(THIRD_PARTY);
    const fold = node.payloadFold;
    const bag = { testID: 'probe' };

    expect(fold).toBeDefined();
    expect(fold?.(bag)).toBe(bag);
  });

  // why: one component can have both a lowered primitive's behavior fold and its own ViewConfig
  // processors. The reference ran the behavior first and the processors over what it produced.
  it('composes with a behavior fold, behavior first', () => {
    registerHostBehavior(THIRD_PARTY, {
      attach: () => {},
      detach: () => {},
      foldPayload: props => ({ ...props, [TINT]: '#445566' }),
    });
    const node = createElement(THIRD_PARTY);

    expect(payloadOf(node, {})[TINT]).toBe(PROCESSED);
    expect(calls, 'the processor saw what the behavior wrote').toEqual([
      '#445566',
    ]);
  });
});

describe('Negative', () => {
  // why: a fold on every node would be a per-node JS call the C++ has to make on the whole tree.
  // Built-ins short-circuit the registry, so they must carry none.
  it('installs no fold on a built-in component', () => {
    expect(createElement('RCTView').payloadFold).toBeUndefined();
  });

  // why: the probe that says this suite tests a live seam. Take the registration away and the same
  // prop must arrive raw — otherwise something else is converting it and these cases prove nothing.
  it('leaves the prop untouched for a component that declares no processor', () => {
    const node = createElement('RNCUnregisteredView');

    expect(payloadOf(node, { [TINT]: '#112233' })[TINT]).toBe('#112233');
    expect(calls).toEqual([]);
  });
});
