// AnimatedValue through the clone-on-write commit (integration): proof that a JS-driven value
// actually reaches a committed Fabric prop via the engine's clone-on-write path (setNativeProps ->
// completeRoot).
//
// SPLIT: AnimatedValue's own public API (setValue/setOffset/flattenOffset/extractOffset/animate/
// stopAnimation/resetAnimation), independent of Fabric, moved to animated-value-api.test.ts, which
// needs no host at all.
//
// ON installRecordingFabric() — this used to stay on installFabric because `setNativeProps`'s
// TARGETED commit path (`PropLeaf.update()` drives its prop through it) reads
// `committedRecordOf(node).rootTag`, and the recording host used to hardcode every node's
// `rootTag` to the same `NO_TAG` sentinel it uses for a native Fabric TAG — a real bug, not an
// inherent limitation: `rootTag` is a JS-level surface identifier the app chose
// (`createSurface(rootTag)`), present on the op stream from the start (`OP_COMMIT`'s own slot `a`),
// nothing native about it. Fixed in `recording-host.ts` (`committedSurfaceRootTags`).

import { beforeAll, describe, expect, it } from 'vitest';
import {
  AnimatedNode,
  AnimatedValue,
  createElement,
  createSurface,
  getNativeTag,
  setNativeProps,
  setProp,
  type AnimatedInterpolation,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { installRecordingFabric, payloadOf } from '@symbiote-native/test-utils';

const fabric = installRecordingFabric();

// The leaf that pushes a frame's value onto the view. In the adapter this is AnimatedProps wired
// to the host instance; here it is the minimal shape: pull the source value, setNativeProps it.
class PropLeaf extends AnimatedNode {
  constructor(
    private readonly source: AnimatedInterpolation,
    private readonly target: ISymbioteNode,
    private readonly key: string,
  ) {
    super();
  }
  update(): void {
    setNativeProps(this.target, { [this.key]: this.source.__getValue() });
  }
}

const ROOT_TAG = 41;

const value = new AnimatedValue(0);
// Non-identity mapping so the assertion proves interpolation, not passthrough.
const width = value.interpolate({ inputRange: [0, 1], outputRange: [0, 100] });
const view = createElement('RCTView');

beforeAll(() => {
  const surface = createSurface(ROOT_TAG);
  setProp(view, 'width', width.__getValue()); // initial frame: 0
  surface.appendChild(view);
  surface.commit();

  // Wire the leaf into the graph: adding it to the interpolation attaches the interpolation to
  // the value, so a setValue flushes value -> width -> leaf.
  const leaf = new PropLeaf(width, view, 'width');
  width.__addChild(leaf);
});

describe('AnimatedValue through the clone-on-write commit (integration)', () => {
  it('commits the app view under a box-none AppContainer with the initial interpolated width', () => {
    expect(fabric.find(node => node.handle === view)?.viewName).toBe('RCTView');
    expect(payloadOf(view).width).toBe(0);
  });

  it('exposes a native tag on the committed node for the native driver', () => {
    expect(getNativeTag(view)).toBeDefined();
  });

  // why: a JS value drive must recommit through the SAME node identity (clone-on-write), never
  // a brand-new tree, so the leaf's props land in exactly one completeRoot per setValue.
  // The awaits below are the coalesced setNativeProps flush: a drive queues its write and the
  // queue publishes at the microtask boundary (commit.ts, flushNativeProps). One await is enough —
  // the flush is queued before it.
  it('setValue(0.5) interpolates to width 50 in exactly one completeRoot', async () => {
    const commitsBefore = fabric.commits;
    value.setValue(0.5);
    await Promise.resolve();
    expect(payloadOf(view).width).toBe(50);
    expect(fabric.commits).toBe(commitsBefore + 1);
  });

  it('setValue(1) interpolates to width 100', async () => {
    value.setValue(1);
    await Promise.resolve();
    expect(payloadOf(view).width).toBe(100);
  });

  // why: a plain listener (e.g. an app reading scroll position) must see the RAW driving
  // value, while a bound prop leaf sees the value AFTER interpolation — the graph fans the
  // same setValue out to both representations independently.
  it('drives listeners with the raw value while the leaf gets the interpolated value', async () => {
    let observed = -1;
    value.addListener(({ value: v }) => {
      observed = v;
    });
    value.setValue(0.25);
    // The listener is synchronous and the committed prop is not — the two halves of this test sit
    // on opposite sides of the flush boundary deliberately.
    expect(observed).toBe(0.25);
    await Promise.resolve();
    expect(payloadOf(view).width).toBe(25);
  });
});
