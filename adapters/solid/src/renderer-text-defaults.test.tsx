// RN's two Text defaults on the LOWERED path. The <Text> wrapper folds them with resolveTextProps;
// a file compiled through babel-lower-host-primitives.cjs has no wrapper, so the renderer has to
// seed them. Vue's twin is adapters/vue/src/renderer/renderer.test.ts.
//
// Both failures here are device-only and silent: a numberOfLines={1} line clips mid-word with no
// ellipsis, and every headless assertion about the tree still passes. The re-seed case in
// particular cannot be caught by create-time seeding alone — it needs a framework to CLEAR a prop
// it set earlier, which is why it has its own test rather than riding on the first one.

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from './render';

const ROOT_TAG = 9_488;
const TEXT_VIEW = 'RCTText';

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// Reads fabric.committed, never fabric.created/find: a created node's props are frozen at its
// first commit, so an update assertion off `created` passes forever (symbiote-engine-core §8).
function committedTextProps(): Record<string, unknown> | undefined {
  let found: Record<string, unknown> | undefined;
  const walk = (nodes: IFakeNode[]): void => {
    for (const node of nodes) {
      if (node.viewName === TEXT_VIEW && found === undefined)
        found = node.props;
      walk(node.children);
    }
  };
  walk(fabric.committed);
  return found;
}

describe('lowered symbiote-text carries RN’s Text defaults', () => {
  it('seeds ellipsizeMode and allowFontScaling at create', async () => {
    mount(ROOT_TAG, () => (
      <symbiote-view>
        <symbiote-text numberOfLines={1}>clipped</symbiote-text>
      </symbiote-view>
    ));
    await tick();
    const props = committedTextProps();
    expect(props?.ellipsizeMode).toBe('tail');
    expect(props?.allowFontScaling).toBe(true);
  });

  it('lets an explicit value beat the default', async () => {
    mount(ROOT_TAG, () => (
      <symbiote-view>
        <symbiote-text ellipsizeMode="clip" allowFontScaling={false}>
          x
        </symbiote-text>
      </symbiote-view>
    ));
    await tick();
    const props = committedTextProps();
    expect(props?.ellipsizeMode).toBe('clip');
    expect(props?.allowFontScaling).toBe(false);
  });

  // why: THE case create-time seeding cannot cover. Solid re-runs setProp when the accessor's value
  // changes, so a prop that goes back to `undefined` is an explicit clear — and RN treats a missing
  // prop and an explicit undefined alike, so the default has to come BACK rather than stay cleared.
  it('re-seeds the default when a set value is later cleared', async () => {
    const [mode, setMode] = createSignal<string | undefined>('clip');
    mount(ROOT_TAG, () => (
      <symbiote-view>
        <symbiote-text ellipsizeMode={mode()}>x</symbiote-text>
      </symbiote-view>
    ));
    await tick();
    expect(committedTextProps()?.ellipsizeMode).toBe('clip');

    // Not redundant with the line below — it is the harness canary. Prop-level reactivity on an
    // intrinsic was DEAD in this repo's vitest solid project until 2026-08-23 (two solid-js builds
    // loaded at once, so signals and the renderer's effects lived in different runtimes; see
    // vitest.config.ts's SOLID_TRANSFORM). With it dead, the re-seed assertion below passes for the
    // wrong reason: nothing updates, so nothing clears. This step fails first and says so.
    setMode('head');
    await tick();
    expect(committedTextProps()?.ellipsizeMode, 'defined -> defined').toBe(
      'head',
    );

    setMode(undefined);
    await tick();
    expect(committedTextProps()?.ellipsizeMode).toBe('tail');
  });

  // why: the seed is keyed on the node being a TEXT container, not on the prop name — a View that
  // happens to be handed `ellipsizeMode` must not acquire text semantics.
  // why: the divergence lowering introduced and a substitute-on-undefined fold could not see.
  // `resolveTextProps` — the authority every wrapper path calls — reads `ellipsizeMode ?? 'tail'`
  // and `allowFontScaling !== false`, so a null resolves to the default on BOTH. Until 2026-08-23
  // the lowered tag committed the null instead, which no test caught and only a device showed.
  it('folds a null the same way resolveTextProps does, not just an undefined', async () => {
    mount(ROOT_TAG, () => (
      <symbiote-view>
        <symbiote-text ellipsizeMode={null} allowFontScaling={null}>
          x
        </symbiote-text>
      </symbiote-view>
    ));
    await tick();
    const props = committedTextProps();
    expect(props?.ellipsizeMode, 'null -> tail, like ?? does').toBe('tail');
    expect(props?.allowFontScaling, 'only a literal false opts out').toBe(true);
  });

  it('does not seed a non-text node', async () => {
    mount(ROOT_TAG, () => <symbiote-view testID="plain" />);
    await tick();
    const view = fabric.committed.find(node => node.props.testID === 'plain');
    expect(view?.props.ellipsizeMode).toBeUndefined();
    expect(view?.props.allowFontScaling).toBeUndefined();
  });
});
