// Порт `TextInput-itest` (Fantom гоняет его на Android)
// Команды читаем из `commands()`, а не из логов монтирования: Fantom пишет их в тот же лог
// Не портируем `ReactNativeElement` и `TextInput.State`, он отдельно в `text-input-state.test.ts`

import {
  createElement,
  createRef,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react';

import { textInputOf } from '@symbiote-native/components';
import type { ITextInputHandle } from '@symbiote-native/components';
import { currentlyFocusedInput } from '@symbiote-native/engine';

import { createRoot, render, takeLogs } from './culling-fixture';
import {
  beforeEach,
  commands,
  describe,
  dispatchEvent,
  expect,
  it,
  mounted,
  report,
} from './harness';

const TEXT_INPUT = 'text-input';
const CREATE_AND_INSERT = [
  'Update {type: "RootView", nativeID: (root)}',
  'Create {type: "AndroidTextInput", nativeID: "text-input"}',
  'Insert {type: "AndroidTextInput", parentNativeID: (root), index: 0, nativeID: "text-input"}',
];

// Команды после `since`, как `Command {... name: "focus"}` из лога Fantom
function commandsSince(since: number): string[] {
  return commands()
    .slice(since)
    .map(({ commandName, args }) =>
      args.length === 0
        ? commandName
        : `${commandName} ${JSON.stringify(args)}`,
    );
}

function mountInput(props: Record<string, unknown>) {
  const ref = createRef<ITextInputHandle>();
  render(createElement(TEXT_INPUT, { nativeID: 'text-input', ref, ...props }));
  const input = textInputOf(ref.current);
  if (input === undefined) throw new Error('the ref carries no TextInput API');
  return { ref, input, tag: mounted().children[0]?.tag ?? 0 };
}

describe('<TextInput> props', () => {
  beforeEach(() => createRoot(200, 200));

  it('the selection is passed to the component view by command', () => {
    const since = commands().length;
    render(
      createElement(
        TEXT_INPUT,
        { nativeID: 'text-input', selection: { start: 0, end: 4 } },
        'hello World!',
      ),
    );

    expect(takeLogs()).toEqual(CREATE_AND_INSERT);
    expect(commandsSince(since)).toEqual(['setTextAndSelection [0,null,0,4]']);
  });

  it('onChange is called when the change native event is dispatched', () => {
    const received: unknown[] = [];
    const { tag } = mountInput({
      onChange: (event: { nativeEvent: unknown }) =>
        received.push(event.nativeEvent),
    });

    dispatchEvent(tag, 'change', { text: 'Hello World' });

    expect(received.length).toBe(1);
    expect(Reflect.get(Object(received[0]), 'text')).toBe('Hello World');
  });

  // RN 0.85: the change event carries the cursor `selection` on both platforms
  it('onChange keeps the selection the change event carries', () => {
    const received: unknown[] = [];
    const { tag } = mountInput({
      onChange: (event: { nativeEvent: unknown }) =>
        received.push(event.nativeEvent),
    });

    dispatchEvent(tag, 'change', {
      text: 'Hello',
      selection: { start: 5, end: 5 },
    });

    const selection = Reflect.get(Object(received[0]), 'selection');
    expect(Reflect.get(Object(selection), 'start')).toBe(5);
    expect(Reflect.get(Object(selection), 'end')).toBe(5);
  });

  // RN passes the bare string, the tag passes the event with `text` on it (user ruling: one
  // contract on five adapters, Svelte's `target_handler` takes an object only)
  it('onChangeText is called when the change native event is dispatched', () => {
    const received: unknown[] = [];
    const { tag } = mountInput({
      onChangeText: (event: { text: string }) => received.push(event.text),
    });

    dispatchEvent(tag, 'change', { text: 'Hello World' });

    expect(received).toEqual(['Hello World']);
  });

  it('onFocus is called when the focus native event is dispatched', () => {
    let focused = 0;
    const { tag } = mountInput({ onFocus: () => (focused += 1) });
    expect(focused).toBe(0);

    dispatchEvent(tag, 'focus', {});

    expect(focused).toBe(1);
  });

  it('onBlur is called when the blur native event is dispatched', () => {
    let blurred = 0;
    const { tag } = mountInput({ onBlur: () => (blurred += 1) });
    expect(blurred).toBe(0);

    dispatchEvent(tag, 'blur', {});

    expect(blurred).toBe(1);
  });
});

function hostProps(props: Record<string, unknown>): Record<string, unknown> {
  render(createElement(TEXT_INPUT, props));
  return { ...mounted().children[0]?.props };
}

// Кейсы добавлены в RN 0.86 (#56559, TextInput-test переехал на Fantom)
describe('<TextInput> props on the mounting layer', () => {
  beforeEach(() => createRoot(200, 200));

  it("has 'id' propagated as 'nativeID'", () => {
    expect(hostProps({ id: 'alpha' }).nativeID).toBe('alpha');
  });

  it("has 'nativeID' propagated correctly", () => {
    expect(hostProps({ nativeID: 'alpha' }).nativeID).toBe('alpha');
  });

  it("has a precedence of 'id' over 'nativeID'", () => {
    expect(hostProps({ id: 'alpha', nativeID: 'gamma' }).nativeID).toBe(
      'alpha',
    );
  });

  it('propagates testID', () => {
    expect(hostProps({ testID: 'my-test-id' }).testID).toBe('my-test-id');
  });

  it("has 'aria-label' propagated as 'accessibilityLabel'", () => {
    expect(hostProps({ 'aria-label': 'label' }).accessibilityLabel).toBe(
      'label',
    );
  });

  it("has 'accessibilityLabel' propagated correctly", () => {
    expect(hostProps({ accessibilityLabel: 'label' }).accessibilityLabel).toBe(
      'label',
    );
  });

  it("maps 'aria-*' state props to 'accessibilityState'", () => {
    const props = hostProps({
      'aria-busy': true,
      'aria-checked': true,
      'aria-disabled': true,
      'aria-expanded': true,
      'aria-selected': true,
    });

    expect(props.accessibilityState).toBe(
      '{disabled:true,selected:true,checked:Checked,busy:true,expanded:true}',
    );
  });

  it('propagates accessibilityRole', () => {
    expect(hostProps({ accessibilityRole: 'button' }).accessibilityRole).toBe(
      'button',
    );
  });

  it('propagates style values', () => {
    const props = hostProps({ style: { backgroundColor: 'white' } });

    expect(props.backgroundColor).toBe('rgba(255, 255, 255, 1)');
  });
});

describe('<TextInput> ref', () => {
  beforeEach(() => createRoot(200, 200));

  it('provides additional methods: clear, isFocused, getNativeRef, setSelection', () => {
    const { input } = mountInput({});

    expect(typeof input.clear).toBe('function');
    expect(typeof input.isFocused).toBe('function');
    expect(typeof input.getNativeRef).toBe('function');
    expect(typeof input.setSelection).toBe('function');
  });

  it('focus() dispatches the focus command', () => {
    const { input } = mountInput({});
    const since = commands().length;

    input.focus();

    expect(commandsSince(since)).toEqual(['focus']);
  });

  it('creates the view before dispatching a view command from a ref function', () => {
    const since = commands().length;
    render(
      createElement(TEXT_INPUT, {
        nativeID: 'text-input',
        ref: (node: ITextInputHandle | null) => textInputOf(node)?.focus(),
      }),
    );

    expect(takeLogs()).toEqual(CREATE_AND_INSERT);
    expect(commandsSince(since)).toEqual(['focus']);
  });

  it('creates the view before dispatching a view command from useLayoutEffect', () => {
    function Component() {
      const ref = useRef<ITextInputHandle>(null);
      useLayoutEffect(() => {
        textInputOf(ref.current)?.focus();
      }, []);
      return createElement(TEXT_INPUT, { ref, nativeID: 'text-input' });
    }
    const since = commands().length;
    render(createElement(Component));

    expect(takeLogs()).toEqual(CREATE_AND_INSERT);
    expect(commandsSince(since)).toEqual(['focus']);
  });

  it('creates the view before dispatching a view command from useEffect', () => {
    function Component() {
      const ref = useRef<ITextInputHandle>(null);
      useEffect(() => {
        textInputOf(ref.current)?.focus();
      }, []);
      return createElement(TEXT_INPUT, { ref, nativeID: 'text-input' });
    }
    const since = commands().length;
    render(createElement(Component));

    expect(takeLogs()).toEqual(CREATE_AND_INSERT);
    expect(commandsSince(since)).toEqual(['focus']);
  });

  it('blur() does NOT dispatch any commands if the input is NOT focused', () => {
    const { input } = mountInput({});
    const since = commands().length;

    input.blur();

    expect(commandsSince(since)).toEqual([]);
  });

  it('blur() dispatches the blur command if the input is focused', () => {
    const { input } = mountInput({});
    input.focus();
    const since = commands().length;

    input.blur();

    expect(commandsSince(since)).toEqual(['blur']);
  });

  it('clear() dispatches the clear command', () => {
    const { input } = mountInput({ value: 'Some input' });
    const since = commands().length;

    input.clear();

    expect(commandsSince(since)).toEqual(['setTextAndSelection [0,"",0,0]']);
  });

  it('isFocused() returns true if the input is focused', () => {
    const { input } = mountInput({});
    expect(input.isFocused()).toBe(false);

    input.focus();
    expect(input.isFocused()).toBe(true);

    input.blur();
    expect(input.isFocused()).toBe(false);
  });

  it('isFocused() returns false if the input is unmounted', () => {
    const { input } = mountInput({});
    input.focus();
    expect(input.isFocused()).toBe(true);

    render(createElement('view', null));

    expect(input.isFocused()).toBe(false);
  });

  it('isFocused() returns false if the input is unmounted and never focused', () => {
    expect(currentlyFocusedInput()).toBe(null);
    const { input } = mountInput({});
    expect(input.isFocused()).toBe(false);

    render(createElement('view', null));

    expect(currentlyFocusedInput()).toBe(null);
    expect(input.isFocused()).toBe(false);
  });

  it('unfocuses any previously focused TextInput when a new one is focused', () => {
    const first = createRef<ITextInputHandle>();
    const second = createRef<ITextInputHandle>();
    render(
      createElement(
        'view',
        null,
        createElement(TEXT_INPUT, { nativeID: 'text-input-1', ref: first }),
        createElement(TEXT_INPUT, { nativeID: 'text-input-2', ref: second }),
      ),
    );
    const one = textInputOf(first.current);
    const two = textInputOf(second.current);
    if (one === undefined || two === undefined)
      throw new Error('no TextInput API');
    expect(one.isFocused()).toBe(false);
    expect(two.isFocused()).toBe(false);

    one.focus();

    expect(one.isFocused()).toBe(true);
    expect(two.isFocused()).toBe(false);
    expect(currentlyFocusedInput()).toBe(first.current);

    two.focus();

    expect(one.isFocused()).toBe(false);
    expect(two.isFocused()).toBe(true);
    expect(currentlyFocusedInput()).toBe(second.current);
  });

  it('setSelection() dispatches the setTextAndSelection command', () => {
    const { input } = mountInput({ value: 'Some input' });
    const since = commands().length;

    input.setSelection(2, 5);

    expect(commandsSince(since)).toEqual(['setTextAndSelection [0,null,2,5]']);
  });
});

report();
