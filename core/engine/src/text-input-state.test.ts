// text-input-state.ts was a straight port of RN's TextInputState (same file header comment) but
// had never been given its own test — found during an RN-parity re-verification pass, cross-
// checking `TextInput-itest.js`'s focus()/blur()/isFocused() describe blocks against this module.
import { afterEach, describe, expect, it } from 'vitest';
import { appendChild, createElement, createSurface, routeProp } from './index';
import { installRecordingFabric } from '../../test-utils/src/index';
import {
  blurTextInput,
  currentlyFocusedInput,
  focusTextInput,
  setInputBlurred,
  setInputFocused,
} from './text-input-state';

const fabric = installRecordingFabric();
let nextRootTag = 9900;

function mountNode() {
  const surface = createSurface((nextRootTag += 1));
  const root = createElement('RCTView');
  surface.appendChild(root);
  const node = createElement('AndroidTextInput', false, 'text-input');
  appendChild(root, node);
  surface.commit();
  return node;
}

function commandNames(): string[] {
  return fabric.commands
    .filter(entry => entry.viewName === 'AndroidTextInput')
    .map(entry => entry.commandName);
}

afterEach(() => {
  fabric.reset();
  // Cross-test isolation: `currentlyFocused` is a module-level singleton, exactly like RN's own
  // `currentlyFocusedInputRef` — a prior test's tracked node must not leak into the next one.
  const stale = currentlyFocusedInput();
  if (stale !== null) setInputBlurred(stale);
});

describe('blurTextInput', () => {
  // why: RN's TextInputState.blurTextInput only dispatches when `currentlyFocusedInputRef ===
  // textField` — calling blur() on an input that isn't tracked as focused is a no-op, matching
  // `TextInput-itest.js`'s "does NOT dispatch any commands if the input is NOT focused".
  it('does not dispatch a command for a node that is not the currently-focused one', () => {
    const node = mountNode();

    blurTextInput(node);

    expect(commandNames()).toEqual([]);
  });

  it('dispatches the blur command and clears tracking for the currently-focused node', () => {
    const node = mountNode();
    setInputFocused(node);

    blurTextInput(node);

    expect(commandNames()).toEqual(['blur']);
    expect(currentlyFocusedInput()).toBe(null);
  });

  it('is a no-op for null', () => {
    expect(() => blurTextInput(null)).not.toThrow();
  });
});

describe('focusTextInput', () => {
  // why: `ReactNativeElement.focus()` routes a text input through `TextInputState.focusTextInput`
  // (confirmed by reading the RN source, correcting an earlier pass's mistaken N/A), which is a
  // no-op when the field is already the tracked one.
  it('dispatches the focus command and tracks the node when nothing else is focused', () => {
    const node = mountNode();

    focusTextInput(node);

    expect(commandNames()).toEqual(['focus']);
    expect(currentlyFocusedInput()).toBe(node);
  });

  it('does not dispatch a second command for an already-focused node', () => {
    const node = mountNode();
    setInputFocused(node);

    focusTextInput(node);

    expect(commandNames()).toEqual([]);
  });

  // why: mirrors RN's TextInputState.focusTextInput guard (`editable !== false`), ported here
  // since that's where the guard actually lives at the engine level.
  it('does not dispatch when editable is explicitly false', () => {
    const node = mountNode();
    routeProp(node, 'editable', false);

    focusTextInput(node);

    expect(commandNames()).toEqual([]);
    expect(currentlyFocusedInput()).toBe(null);
  });

  it('is a no-op for null', () => {
    expect(() => focusTextInput(null)).not.toThrow();
  });
});

describe('setInputBlurred', () => {
  // why: RN's own comment on `blurInput` — a later input may have taken focus in between, so a
  // stale blur report must not clear the NEW input's tracking.
  it('does not clear tracking if a different node has since taken focus', () => {
    const first = mountNode();
    const second = mountNode();
    setInputFocused(first);
    setInputFocused(second);

    setInputBlurred(first);

    expect(currentlyFocusedInput()).toBe(second);
  });
});
