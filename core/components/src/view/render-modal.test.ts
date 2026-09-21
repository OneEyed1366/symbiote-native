// Co-located unit test for renderModal's structural output. Expectations come from RN's
// Modal.js + Modal-itest.js (the Fabric structural snapshot), not from reading this file's own
// code back: default position:absolute host style, the container's flex/backdrop composition,
// and the transparent-flips-presentationStyle-default rule are all asserted against those.
//
// No Negative group: renderModal never throws — an absent field just resolves to a default.

import { describe, expect, it } from 'vitest';
import { renderModal, type IModalViewProps } from './render-modal';

function baseProps(over: Partial<IModalViewProps> = {}): IModalViewProps {
  return { passthrough: {}, ...over };
}

describe('renderModal — default shape (RN Modal-itest.js "default values")', () => {
  it('paints an absolutely-positioned modal host wrapping a flex-filling white container', () => {
    const descriptor = renderModal(baseProps());

    expect(descriptor.type).toBe('modal');
    expect(descriptor.props.style).toEqual({ position: 'absolute' });
    expect(descriptor.children).toHaveLength(1);

    const container = descriptor.children[0];
    expect(container).not.toBe(undefined);
    if (typeof container === 'string' || container === undefined)
      throw new Error('expected an element child');
    expect(container.type).toBe('view');
    expect(container.props.collapsable).toBe(false);
    expect(container.props.style).toEqual([
      { left: 0, top: 0, flex: 1, backgroundColor: 'white' },
      undefined,
      {},
    ]);
  });

  it('defaults animationType to "none" and presentationStyle to "fullScreen" when neither is given', () => {
    const descriptor = renderModal(baseProps());
    expect(descriptor.props.animationType).toBe('none');
    expect(descriptor.props.presentationStyle).toBe('fullScreen');
  });
});

describe('renderModal — transparent flips the presentationStyle default (RN Modal.js)', () => {
  it('resolves presentationStyle to overFullScreen and the backdrop to transparent when transparent is true', () => {
    const descriptor = renderModal(baseProps({ transparent: true }));
    expect(descriptor.props.presentationStyle).toBe('overFullScreen');
    expect(descriptor.props.transparent).toBe(true);

    const container = descriptor.children[0];
    if (typeof container === 'string' || container === undefined)
      throw new Error('expected an element child');
    expect(container.props.style).toEqual([
      { left: 0, top: 0, flex: 1, backgroundColor: 'white' },
      undefined,
      { backgroundColor: 'transparent' },
    ]);
  });

  it('does not flip presentationStyle from a backdropColor alone — only `transparent` decides the default', () => {
    const descriptor = renderModal(baseProps({ backdropColor: 'red' }));
    expect(descriptor.props.presentationStyle).toBe('fullScreen');

    const container = descriptor.children[0];
    if (typeof container === 'string' || container === undefined)
      throw new Error('expected an element child');
    expect(container.props.style).toEqual([
      { left: 0, top: 0, flex: 1, backgroundColor: 'white' },
      undefined,
      { backgroundColor: 'red' },
    ]);
  });

  it('lets an explicit presentationStyle win over the transparent-based default', () => {
    const descriptor = renderModal(
      baseProps({ transparent: true, presentationStyle: 'pageSheet' }),
    );
    expect(descriptor.props.presentationStyle).toBe('pageSheet');
  });
});

describe('renderModal — passthrough and explicit fields', () => {
  it('spreads passthrough onto the host, and lets an explicit field win over a same-named passthrough key', () => {
    const descriptor = renderModal(
      baseProps({
        visible: true,
        passthrough: { testID: 'my-modal', visible: 'should-be-overridden' },
      }),
    );
    expect(descriptor.props.testID).toBe('my-modal');
    expect(descriptor.props.visible).toBe(true);
  });

  it('forwards an explicit non-default animationType verbatim', () => {
    const descriptor = renderModal(baseProps({ animationType: 'slide' }));
    expect(descriptor.props.animationType).toBe('slide');
  });

  it('forwards the platform-only props (RN Modal-itest.js "props") by name, undefined when omitted', () => {
    const withPlatformProps = renderModal(
      baseProps({
        supportedOrientations: ['portrait'],
        hardwareAccelerated: true,
        statusBarTranslucent: true,
        navigationBarTranslucent: true,
        allowSwipeDismissal: true,
      }),
    );
    expect(withPlatformProps.props.supportedOrientations).toEqual(['portrait']);
    expect(withPlatformProps.props.hardwareAccelerated).toBe(true);
    expect(withPlatformProps.props.statusBarTranslucent).toBe(true);
    expect(withPlatformProps.props.navigationBarTranslucent).toBe(true);
    expect(withPlatformProps.props.allowSwipeDismissal).toBe(true);

    const withoutThem = renderModal(baseProps());
    expect(withoutThem.props.supportedOrientations).toBe(undefined);
    expect(withoutThem.props.hardwareAccelerated).toBe(undefined);
  });
});

const BASE_VIEW: IModalViewProps = { passthrough: {} };

function containerBaseStyle(isRTL?: boolean): Record<string, unknown> {
  const root = renderModal(BASE_VIEW, isRTL);
  const [container] = root.children;
  if (typeof container === 'string') throw new Error('container is text');
  const style = container.props.style;
  if (!Array.isArray(style)) throw new Error('container style is not an array');
  const [base] = style as readonly unknown[];
  if (typeof base !== 'object' || base === null)
    throw new Error('container base style is not an object');
  return base as Record<string, unknown>;
}

describe('renderModal container side (Positive — Modal.js:372)', () => {
  // why: `const side = I18nManager.getConstants().isRTL ? 'right' : 'left'` — vendor pins the
  // container to the edge matching the layout direction, not always the left.
  it('pins the container to the left outside RTL', () => {
    const base = containerBaseStyle(false);
    expect(base.left).toBe(0);
    expect(base).not.toHaveProperty('right');
  });

  it('pins the container to the right under RTL', () => {
    const base = containerBaseStyle(true);
    expect(base.right).toBe(0);
    expect(base).not.toHaveProperty('left');
  });

  it('defaults to the real I18nManager reading when isRTL is not passed', () => {
    // The headless I18nManager module resolves to its DEFAULT_CONSTANTS (isRTL: false) with no
    // native module linked, so the default parameter must match the left-pinned case.
    const base = containerBaseStyle();
    expect(base.left).toBe(0);
  });
});
