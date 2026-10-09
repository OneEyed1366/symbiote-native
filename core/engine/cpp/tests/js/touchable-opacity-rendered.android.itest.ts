// Порт `TouchableOpacity-itest` (Fantom гоняет его на Android), пропсы со смонтированного дерева
// Не портируем `ref` с `ReactNativeElement` и тегом `RN:View` (DOM API)

import { createElement } from 'react';

import { createRoot, render } from './culling-fixture';
import {
  beforeEach,
  describe,
  dispatchEvent,
  expect,
  it,
  mounted,
  report,
  type IMountedView,
} from './harness';

type IProps = Record<string, unknown>;

function pick(view: IMountedView | undefined, names: string[]): IProps {
  return Object.fromEntries(
    Object.entries({ ...view?.props }).filter(([key]) => names.includes(key)),
  );
}

function opacity(props: IProps, ...children: unknown[]): IMountedView {
  render(createElement('touchable-opacity', props, ...children));
  const [host, ...rest] = mounted().children;
  expect(rest.length).toBe(0);
  if (host === undefined) throw new Error('no touchable-opacity mounted');
  return host;
}

describe('<TouchableOpacity> props', () => {
  beforeEach(() => createRoot(200, 200));

  it('renders as a view with accessible="true"', () => {
    const host = opacity({});

    expect(host.viewName).toBe('View');
    expect(pick(host, ['accessible'])).toEqual({ accessible: 'true' });
  });

  it('applies style props', () => {
    const host = opacity({
      style: { width: 100, height: 50, backgroundColor: 'blue' },
    });

    expect(host.props.backgroundColor).toBe('rgba(0, 0, 255, 1)');
    expect(host.props.height).toBe('50');
    expect(host.props.width).toBe('100');
  });

  it('does not render explicit opacity when using default', () => {
    expect(pick(opacity({}), ['opacity'])).toEqual({});
  });

  it('renders with custom style opacity', () => {
    expect(pick(opacity({ style: { opacity: 0.5 } }), ['opacity'])).toEqual({
      opacity: '0.5',
    });
  });

  it('triggers onPress when the element is pressed', () => {
    let pressed = 0;
    const host = opacity({
      onPress: () => (pressed += 1),
      style: { height: 100 },
    });

    dispatchEvent(host.tag, 'click', {});

    expect(pressed).toBe(1);
  });

  it('cannot be pressed when disabled', () => {
    let pressed = 0;
    const host = opacity({ onPress: () => (pressed += 1), disabled: true });

    dispatchEvent(host.tag, 'click', {});

    expect(pressed).toBe(0);
  });

  it('sets accessibilityState disabled to true', () => {
    expect(opacity({ disabled: true }).props.accessibilityState).toBe(
      '{disabled:true,selected:false,checked:None,busy:false,expanded:null}',
    );
  });

  it('is disabled when only accessibilityState says so', () => {
    let pressed = 0;
    const host = opacity({
      onPress: () => (pressed += 1),
      accessibilityState: { disabled: true },
    });

    expect(host.props.accessibilityState).toBe(
      '{disabled:true,selected:false,checked:None,busy:false,expanded:null}',
    );

    dispatchEvent(host.tag, 'click', {});

    expect(pressed).toBe(0);
  });

  it('renders children inside the touchable', () => {
    const host = opacity({}, createElement('text', null, 'Press me'));

    expect(host.children.length).toBe(1);
    expect(pick(host, ['accessible'])).toEqual({ accessible: 'true' });
    expect(host.children.map(child => child.viewName)).toEqual(['Paragraph']);
  });
});

report();
