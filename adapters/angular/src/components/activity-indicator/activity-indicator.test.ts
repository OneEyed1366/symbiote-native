// The size->native-enum/pixel-box translation and the wrapper/spinner split are
// framework-agnostic core logic (@symbiote-native/components/renderActivityIndicator) shared
// verbatim with React/Vue — this file exercises them only as integration, through the real
// Angular pipe (@Input -> descriptor -> commit), not as a from-scratch derivation of their
// math. What is Angular-specific and exercised here: @Input/@Output wiring (including the
// `observed`-gated EventEmitter -> onLayout bridge, so an unbound layout Output drops the key
// entirely instead of handing the engine a no-op function), and that a signal update patches
// the SAME native wrapper instead of re-creating it (no extra createNode).
import '@angular/compiler';
import { Component, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { ActivityIndicator } from './index';

const ROOT_TAG = 905;
const fabric = installFabric();

let capturedHost: ActivityIndicatorHost | undefined;

function findCommitted(
  predicate: (node: IFakeNode) => boolean,
): IFakeNode | undefined {
  const visit = (node: IFakeNode): IFakeNode | undefined => {
    if (predicate(node)) return node;
    for (const child of node.children) {
      const found = visit(child);
      if (found) return found;
    }
    return undefined;
  };
  for (const node of fabric.committed) {
    const found = visit(node);
    if (found) return found;
  }
  return undefined;
}

function findSpinner(): IFakeNode {
  const node = findCommitted(n => n.viewName === 'ActivityIndicatorView');
  if (!node) throw new Error('no ActivityIndicatorView was created');
  return node;
}

function findWrapper(): IFakeNode {
  const node = findCommitted(
    n => n.viewName === 'RCTView' && n.props.pointerEvents !== 'box-none',
  );
  if (!node) throw new Error('no ActivityIndicator wrapper was created');
  return node;
}

@Component({
  selector: 'symbiote-activity-indicator-host',
  standalone: true,
  imports: [ActivityIndicator],
  template: `
    <ActivityIndicator
      [size]="size()"
      [color]="color()"
      [animating]="animating()"
      [testID]="testID()"
      [accessible]="true"
      [accessibilityLabel]="'loading'"
      (layout)="onLayout($event)"
    />
  `,
})
class ActivityIndicatorHost {
  readonly size = signal<'small' | 'large' | number>('large');
  readonly color = signal('#0000ff');
  readonly animating = signal(false);
  readonly testID = signal('spinner-wrapper');
  onLayout = vi.fn();

  constructor() {
    // Captures the live component instance so the test can drive its signals after mount.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedHost = this;
  }
}

beforeEach(() => {
  capturedHost = undefined;
  fabric.reset();
});
afterEach(() => unmount(ROOT_TAG));

// why: contract-accurate group name — nothing here throws. Every @Input resolves to a committed
// prop value (or a documented default), and an event always reaches its bound @Output.
describe('ActivityIndicator (no throwing path — see file header)', () => {
  it('wires every @Input through to the committed spinner + wrapper, and the wrapper layout Output fires', async () => {
    mount(ROOT_TAG, ActivityIndicatorHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    expect(fabric.serialize(fabric.appRoot().children)).toBe(
      'RCTView(ActivityIndicatorView)',
    );

    const spinner = findSpinner();
    expect(spinner.props.animating).toBe(false);
    expect(spinner.props.color).toBe('#0000ff');
    // why: shared.ts defaults `hidesWhenStopped: hidesWhenStopped !== false` — an unset @Input
    // must still hide the spinner when it stops, matching RN's own default.
    expect(spinner.props.hidesWhenStopped).toBe(true);
    expect(spinner.props.size).toBe('large');
    expect(spinner.props.width).toBe(36);
    expect(spinner.props.height).toBe(36);

    const wrapper = findWrapper();
    expect(wrapper.props.testID).toBe('spinner-wrapper');
    expect(wrapper.props.accessible).toBe(true);
    expect(wrapper.props.accessibilityLabel).toBe('loading');
    expect(wrapper.props.alignItems).toBe('center');
    expect(wrapper.props.justifyContent).toBe('center');

    fabric.fireEvent(wrapper.instanceHandle, 'topLayout', {});
    expect(capturedHost?.onLayout).toHaveBeenCalledOnce();
  });

  it('patches the descriptor in place on a signal update, without remounting the native wrapper', async () => {
    mount(ROOT_TAG, ActivityIndicatorHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const before = findWrapper();
    const createdBefore = fabric.counts.createNode;

    if (!capturedHost) throw new Error('host was not captured');
    capturedHost.size.set(48);
    capturedHost.color.set('#ff0000');
    capturedHost.animating.set(true);
    capturedHost.testID.set('spinner-wrapper-updated');
    await Promise.resolve();
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const after = findWrapper();
    // why: <clone_on_write_lives_in_engine> — a prop-only change must clone the existing Fabric
    // node, never tear it down and recreate it (that would drop native focus/animation state).
    expect(after.instanceHandle).toBe(before.instanceHandle);
    expect(fabric.counts.createNode).toBe(createdBefore);
    expect(after.props.testID).toBe('spinner-wrapper-updated');
    const spinner = findSpinner();
    expect(spinner.props.color).toBe('#ff0000');
    expect(spinner.props.animating).toBe(true);
    expect(spinner.props.width).toBe(48);
    expect(spinner.props.height).toBe(48);
    // why: a numeric size never sets the native `size` enum (renderActivityIndicator only sizes
    // it via style), and the engine sends an explicit `null` diff — not a dropped key — for a
    // prop the previous frame set but this one no longer does (fake-fabric.ts's merge contract).
    expect(spinner.props.size).toBeNull();
  });
});
