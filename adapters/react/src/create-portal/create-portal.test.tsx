// Proves createPortal (create-portal.ts): content portals into an already-mounted host node
// OUTSIDE its own JSX position (same surface), and the guard rejects a target that isn't a real,
// mounted host node — the exact "don't let a dev corrupt the tree" case this exists to prevent.

import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createPortal,
  mount,
  unmount,
  type IHostInstance,
} from '@symbiote-native/react';
import { childrenOf } from '@symbiote-native/engine';
import {
  installRecordingFabric,
  type IAuthoredNode,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 150;

const fabric = installRecordingFabric();
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function findText(text: string): IAuthoredNode | undefined {
  return fabric.find(
    node => node.viewName === 'RCTRawText' && node.props.text === text,
  );
}

function App(): React.ReactElement {
  // A ref callback (not useRef) so setOverlay fires during commit and schedules the re-render
  // that resolves the portal target — a ref's `.current` is null for the whole FIRST render.
  const [overlay, setOverlay] = useState<IHostInstance | null>(null);
  return (
    <view>
      <text testID="source">
        {overlay ? createPortal(<text>ported in</text>, overlay) : null}
      </text>
      <view testID="overlay-host" ref={setOverlay} />
    </view>
  );
}

describe('createPortal', () => {
  it('renders content under the target node, not its own JSX position', () => {
    mount(ROOT_TAG, <App />);

    const ported = findText('ported in');
    expect(ported, '"ported in" text was committed').toBeDefined();

    const overlayHost = fabric.find(n => n.props.testID === 'overlay-host');
    expect(overlayHost, 'overlay host View was created').toBeDefined();
    if (overlayHost === undefined || ported === undefined)
      throw new Error('unreachable');

    const sourceText = fabric.find(n => n.props.testID === 'source');
    expect(sourceText, 'source Text was created').toBeDefined();
    if (sourceText === undefined) throw new Error('unreachable');

    // Parentage read off the engine's own child links — a portal moves a node between parents,
    // which is precisely a fact about the tree the engine holds.
    function isDescendantOf(root: object, target: object): boolean {
      if (root === target) return true;
      return childrenOf(root).some(child => isDescendantOf(child, target));
    }

    expect(
      isDescendantOf(overlayHost.handle, ported.handle),
      'portal landed under the overlay host',
    ).toBe(true);
    expect(
      isDescendantOf(sourceText.handle, ported.handle),
      'portal did NOT stay under its own JSX <text> parent',
    ).toBe(false);
  });

  it('throws a clear error for a non-host-node target instead of corrupting the tree', () => {
    // JSON.parse returns `any`, the honest way to hand createPortal a value TypeScript's own
    // signature would normally reject — exactly the "a JS consumer / bad ref" case being guarded.
    const plainObject = JSON.parse('{}');
    const selectorString = JSON.parse('"body"');
    expect(() => createPortal(<text>x</text>, plainObject)).toThrow(
      /already-mounted host node/,
    );
    expect(() => createPortal(<text>x</text>, selectorString)).toThrow(
      /already-mounted host node/,
    );
  });
});
