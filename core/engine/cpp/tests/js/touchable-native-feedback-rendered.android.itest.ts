// `TouchableNativeFeedback-test`: снимки RN читаем с дерева, ряд про `disabled`
// Только Android, на iOS `getBackgroundProp` ничего не пишет

import { createElement } from 'react';

import { createRoot, render } from './culling-fixture';
import { beforeEach, describe, expect, it, mounted, report } from './harness';

type IProps = Record<string, unknown>;

const DISABLED =
  '{disabled:true,selected:false,checked:None,busy:false,expanded:null}';
const ENABLED =
  '{disabled:false,selected:false,checked:None,busy:false,expanded:null}';

function feedback(props: IProps, child = createElement('view', null)) {
  render(createElement('touchable-native-feedback', props, child));
  const [host, ...rest] = mounted().children;
  expect(rest.length).toBe(0);
  return host;
}

describe('<TouchableNativeFeedback> on the child', () => {
  beforeEach(() => createRoot(200, 200));

  const stateOf = (props: IProps) => feedback(props)?.props.accessibilityState;

  it('renders the child as the host, accessible and not focusable', () => {
    const host = feedback({});

    expect(host?.viewName).toBe('View');
    expect(host?.props.accessible).toBe('true');
    expect(host?.props.focusable).toBe(undefined);
  });

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

  it('overwrites accessibilityState with disabled: true', () => {
    expect(
      stateOf({ disabled: true, accessibilityState: { disabled: false } }),
    ).toBe(DISABLED);
  });

  it('overwrites accessibilityState with disabled: false', () => {
    expect(
      stateOf({ disabled: false, accessibilityState: { disabled: true } }),
    ).toBe(ENABLED);
  });

  it('marks a text child as pressable', () => {
    const host = feedback({}, createElement('text', null, 'Touchable'));

    expect(host?.props.isPressable).toBe('true');
  });
});

report();
