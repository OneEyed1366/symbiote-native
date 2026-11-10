// Порт `Modal-itest` (Fantom гоняет его на Android), пропсы читаем со смонтированного дерева
// Не портируем: `ref` с `ReactNativeElement` и тегом `RN:ModalHostView` (DOM API)

import { createElement } from 'react';

import { Modal } from '@symbiote-native/react';

import { createRoot, render } from './culling-fixture';
import { beforeEach, describe, expect, it, mounted, report } from './harness';

type IProps = Record<string, unknown>;

// Порядок ключей в mounted props не контракт, а `toEqual` сравнивает сериализацию
function sortKeys(props: IProps): IProps {
  const entries = Object.entries(props);
  entries.sort(([left], [right]) => (left < right ? -1 : 1));
  return Object.fromEntries(entries);
}

function mountedModal(props: IProps) {
  render(createElement(Modal, props));
  const [host, ...rest] = mounted().children;
  expect(rest.length).toBe(0);
  // Fabric drops the `RCT` prefix, and the guard bans the iOS spelling in a quoted literal
  expect(host?.viewName.endsWith('HostView')).toBe(true);
  expect(host?.children.map(child => child.viewName)).toEqual(['View']);
  return host;
}

// Как `getRenderedOutput({props})`: только перечисленные пропсы хоста
function hostProps(props: IProps, names: readonly string[]): IProps {
  const kept = Object.entries({ ...mountedModal(props)?.props }).filter(
    ([key]) => names.includes(key),
  );
  return sortKeys(Object.fromEntries(kept));
}

const DEFAULT_CHILD = {
  backgroundColor: 'rgba(255, 255, 255, 1)',
  flex: '1',
  left: '0',
  top: '0',
};

describe('<Modal> props', () => {
  beforeEach(() => createRoot(200, 200));

  it('renders a Modal with the default values when no props are passed', () => {
    const host = mountedModal({});

    expect(sortKeys({ ...host?.props })).toEqual({
      positionType: 'absolute',
      visible: 'true',
    });
    expect(sortKeys({ ...host?.children[0]?.props })).toEqual(DEFAULT_CHILD);
  });

  it('renders a Modal with animationType="none" by default', () => {
    expect(hostProps({ animationType: 'none' }, ['animationType'])).toEqual({});
  });

  for (const animationType of ['slide', 'fade']) {
    it(`renders a Modal with animationType="${animationType}"`, () => {
      expect(hostProps({ animationType }, ['animationType'])).toEqual({
        animationType,
      });
    });
  }

  it('renders a Modal with presentationStyle="fullScreen" by default', () => {
    const props = hostProps({ presentationStyle: 'fullScreen' }, [
      'presentationStyle',
    ]);

    expect(props).toEqual({});
  });

  for (const presentationStyle of [
    'pageSheet',
    'formSheet',
    'overFullScreen',
  ]) {
    it(`renders a Modal with presentationStyle="${presentationStyle}"`, () => {
      expect(hostProps({ presentationStyle }, ['presentationStyle'])).toEqual({
        presentationStyle,
      });
    });
  }

  it('renders a Modal with transparent="true"', () => {
    const props = hostProps({ transparent: true }, [
      'transparent',
      'presentationStyle',
    ]);

    expect(props).toEqual({
      presentationStyle: 'overFullScreen',
      transparent: 'true',
    });
  });

  it('renders a Modal with transparent="false"', () => {
    expect(
      hostProps({ transparent: false }, ['transparent', 'presentationStyle']),
    ).toEqual({});
  });

  it('renders a Modal with statusBarTranslucent="true"', () => {
    expect(
      hostProps({ statusBarTranslucent: true }, ['statusBarTranslucent']),
    ).toEqual({ statusBarTranslucent: 'true' });
  });

  it('renders a Modal with statusBarTranslucent="false"', () => {
    expect(
      hostProps({ statusBarTranslucent: false }, ['statusBarTranslucent']),
    ).toEqual({});
  });

  it('renders a Modal with navigationBarTranslucent="true" and statusBarTranslucent="true"', () => {
    const props = hostProps(
      { navigationBarTranslucent: true, statusBarTranslucent: true },
      ['navigationBarTranslucent', 'statusBarTranslucent'],
    );

    expect(props).toEqual({
      navigationBarTranslucent: 'true',
      statusBarTranslucent: 'true',
    });
  });

  it('renders a Modal with navigationBarTranslucent="false"', () => {
    const props = hostProps({ navigationBarTranslucent: false }, [
      'navigationBarTranslucent',
      'statusBarTranslucent',
    ]);

    expect(props).toEqual({});
  });

  it('renders a Modal with hardwareAccelerated="true"', () => {
    expect(
      hostProps({ hardwareAccelerated: true }, ['hardwareAccelerated']),
    ).toEqual({ hardwareAccelerated: 'true' });
  });

  it('renders a Modal with hardwareAccelerated="false"', () => {
    expect(
      hostProps({ hardwareAccelerated: false }, ['hardwareAccelerated']),
    ).toEqual({});
  });

  it('renders a Modal with visible="true"', () => {
    expect(hostProps({ visible: true }, ['visible'])).toEqual({
      visible: 'true',
    });
  });

  it('renders nothing when visible="false"', () => {
    render(createElement(Modal, { visible: false }));

    expect(mounted().children.length).toBe(0);
  });

  it('renders a Modal with allowSwipeDismissal="true"', () => {
    expect(
      hostProps({ allowSwipeDismissal: true }, ['allowSwipeDismissal']),
    ).toEqual({ allowSwipeDismissal: 'true' });
  });

  it('renders a Modal with allowSwipeDismissal="false"', () => {
    expect(
      hostProps({ allowSwipeDismissal: false }, ['allowSwipeDismissal']),
    ).toEqual({});
  });

  // RN ignores the deprecated `animated`, `animationType` replaces it
  for (const animated of [true, false]) {
    it(`[DEPRECATED] renders a Modal with animated="${animated}"`, () => {
      expect(hostProps({ animated }, ['animated'])).toEqual({});
    });
  }
});

report();
