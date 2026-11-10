// Порт `TouchableHighlight-itest` (Fantom гоняет его на Android), пропсы со смонтированного дерева
// Не портируем `ref` с `ReactNativeElement` (DOM API)

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
  type IMountedView,
} from './harness';

type IProps = Record<string, unknown>;

const DISABLED_STATE =
  '{disabled:true,selected:false,checked:None,busy:false,expanded:null}';

function pick(view: IMountedView | undefined, names: string[]): IProps {
  return Object.fromEntries(
    Object.entries({ ...view?.props }).filter(([key]) => names.includes(key)),
  );
}

function highlight(props: IProps, ...children: unknown[]): IMountedView {
  const child = children.length > 0 ? children : [createElement('view', null)];
  render(createElement('touchable-highlight', props, ...child));
  const [host, ...rest] = mounted().children;
  expect(rest.length).toBe(0);
  if (host === undefined) throw new Error('no touchable-highlight mounted');
  return host;
}

describe('<TouchableHighlight> props', () => {
  beforeEach(() => createRoot(200, 200));

  it('renders as a view with accessible="true"', () => {
    const host = highlight({});

    expect(host.viewName).toBe('View');
    expect(pick(host, ['accessible'])).toEqual({ accessible: 'true' });
  });

  it('applies style props', () => {
    const host = highlight({
      style: { width: 100, height: 50, backgroundColor: 'blue' },
    });

    expect(pick(host, ['backgroundColor']).backgroundColor).toBe(
      'rgba(0, 0, 255, 1)',
    );
    expect(host.props.height).toBe('50');
    expect(host.props.width).toBe('100');
  });

  it('does not render explicit opacity when using default activeOpacity', () => {
    expect(pick(highlight({}), ['opacity'])).toEqual({});
  });

  it('renders with custom style opacity', () => {
    expect(pick(highlight({ style: { opacity: 0.5 } }), ['opacity'])).toEqual({
      opacity: '0.5',
    });
  });

  // RN dims a child View under a container, ours paints the same two halves on two nodes
  it('applies default activeOpacity (0.85) to the child when pressed', () => {
    const host = highlight({ testOnly_pressed: true });

    expect(pick(host.children[0], ['opacity'])).toEqual({ opacity: '0.85' });
  });

  it('applies custom activeOpacity to the child when pressed', () => {
    const host = highlight({ testOnly_pressed: true, activeOpacity: 0.5 });

    expect(pick(host.children[0], ['opacity'])).toEqual({ opacity: '0.5' });
  });

  it('renders default underlay color (black) when pressed', () => {
    const host = highlight({ testOnly_pressed: true });

    expect(pick(host, ['backgroundColor'])).toEqual({
      backgroundColor: 'rgba(0, 0, 0, 1)',
    });
    expect(pick(host.children[0], ['backgroundColor'])).toEqual({});
  });

  it('renders custom underlay color when pressed', () => {
    const host = highlight({ testOnly_pressed: true, underlayColor: 'red' });

    expect(pick(host, ['backgroundColor'])).toEqual({
      backgroundColor: 'rgba(255, 0, 0, 1)',
    });
  });

  it('triggers onPress when the element is pressed', () => {
    let pressed = 0;
    const host = highlight({
      onPress: () => (pressed += 1),
      style: { height: 100 },
    });

    dispatchEvent(host.tag, 'click', {});

    expect(pressed).toBe(1);
  });

  it('triggers onShowUnderlay when pressed', () => {
    let shown = 0;
    const host = highlight({
      onPress: () => {},
      onShowUnderlay: () => (shown += 1),
      style: { height: 100 },
    });

    dispatchEvent(host.tag, 'click', {});

    expect(shown).toBe(1);
  });

  it('cannot be pressed when disabled', () => {
    let pressed = 0;
    const host = highlight({ onPress: () => (pressed += 1), disabled: true });

    dispatchEvent(host.tag, 'click', {});

    expect(pressed).toBe(0);
  });

  it('renders children inside the touchable', () => {
    const host = highlight({}, createElement('text', null, 'Press me'));

    expect(pick(host, ['accessible'])).toEqual({ accessible: 'true' });
    expect(host.children.map(child => child.viewName)).toEqual(['Paragraph']);
  });
});

describe('<TouchableHighlight disabled> accessibilityState', () => {
  beforeEach(() => createRoot(200, 200));

  const stateOf = (props: IProps) => highlight(props).props.accessibilityState;

  it('sets accessibilityState disabled to true', () => {
    expect(stateOf({ disabled: true })).toBe(DISABLED_STATE);
  });

  it('sets accessibilityState disabled when accessibilityState is empty', () => {
    expect(stateOf({ disabled: true, accessibilityState: {} })).toBe(
      DISABLED_STATE,
    );
  });

  it('preserves accessibilityState values when disabled is true', () => {
    expect(
      stateOf({ disabled: true, accessibilityState: { checked: true } }),
    ).toBe(
      '{disabled:true,selected:false,checked:Checked,busy:false,expanded:null}',
    );
  });

  it('overwrites accessibilityState disabled with the disabled prop', () => {
    expect(
      stateOf({ disabled: true, accessibilityState: { disabled: false } }),
    ).toBe(DISABLED_STATE);
  });

  it('disables when only accessibilityState disabled is set', () => {
    let pressed = 0;
    const host = highlight({
      onPress: () => (pressed += 1),
      accessibilityState: { disabled: true },
    });

    expect(host.props.accessibilityState).toBe(DISABLED_STATE);

    dispatchEvent(host.tag, 'click', {});

    expect(pressed).toBe(0);
  });
});

function readHighlight(props: IProps): IMountedProps {
  return {
    ...highlight(props, createElement('text', null, 'Touchable')).props,
  };
}

accessibilityPropsSuite(readHighlight);

report();
