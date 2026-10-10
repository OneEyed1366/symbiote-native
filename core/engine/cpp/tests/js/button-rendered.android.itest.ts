// Порт `Button-itest` (Fantom гоняет его на Android), цвета читаем со смонтированного дерева

import { createElement } from 'react';

import { createRoot, render } from './culling-fixture';
import {
  beforeEach,
  committedTexts,
  describe,
  dispatchEvent,
  expect,
  it,
  mounted,
  report,
} from './harness';

const BLUE = 'rgba(33, 150, 243, 1)';
const WHITE = 'rgba(255, 255, 255, 1)';
const DISABLED_BACKGROUND = 'rgba(223, 223, 223, 1)';
const DISABLED_FOREGROUND = 'rgba(161, 161, 161, 1)';

function renderButton(props: Record<string, unknown>) {
  render(createElement('button', { title: 'Hello', ...props }));
  const [button, ...rest] = mounted().children;
  expect(rest.length).toBe(0);
  expect(button?.viewName).toBe('View');
  expect(button?.children.map(child => child.viewName)).toEqual(['Paragraph']);
  return {
    background: button?.props.backgroundColor,
    foreground: button?.children[0]?.props.foregroundColor,
    press: () => dispatchEvent(button?.tag ?? 0, 'click', {}),
  };
}

function counter() {
  const calls: unknown[] = [];
  return { calls, onPress: () => calls.push(true) };
}

describe('<Button> props', () => {
  beforeEach(() => createRoot(200, 200));

  it('sets the text of the button, upper case on Android', () => {
    const shown = renderButton({});

    expect(shown.background).toBe(BLUE);
    expect(shown.foreground).toBe(WHITE);
    expect(committedTexts()).toEqual(['HELLO']);
  });

  it('sets the background color of the button (non-iOS)', () => {
    const shown = renderButton({ color: 'blue' });

    expect(shown.background).toBe('rgba(0, 0, 255, 1)');
    expect(shown.foreground).toBe(WHITE);
  });

  it('calls onPress when the button is pressed', () => {
    const { calls, onPress } = counter();
    const shown = renderButton({ onPress });
    expect(calls.length).toBe(0);

    shown.press();

    expect(calls.length).toBe(1);
  });

  it('sets different default colors when disabled', () => {
    const shown = renderButton({ disabled: true });

    expect(shown.background).toBe(DISABLED_BACKGROUND);
    expect(shown.foreground).toBe(DISABLED_FOREGROUND);
  });

  it('prevents onPress when disabled', () => {
    const { calls, onPress } = counter();

    renderButton({ disabled: true, onPress }).press();

    expect(calls.length).toBe(0);
  });

  it('lets disabled=true take precedence over accessibilityState false', () => {
    const { calls, onPress } = counter();

    renderButton({
      disabled: true,
      accessibilityState: { disabled: false },
      onPress,
    }).press();

    expect(calls.length).toBe(0);
  });

  it('lets disabled=false take precedence over accessibilityState true', () => {
    const { calls, onPress } = counter();
    const shown = renderButton({
      disabled: false,
      accessibilityState: { disabled: true },
      onPress,
    });
    expect(shown.background).toBe(BLUE);
    expect(shown.foreground).toBe(WHITE);
    expect(calls.length).toBe(0);

    shown.press();

    expect(calls.length).toBe(1);
  });

  it('disables from accessibilityState when disabled is not set', () => {
    const { calls, onPress } = counter();
    const shown = renderButton({
      accessibilityState: { disabled: true },
      onPress,
    });
    expect(shown.background).toBe(DISABLED_BACKGROUND);
    expect(shown.foreground).toBe(DISABLED_FOREGROUND);

    shown.press();

    expect(calls.length).toBe(0);
  });
});

report();
