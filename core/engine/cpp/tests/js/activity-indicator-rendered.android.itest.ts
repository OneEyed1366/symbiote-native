// Порт `ActivityIndicator-itest` (Fantom гоняет его на Android): без стиля обёртка схлопывается
// Кейсы `ref` читают `ReactNativeElement`, DOM API вне scope

import { createElement } from 'react';

import { createRoot, render } from './culling-fixture';
import { beforeEach, describe, expect, it, mounted, report } from './harness';

const SPINNER = 'AndroidProgressBar';

function renderIndicator(props: Record<string, unknown> = {}) {
  render(createElement('activity-indicator', props));
  return mounted().children;
}

function expectBareSpinner(size: number, props: Record<string, unknown> = {}) {
  const [only, ...rest] = renderIndicator(props);
  expect(rest.length).toBe(0);
  expect(only?.viewName).toBe(SPINNER);
  expect(only?.layout.width).toBe(size);
  expect(only?.layout.height).toBe(size);
}

describe('<ActivityIndicator> props', () => {
  beforeEach(() => createRoot(200, 200));

  it('defaults to "small" (20x20)', () => {
    expectBareSpinner(20);
  });

  it('renders with size "small"', () => {
    expectBareSpinner(20, { size: 'small' });
  });

  it('renders with size "large" (36x36)', () => {
    expectBareSpinner(36, { size: 'large' });
  });

  it('renders with numeric size on Android', () => {
    expectBareSpinner(48, { size: 48 });
  });

  it('renders an AndroidProgressBar when color is set', () => {
    expectBareSpinner(20, { color: 'red' });
  });

  it('defaults animating to true', () => {
    expectBareSpinner(20);
  });

  it('renders when animating is false', () => {
    expectBareSpinner(20, { animating: false });
  });

  it('applies the wrapper View style', () => {
    const [wrapper, ...rest] = renderIndicator({ style: { opacity: 0.5 } });

    expect(rest.length).toBe(0);
    expect(wrapper?.viewName).toBe('View');
    expect(wrapper?.props.opacity).toBe('0.5');
    expect(wrapper?.children.map(child => child.viewName)).toEqual([SPINNER]);
  });

  it('propagates accessibilityLabel to the native component', () => {
    const [only] = renderIndicator({ accessibilityLabel: 'Loading content' });

    expect(only?.viewName).toBe(SPINNER);
    expect(only?.props.accessibilityLabel).toBe('Loading content');
  });

  it('propagates testID to the native component', () => {
    const [only] = renderIndicator({ testID: 'loading-spinner' });

    expect(only?.viewName).toBe(SPINNER);
    expect(only?.props.testID).toBe('loading-spinner');
  });
});

report();
