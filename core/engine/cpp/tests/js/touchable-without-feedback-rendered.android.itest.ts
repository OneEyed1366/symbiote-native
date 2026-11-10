// Порт `TouchableWithoutFeedback-itest` (Fantom гоняет его на Android), пропсы с дерева
// Не портируем `ref` с тегами `RN:Paragraph` и `RN:View` (DOM API)

import { createElement } from 'react';

import {
  accessibilityPropsSuite,
  type IMountedProps,
} from './accessibility-props-suite';
import { createRoot, render } from './culling-fixture';
import { beforeEach, describe, expect, it, mounted, report } from './harness';

type IProps = Record<string, unknown>;

function touchable(props: IProps, child: unknown) {
  render(createElement('touchable-without-feedback', props, child));
  const [host, ...rest] = mounted().children;
  expect(rest.length).toBe(0);
  return host;
}

describe('<TouchableWithoutFeedback> props', () => {
  beforeEach(() => createRoot(200, 200));

  it('renders the child as the host and marks it pressable', () => {
    const host = touchable({}, createElement('text', null, 'Touchable'));

    expect(host?.viewName).toBe('Paragraph');
    expect(host?.props.isPressable).toBe('true');
  });

  // `Text.js` sees the cloned responder handler, so the child is announced as a link
  it('gives a text child the link role unless it is disabled or has a role', () => {
    const label = createElement('text', null, 'Touchable');
    // A fresh root per case, Fabric keeps a vanished `accessibilityRole` on a re-render
    const fresh = (props: IProps) => {
      createRoot(200, 200);
      return touchable(props, label)?.props;
    };

    expect(fresh({}).accessibilityRole).toBe('link');
    expect(fresh({ accessibilityRole: 'button' }).accessibilityRole).toBe(
      'button',
    );
    expect(fresh({ disabled: true }).accessibilityRole).toBe(undefined);
    expect(fresh({ disabled: true }).isPressable).toBe(undefined);
  });

  it('is backed by its child', () => {
    expect(
      touchable({}, createElement('text', null, 'Touchable'))?.viewName,
    ).toBe('Paragraph');
    expect(
      touchable(
        {},
        createElement('view', null, createElement('text', null, 'Touchable')),
      )?.viewName,
    ).toBe('View');
  });
});

// `TouchableWithoutFeedback-test` держит это снимками, здесь тот же вход читается с дерева
describe('<TouchableWithoutFeedback> disabled state on the child', () => {
  beforeEach(() => createRoot(200, 200));

  const DISABLED =
    '{disabled:true,selected:false,checked:None,busy:false,expanded:null}';
  const stateOf = (props: IProps) =>
    touchable(props, createElement('view', null))?.props.accessibilityState;

  it('is disabled when disabled is true', () => {
    expect(stateOf({ disabled: true })).toBe(DISABLED);
  });

  it('is disabled when disabled is true and accessibilityState is empty', () => {
    expect(stateOf({ disabled: true, accessibilityState: {} })).toBe(DISABLED);
  });

  it('keeps accessibilityState when disabled is true', () => {
    expect(
      stateOf({ disabled: true, accessibilityState: { checked: true } }),
    ).toBe(
      '{disabled:true,selected:false,checked:Checked,busy:false,expanded:null}',
    );
  });

  it('overwrites accessibilityState with the value of disabled', () => {
    expect(
      stateOf({ disabled: true, accessibilityState: { disabled: false } }),
    ).toBe(DISABLED);
  });

  it('is disabled when only accessibilityState says so', () => {
    expect(stateOf({ accessibilityState: { disabled: true } })).toBe(DISABLED);
  });

  it('is not focusable', () => {
    expect(touchable({}, createElement('view', null))?.props.focusable).toBe(
      undefined,
    );
  });
});

function readTouchable(props: IProps): IMountedProps {
  return {
    ...touchable(props, createElement('text', null, 'Touchable'))?.props,
  };
}

accessibilityPropsSuite(readTouchable);

report();
