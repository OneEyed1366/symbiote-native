// Порт `Pressable-itest` (Fantom гоняет его на Android), пропсы читаем со смонтированного дерева
// Не портируем: `ref` с `ReactNativeElement` и тегом `RN:View` (DOM API)

import { createElement } from 'react';

import {
  accessibilityPropsSuite,
  type IMountedProps,
} from './accessibility-props-suite';
import { createRoot, render } from './culling-fixture';
import {
  beforeEach,
  describe,
  dispatchEvent,
  expect,
  it,
  mounted,
  report,
} from './harness';

type IProps = Record<string, unknown>;

// Порядок ключей в mounted props не контракт, а `toEqual` сравнивает сериализацию
function sortKeys(props: IProps): IProps {
  const entries = Object.entries(props);
  entries.sort(([left], [right]) => (left < right ? -1 : 1));
  return Object.fromEntries(entries);
}

function pressable(props: IProps, ...children: unknown[]) {
  render(createElement('pressable', props, ...children));
  const [host, ...rest] = mounted().children;
  expect(rest.length).toBe(0);
  return host;
}

// Fantom ждёт здесь и пустой `accessibilityState`: мы его не шлём, нативный дефолт тот же, а
// пропс на каждый Pressable стоил бы лишнего (`pressable-payload.itest.ts` держит отсутствие)
const IDLE = { accessible: 'true' };

describe('<Pressable> props', () => {
  beforeEach(() => createRoot(200, 200));

  it('style can be set with ViewStyle', () => {
    const host = pressable({
      style: {
        width: 100,
        height: 50,
        backgroundColor: 'blue',
        borderColor: 'red',
        borderWidth: 3,
        opacity: 40,
      },
    });

    expect(sortKeys({ ...host?.props })).toEqual(
      sortKeys({
        ...IDLE,
        backgroundColor: 'rgba(0, 0, 255, 1)',
        borderWidth: '3',
        height: '50',
        opacity: '40',
        width: '100',
      }),
    );
  });

  it('style function receives a boolean reflecting whether it is pressed', () => {
    const host = pressable({
      style: ({ pressed }: { pressed: boolean }) => ({
        backgroundColor: pressed ? 'red' : 'gray',
      }),
    });

    expect(sortKeys({ ...host?.props })).toEqual(
      sortKeys({ ...IDLE, backgroundColor: 'rgba(128, 128, 128, 1)' }),
    );
  });

  it('onPress is triggered when the element is pressed', () => {
    let pressed = 0;
    const host = pressable({
      onPress: () => (pressed += 1),
      style: { height: 100 },
    });

    dispatchEvent(host?.tag ?? 0, 'click', {});

    expect(pressed).toBe(1);
  });

  it('a disabled Pressable cannot be pressed', () => {
    let pressed = 0;
    const host = pressable({ onPress: () => (pressed += 1), disabled: true });

    dispatchEvent(host?.tag ?? 0, 'change', { value: true });

    expect(pressed).toBe(0);
  });

  it('calls onFocus and onBlur on the focus events', () => {
    const calls: string[] = [];
    const host = pressable({
      onFocus: () => calls.push('focus'),
      onBlur: () => calls.push('blur'),
    });

    dispatchEvent(host?.tag ?? 0, 'focus', {});
    dispatchEvent(host?.tag ?? 0, 'blur', {});

    expect(calls).toEqual(['focus', 'blur']);
  });

  it('adds children to the component', () => {
    const host = pressable(
      {},
      createElement('text', null, 'the quick brown fox'),
    );

    expect(sortKeys({ ...host?.props })).toEqual(sortKeys(IDLE));
    expect(host?.children.map(child => child.viewName)).toEqual(['Paragraph']);
    expect(sortKeys({ ...host?.children[0]?.props })).toEqual(
      sortKeys({
        allowFontScaling: 'true',
        ellipsizeMode: 'tail',
        fontSize: 'NaN',
        fontSizeMultiplier: 'NaN',
        foregroundColor: 'rgba(0, 0, 0, 0)',
        overflow: 'hidden',
      }),
    );
  });
});

// `Pressable-test` держит это снимками, здесь тот же вход читается со смонтированного дерева
describe('<Pressable disabled> accessibilityState', () => {
  beforeEach(() => createRoot(200, 200));

  const stateOf = (props: IProps) => pressable(props)?.props.accessibilityState;

  it('is disabled when disabled is true', () => {
    expect(stateOf({ disabled: true })).toBe(
      '{disabled:true,selected:false,checked:None,busy:false,expanded:null}',
    );
  });

  it('is disabled when disabled is true and accessibilityState is empty', () => {
    expect(stateOf({ disabled: true, accessibilityState: {} })).toBe(
      '{disabled:true,selected:false,checked:None,busy:false,expanded:null}',
    );
  });

  it('keeps accessibilityState when disabled is true', () => {
    const state = stateOf({
      disabled: true,
      accessibilityState: { checked: true },
    });

    expect(state).toBe(
      '{disabled:true,selected:false,checked:Checked,busy:false,expanded:null}',
    );
  });

  it('overwrites accessibilityState with the value of the disabled prop', () => {
    const state = stateOf({
      disabled: true,
      accessibilityState: { disabled: false },
    });

    expect(state).toBe(
      '{disabled:true,selected:false,checked:None,busy:false,expanded:null}',
    );
  });
});

function readPressable(props: IProps): IMountedProps {
  return { ...pressable(props)?.props };
}

accessibilityPropsSuite(readPressable);

report();
