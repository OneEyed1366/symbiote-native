// Proves React's className prop (adapters/react/src/components.ts IViewProps/ITextProps)
// resolves through the SAME shared style registry every adapter's class/className/addClass
// funnels through (routeProp's centralized merge, core/engine/src/node.ts) — the point of
// centralizing it was that React needed zero renderer changes, only the prop type.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerRules } from '@symbiote-native/engine';
import { mount, unmount } from '@symbiote-native/react';
// A RECORDING host, and the assertions read the PAYLOAD rather than a committed node's props. The
// class merge lands in the style slot and is flattened on the way into the payload, so the payload
// is where "the class resolved" becomes visible — a stand-in tree was only somewhere that payload
// had been written down.
import { installRecordingFabric, payloadOf } from '@symbiote-native/test-utils';

const ROOT_TAG = 909;
const fabric = installRecordingFabric();

function probePayload(): Record<string, unknown> {
  const found = fabric.find(node => node.props.testID === 'probe');
  if (found === undefined) throw new Error('no node carries testID "probe"');
  return payloadOf(found.handle);
}

beforeEach(() => fabric.reset());
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

describe('React className prop', () => {
  // Positive only: className/style merging always resolves to a flattened prop set — there is
  // no reject branch (an unregistered class name is a separate, N/A concern — see the report).
  describe('Positive', () => {
    // why: the whole point of centralizing class+style merge in routeProp was that React needed
    // ZERO renderer changes beyond the prop TYPE — this proves className alone, without any
    // React-specific merge code, resolves through the shared registry.
    it('resolves a registered class through the shared style registry', () => {
      registerRules([
        {
          tokens: ['card'],
          specificity: [0, 1, 0],
          order: 0,
          style: { padding: 10 },
        },
      ]);
      mount(ROOT_TAG, <view testID="probe" className="card" />);

      expect(probePayload().padding).toBe(10);
    });

    // why: CSS cascade order (later/more-specific wins) does not apply here — an inline `style`
    // prop is the AUTHOR'S explicit override and must always beat a class-derived value, matching
    // every other adapter's className/class precedence rule.
    it('lets an explicit style prop win over the className-derived one', () => {
      registerRules([
        {
          tokens: ['card'],
          specificity: [0, 1, 0],
          order: 0,
          style: { padding: 10, backgroundColor: 'red' },
        },
      ]);
      mount(
        ROOT_TAG,
        <view
          testID="probe"
          className="card"
          style={{ backgroundColor: 'blue' }}
        />,
      );

      expect(probePayload()).toMatchObject({
        padding: 10,
        backgroundColor: 'blue',
      });
    });
  });
});
