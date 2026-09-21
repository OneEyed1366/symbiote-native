// Mirrors RN's TextInput/TextInputState: the single currently-focused input, tracked
// JS-side because native exposes no focus getter. TextInput reports focus/blur here so
// Keyboard.dismiss can blur whatever holds focus without a ref, exactly how RN's
// dismissKeyboard() works (blurTextInput(currentlyFocusedInput())).

import { dispatchViewCommand, propOf } from './imperative';
import { dlog } from './debug';
import type { ISymbioteNode } from './node';

let currentlyFocused: ISymbioteNode | null = null;

// The input that last reported focus and hasn't reported blur, or null.
export function currentlyFocusedInput(): ISymbioteNode | null {
  return currentlyFocused;
}

// TextInput's focus event reports the node here; its blur event clears it (only if it
// is still the current one; a later input may have taken focus in between).
export function setInputFocused(node: ISymbioteNode): void {
  currentlyFocused = node;
}

export function setInputBlurred(node: ISymbioteNode): void {
  if (currentlyFocused === node) currentlyFocused = null;
}

// Imperative blur: drive the native `blur` view command and drop the tracked focus.
// Used by TextInput.blur() and Keyboard.dismiss(). A no-op if this node isn't the
// currently-focused one — mirrors RN's TextInputState.blurTextInput, which guards the
// same way so blurring an already-unfocused input never reaches native.
export function blurTextInput(node: ISymbioteNode | null): void {
  if (node === null || currentlyFocused !== node) return;
  dlog('TextInputState.blurTextInput -> blur command');
  dispatchViewCommand(node, 'blur', []);
  setInputBlurred(node);
}

// Imperative focus: RN's `ReactNativeElement.focus()` routes a text input through
// `TextInputState.focusTextInput`, not a raw command — same guard as blur, plus a check
// this side of the pair also carries: already-focused or `editable: false` is a no-op.
export function focusTextInput(node: ISymbioteNode | null): void {
  if (node === null) return;
  if (currentlyFocused === node || propOf(node, 'editable') === false) return;
  dlog('TextInputState.focusTextInput -> focus command');
  setInputFocused(node);
  dispatchViewCommand(node, 'focus', []);
}
