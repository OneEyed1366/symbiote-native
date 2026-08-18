// Proves the Angular Switch lifecycle wiring (SwitchBase in shared.ts): the controlled value fold,
// the iOS platform.trackColorProps -> native prop-name mapping, the change -> valueChange/change
// EventEmitter bridge, the controlled snap-back on a rejected toggle, and the anchor class= fix.
//
// SCOPE: switchReducer/valueFromChange/shouldSnapBack (core/components/src/state/switch.ts) and
// renderSwitch (core/components/src/view/render-switch.ts) are the shared, framework-agnostic
// state machine + render fn — per <components_split_logic_view_lifecycle> those are NOT
// re-verified branch-by-branch here (that duplicates their own core-level coverage, per the React
// adapter twin's identical scoping note in adapters/react/src/components/switch/switch.test.tsx).
// This file proves only that the Angular ADAPTER wires them correctly: handleChange forwards a
// real change event into the reducer, and snapBackIfNeeded's queueMicrotask + whenCommitted +
// dispatchViewCommand chain actually fires (or doesn't) at the right moment. No Negative group:
// nothing here throws — a malformed change event is silently ignored (see the boundary test below),
// which is the correct contract, not an error path.
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiote-native/engine';
import { installFabric } from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { Switch } from './index';

const ROOT_TAG = 902;
const fabric = installFabric();

let capturedHost: SwitchHost | undefined;

@Component({
  selector: 'symbiote-switch-host',
  standalone: true,
  imports: [Switch],
  template: `
    <Switch
      [value]="value"
      (valueChange)="onValueChange($event)"
      (change)="onChange($event)"
    >
    </Switch>
  `,
})
class SwitchHost {
  value = false;
  onValueChange = vi.fn((next: boolean) => {
    this.value = next;
  });
  onChange = vi.fn();

  constructor() {
    // Captures the live component instance so the test can drive its signals after mount.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedHost = this;
  }
}

// A parent that PINS `value` and never updates it from onValueChange — the "rejected toggle"
// shape the snap-back mechanism exists to correct.
@Component({
  selector: 'symbiote-switch-stuck-host',
  standalone: true,
  imports: [Switch],
  template: `<Switch [value]="false" (valueChange)="onValueChange()"></Switch>`,
})
class StuckSwitchHost {
  onValueChange = (): void => undefined;
}

@Component({
  selector: 'symbiote-switch-color-host',
  standalone: true,
  imports: [Switch],
  template: `
    <Switch
      [value]="true"
      [trackColor]="{ false: '#767577', true: '#81b0ff' }"
      [thumbColor]="'#f5dd4b'"
    ></Switch>
  `,
})
class SwitchColorHost {}

@Component({
  selector: 'symbiote-switch-class-host',
  standalone: true,
  imports: [Switch],
  template: `<Switch [testID]="'switch-with-class'" class="card"></Switch>`,
})
class SwitchClassHost {}

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function switchNode(): ReturnType<typeof fabric.find> {
  return fabric.find(n => n.viewName === 'Switch');
}

beforeEach(() => {
  capturedHost = undefined;
  fabric.reset();
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

describe('Switch', () => {
  it('commits a controlled Switch with value folded to a strict boolean', async () => {
    mount(ROOT_TAG, SwitchHost);
    await tick();

    const node = switchNode();
    expect(node, 'Switch node committed').toBeDefined();
    expect(node?.props).toMatchObject({ value: false });
  });

  // why: trackColor/thumbColor are RN's public prop names, but the native iOS Switch view reads
  // them under different keys (onTintColor/tintColor/thumbTintColor) — this proves the Angular
  // build's `platform.trackColorProps` closure actually feeds those iOS-specific names into
  // renderSwitch, not just that renderSwitch itself can produce them (that's core's job).
  it('maps trackColor/thumbColor to the native iOS prop names', async () => {
    mount(ROOT_TAG, SwitchColorHost);
    await tick();

    const props = switchNode()?.props;
    expect(props?.onTintColor).toBe('#81b0ff');
    expect(props?.tintColor).toBe('#767577');
    expect(props?.thumbTintColor).toBe('#f5dd4b');
  });

  // why: RN's Switch is controlled — native reports optimistically before JS approves, so a
  // `change` must both fire the value/change callbacks AND, once the parent's own state updates,
  // leave the JS-held value agreeing with what native reported (no snap-back needed).
  it('fires onValueChange and onChange when native reports a change', async () => {
    mount(ROOT_TAG, SwitchHost);
    await tick();

    const node = switchNode();
    expect(node).toBeDefined();

    fabric.fireEvent(node?.instanceHandle, 'topChange', {
      value: true,
      eventCount: 1,
    });
    await tick();

    const host = capturedHost;
    expect(host?.onValueChange).toHaveBeenCalledWith(true);
    expect(host?.onChange).toHaveBeenCalled();
    expect(host?.value).toBe(true);
  });

  // why: a change payload with a non-boolean nativeEvent.value must be ignored outright — no
  // callback, no reducer dispatch, no snap-back command — since valueFromChange has nothing to
  // report; forwarding garbage as if it were a real toggle would corrupt the parent's own state.
  it('ignores a change event whose nativeEvent.value is not a boolean', async () => {
    mount(ROOT_TAG, SwitchHost);
    await tick();

    const node = switchNode();
    fabric.fireEvent(node?.instanceHandle, 'topChange', {
      value: 'not-a-boolean',
    });
    await tick();

    expect(capturedHost?.onValueChange).not.toHaveBeenCalled();
    expect(fabric.commands.some(c => c.commandName === 'setValue')).toBe(false);
  });

  // why: when the parent's handler is a no-op, `value` never changes, so the retained tree never
  // diverges and nothing would naturally re-commit the rejected toggle back to native — the
  // imperative setValue command is the ONLY correction path, or the native switch and the JS
  // model of it permanently disagree.
  it('snaps native back via a setValue command when the parent rejects the toggle', async () => {
    mount(ROOT_TAG, StuckSwitchHost);
    await tick();

    const node = switchNode();
    fabric.fireEvent(node?.instanceHandle, 'topChange', { value: true });
    await tick();

    const setValue = fabric.commands.find(c => c.commandName === 'setValue');
    expect(
      setValue,
      'a setValue command after a rejected toggle',
    ).toBeDefined();
    expect(setValue?.args[0]).toBe(false);
  });

  // why: shouldSnapBack only fires once native has actually reported a value; a Switch that never
  // received a `change` event must never issue a snap-back command just because it committed with
  // value=false — there is nothing yet for the JS-held value to disagree with.
  it('issues no snap-back command before native has ever reported a change', async () => {
    mount(ROOT_TAG, SwitchHost);
    await tick();

    expect(fabric.commands.some(c => c.commandName === 'setValue')).toBe(false);
  });

  // why: index.ios.ts's hostProps override merges anchorHostStyle(this.elementRef) with the base
  // getter's resolved style — without it, a class= at the use site addClass-toggles the
  // non-painting anchor and never reaches the real committed <symbiote-switch> one level down.
  it('resolves a class= on the Switch use site onto the real committed view, not the anchor', async () => {
    registerStyles({ card: { backgroundColor: 'red' } });

    mount(ROOT_TAG, SwitchClassHost);
    await tick();

    const node = fabric.find(n => n.props.testID === 'switch-with-class');
    expect(node?.props.backgroundColor).toBe('red');
  });
});
