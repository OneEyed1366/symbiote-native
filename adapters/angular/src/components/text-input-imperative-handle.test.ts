// Verifies the imperative handle (focus/blur/clear/isFocused/setSelection) survived today's
// tag split — TextInput's own template now renders `symbiote-text-input-managed` /
// `-multiline-managed` instead of the bare intrinsic tags, so the engine's TextInput host
// behavior (keyed by the bare tags, `core/components/src/behaviors/text-input.ts`) does not
// double up with this component's own hand-rolled state.
//
// Both spellings resolve to the SAME native view (RCTSinglelineTextInputView /
// RCTMultilineTextInputView — `core/components/src/component-names/index.ios.ts`), so the
// committed Fabric tree cannot tell them apart. The oracle here is a spy on `createElement`'s
// `name` argument — what the template actually asked for — plus the imperative surface driven
// end to end through the same committed node.
import '@angular/compiler';
import { Component, ViewChild } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';

import { mount, unmount } from '../render';
import { SymbioteRenderer } from '../renderer';
import { TextInput } from './text-input';

const ROOT_TAG = 918;
const fabric = installFabric();

function probeCreateElement(): {
  names: () => string[];
  restore: () => void;
} {
  const original = SymbioteRenderer.prototype.createElement;
  const seen: string[] = [];
  SymbioteRenderer.prototype.createElement = function patched(
    name: string,
  ): ReturnType<typeof original> {
    seen.push(name);
    return original.call(this, name);
  };
  return {
    names: () => seen,
    restore: (): void => {
      SymbioteRenderer.prototype.createElement = original;
    },
  };
}

let hostInstance: TextInputHandleHost | undefined;

function mounted(): TextInputHandleHost {
  if (hostInstance === undefined)
    throw new Error('host component was never constructed');
  return hostInstance;
}

@Component({
  selector: 'symbiote-text-input-handle-host',
  standalone: true,
  imports: [TextInput],
  template: `
    <TextInput #single [testID]="'single-line'" />
    <TextInput #multi [testID]="'multiline'" [multiline]="true" />
  `,
})
class TextInputHandleHost {
  @ViewChild('single', { read: TextInput }) readonly single!: TextInput;
  @ViewChild('multi', { read: TextInput }) readonly multi!: TextInput;

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    hostInstance = this;
  }
}

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let probe: ReturnType<typeof probeCreateElement>;

beforeEach(() => {
  fabric.reset();
  probe = probeCreateElement();
});
afterEach(() => {
  unmount(ROOT_TAG);
  probe.restore();
});

describe('TextInput imperative handle over the -managed tag split', () => {
  // why: proves the migration is actually live — a stale build or a mis-registered selector
  // would still commit an identical RCTSinglelineTextInputView, so the committed tree alone
  // cannot distinguish "renders -managed" from "still renders the bare intrinsic".
  it('renders through -managed, never through the bare host-behavior tag', async () => {
    mount(ROOT_TAG, TextInputHandleHost);
    await tick();

    const names = probe.names();
    expect(names).toContain('symbiote-text-input-managed');
    expect(names).toContain('symbiote-text-input-multiline-managed');
    expect(names).not.toContain('symbiote-text-input');
    expect(names).not.toContain('symbiote-text-input-multiline');
  });

  it('focus() dispatches a focus view command on the committed single-line host', async () => {
    mount(ROOT_TAG, TextInputHandleHost);
    await tick();

    const node = fabric.find(n => n.props.testID === 'single-line');
    expect(node, 'single-line host committed').toBeDefined();

    fabric.commands.length = 0;
    mounted().single.focus();

    expect(fabric.commands.some(c => c.commandName === 'focus')).toBe(true);
    expect(fabric.commands.at(-1)?.node.tag).toBe(node?.tag);
  });

  it('reflects native focus/blur events through isFocused()', async () => {
    mount(ROOT_TAG, TextInputHandleHost);
    await tick();

    const node = fabric.find(n => n.props.testID === 'single-line');
    expect(node, 'single-line host committed').toBeDefined();

    expect(mounted().single.isFocused()).toBe(false);

    fabric.fireEvent(node?.instanceHandle, 'topFocus', {});
    expect(mounted().single.isFocused()).toBe(true);

    fabric.fireEvent(node?.instanceHandle, 'topBlur', {});
    expect(mounted().single.isFocused()).toBe(false);
  });

  it('clear() and setSelection() route through setTextAndSelection on the multiline host', async () => {
    mount(ROOT_TAG, TextInputHandleHost);
    await tick();

    const node = fabric.find(n => n.props.testID === 'multiline');
    expect(node, 'multiline host committed').toBeDefined();

    fabric.commands.length = 0;
    mounted().multi.clear();

    const cleared = fabric.commands.find(
      c => c.commandName === 'setTextAndSelection',
    );
    expect(cleared, 'clear() dispatches setTextAndSelection').toBeDefined();
    expect(cleared?.node.tag).toBe(node?.tag);
    expect(cleared?.args[1]).toBe('');

    fabric.commands.length = 0;
    mounted().multi.setSelection(2, 5);

    const selected = fabric.commands.find(
      c => c.commandName === 'setTextAndSelection',
    );
    expect(
      selected,
      'setSelection() dispatches setTextAndSelection',
    ).toBeDefined();
    expect(selected?.args.slice(2)).toEqual([2, 5]);
  });
});
