// What `Text.js` does to its props before they reach native, against what a committed `<Text>`
// carries: the style overrides, `numberOfLines` and the aria folds
// A pressable text (the link role) is covered in `text-pressable-payload.itest.ts`

import {
  appendChild,
  committedPayloadOf,
  createElement,
  createRawText,
  createSurface,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, report } from './harness';

const ROOT_TAG = 1;

function commitText(
  props: Record<string, unknown>,
): Readonly<Record<string, unknown>> {
  const surface = createSurface(ROOT_TAG);
  const node: ISymbioteNode = createElement('RCTText', true, 'text');
  for (const [name, value] of Object.entries(props))
    routeProp(node, name, value);
  appendChild(node, createRawText('hello'));
  surface.appendChild(node);
  surface.commit();
  mounted();
  const payload = committedPayloadOf(node);
  if (payload === undefined) throw new Error('nothing committed');
  return payload;
}

// One field out of a committed nested object, narrowed rather than cast
function fieldOf(value: unknown, name: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return Object.hasOwn(value, name) ? Reflect.get(value, name) : undefined;
}

describe('numberOfLines', () => {
  // `Text.js:187-195`, a negative count is reset to 0 (unlimited)
  it('resets a negative count to 0', () => {
    expect(commitText({ numberOfLines: -2 }).numberOfLines).toBe(0);
  });

  it('forwards a valid count', () => {
    expect(commitText({ numberOfLines: 3 }).numberOfLines).toBe(3);
  });
});

describe('style overrides', () => {
  // `Text.js:207-211` and the map at the top of the file
  it('turns userSelect into selectable and drops the style key', () => {
    const none = commitText({ style: { userSelect: 'none' } });
    expect(none.selectable).toBe(false);
    expect(none.userSelect).toBe(undefined);

    expect(commitText({ style: { userSelect: 'text' } }).selectable).toBe(true);
    expect(commitText({ style: { userSelect: 'all' } }).selectable).toBe(true);
  });

  it('lets userSelect win over the selectable prop', () => {
    expect(
      commitText({ selectable: true, style: { userSelect: 'none' } })
        .selectable,
    ).toBe(false);
  });

  // `Text.js:214-219` and the map at the top of the file
  it('turns verticalAlign into textAlignVertical and drops the style key', () => {
    const middle = commitText({ style: { verticalAlign: 'middle' } });
    expect(middle.textAlignVertical).toBe('center');
    expect(middle.verticalAlign).toBe(undefined);

    expect(
      commitText({ style: { verticalAlign: 'top' } }).textAlignVertical,
    ).toBe('top');
  });
});

describe('fontWeight', () => {
  // `Text.js:192-197`, native reads the weight as a string
  it('turns a numeric weight into a string', () => {
    expect(commitText({ style: { fontWeight: 600 } }).fontWeight).toBe('600');
  });

  it('leaves a string weight alone', () => {
    expect(commitText({ style: { fontWeight: 'bold' } }).fontWeight).toBe(
      'bold',
    );
  });
});

describe('accessibility folds', () => {
  // `Text.js:119-126`
  it('turns aria-hidden into the platform hide flags', () => {
    const hidden = commitText({ 'aria-hidden': true });
    expect(hidden.accessibilityElementsHidden).toBe(true);
    expect(hidden.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('only sets the elements flag for aria-hidden false', () => {
    const shown = commitText({ 'aria-hidden': false });
    expect(shown.accessibilityElementsHidden).toBe(false);
    expect(shown.importantForAccessibility).toBe(undefined);
  });

  // `Text.js:81-117`
  it('folds the aria state props into accessibilityState', () => {
    const state = commitText({
      'aria-busy': true,
      'aria-selected': true,
    }).accessibilityState;
    expect(fieldOf(state, 'busy')).toBe(true);
    expect(fieldOf(state, 'selected')).toBe(true);
  });

  it('folds disabled into accessibilityState', () => {
    const payload = commitText({ disabled: true });
    expect(fieldOf(payload.accessibilityState, 'disabled')).toBe(true);
    expect(payload.disabled).toBe(true);
  });

  it('lets an explicit disabled win over the state field', () => {
    const payload = commitText({
      disabled: false,
      accessibilityState: { disabled: true },
    });
    expect(fieldOf(payload.accessibilityState, 'disabled')).toBe(false);
  });

  it('sends the state field as disabled when the prop is absent', () => {
    expect(
      commitText({ accessibilityState: { disabled: true } }).disabled,
    ).toBe(true);
  });

  it('lets aria-label win over accessibilityLabel', () => {
    expect(
      commitText({ 'aria-label': 'a', accessibilityLabel: 'b' })
        .accessibilityLabel,
    ).toBe('a');
  });
});

describe('ids', () => {
  it('lets id win over nativeID', () => {
    expect(commitText({ id: 'one', nativeID: 'two' }).nativeID).toBe('one');
  });
});

report();
