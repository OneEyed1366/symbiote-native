// @symbiote-platform-extensions
// Порт `Pressability-itest` (Fantom гоняет его на Android), хук над настоящим тестером
// Не портируем `ref` с `ReactNativeElement` (DOM API), узел берём из смонтированного дерева

// Первым: заглушки модулей RN должны стоять до того, как что-то из RN начнёт загружаться
import './stock-renderer';
import { createElement } from 'react';

import { setPressabilityLoader } from '@symbiote-native/engine';
import {
  usePressability,
  type IPressabilityConfig,
} from '@symbiote-native/react';

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

// `require` after the import: the fakes `./stock-renderer` sets must stand before RN's modules load
/* eslint-disable @typescript-eslint/no-require-imports */
const Pressability =
  require('react-native/Libraries/Pressability/Pressability').default;
/* eslint-enable @typescript-eslint/no-require-imports */

// What `bootstrapHost` does on a device: RN's own class, not a stand-in
setPressabilityLoader(() => Pressability);

function PressabilityTestView(props: { config: IPressabilityConfig }) {
  const handlers = usePressability(props.config);
  return createElement('view', { style: { height: 100 }, ...handlers });
}

function mountView(config: IPressabilityConfig): number {
  render(createElement(PressabilityTestView, { config }));
  return mounted().children[0]?.tag ?? 0;
}

describe('usePressability', () => {
  beforeEach(() => createRoot(200, 200));

  it('fires onPress callback on click event', () => {
    let pressed = 0;
    const tag = mountView({ onPress: () => (pressed += 1) });

    dispatchEvent(tag, 'click', {});

    expect(pressed).toBe(1);
  });

  it('does not fire onPress when disabled is true', () => {
    let pressed = 0;
    const tag = mountView({ onPress: () => (pressed += 1), disabled: true });

    dispatchEvent(tag, 'click', {});

    expect(pressed).toBe(0);
  });

  it('fires onPress after re-enabling (disabled true to false)', () => {
    let pressed = 0;
    const onPress = () => (pressed += 1);
    const tag = mountView({ onPress, disabled: true });
    dispatchEvent(tag, 'click', {});
    expect(pressed).toBe(0);

    render(
      createElement(PressabilityTestView, {
        config: { onPress, disabled: false },
      }),
    );
    dispatchEvent(tag, 'click', {});

    expect(pressed).toBe(1);
  });

  it('fires onFocus callback on focus event', () => {
    let focused = 0;
    const tag = mountView({ onFocus: () => (focused += 1) });
    expect(focused).toBe(0);

    dispatchEvent(tag, 'focus', {});

    expect(focused).toBe(1);
  });

  it('fires onBlur callback on blur event', () => {
    let blurred = 0;
    const tag = mountView({ onBlur: () => (blurred += 1) });
    expect(blurred).toBe(0);

    dispatchEvent(tag, 'blur', {});

    expect(blurred).toBe(1);
  });

  it('uses updated callbacks after re-render with new config', () => {
    let first = 0;
    let second = 0;
    const tag = mountView({ onPress: () => (first += 1) });
    dispatchEvent(tag, 'click', {});
    expect([first, second]).toEqual([1, 0]);

    render(
      createElement(PressabilityTestView, {
        config: { onPress: () => (second += 1) },
      }),
    );
    dispatchEvent(tag, 'click', {});

    expect([first, second]).toEqual([1, 1]);
  });

  it('does not fire callbacks after component unmounts', () => {
    let pressed = 0;
    const tag = mountView({ onPress: () => (pressed += 1) });
    dispatchEvent(tag, 'click', {});
    expect(pressed).toBe(1);

    render(createElement('view', null));

    expect(mounted().children.length).toBe(0);
    expect(pressed).toBe(1);
  });
});

report();
