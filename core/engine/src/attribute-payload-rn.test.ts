// Порт `ReactNativeAttributePayload-test` на payload, который коммитит движок
// Кейс: применить `prev`, коммит, применить `next`, коммит, сброшенный ключ отсутствует или null

import { afterEach, describe, expect, it } from 'vitest';
import { installRecordingFabric, payloadOf } from '@symbiote-native/test-utils';
import { createElement, createSurface, routeProp } from './index';

const fabric = installRecordingFabric();
let nextRootTag = 9_900;

afterEach(() => {
  fabric.reset();
});

type IProps = Record<string, unknown>;

function applyProps(view: ReturnType<typeof createElement>, props: IProps) {
  for (const key of Object.keys(props)) routeProp(view, key, props[key]);
}

// Ключ из `prev`, которого нет в `next`, снимается так же, как его снимает reconciler
function payloadAfter(prev: IProps, next: IProps): Record<string, unknown> {
  const surface = createSurface((nextRootTag += 1));
  const view = createElement('RCTView');
  applyProps(view, prev);
  surface.appendChild(view);
  surface.commit();
  for (const key of Object.keys(prev)) {
    if (!(key in next)) routeProp(view, key, undefined);
  }
  applyProps(view, next);
  surface.commit();
  return payloadOf(view);
}

function payloadOfFresh(props: IProps): Record<string, unknown> {
  const surface = createSurface((nextRootTag += 1));
  const view = createElement('RCTView');
  applyProps(view, props);
  surface.appendChild(view);
  surface.commit();
  return payloadOf(view);
}

describe('create (first commit)', () => {
  it('flattens nested style arrays, later entries win', () => {
    const payload = payloadOfFresh({
      style: [
        {
          flexGrow: 1,
          flexShrink: 1,
          flexDirection: 'row',
          overflow: 'scroll',
        },
        [
          { position: 'relative', zIndex: 2 },
          { flexGrow: 0 },
          { backgroundColor: 'red' },
        ],
      ],
    });
    expect(payload.flexGrow).toBe(0);
    expect(payload.flexShrink).toBe(1);
    expect(payload.flexDirection).toBe('row');
    expect(payload.overflow).toBe('scroll');
    expect(payload.position).toBe('relative');
    expect(payload.zIndex).toBe(2);
  });

  it('leaves no value for a style entry set to undefined or null after a value', () => {
    expect(
      payloadOfFresh({ style: [{ width: 5 }, { width: undefined }] }).width ??
        null,
    ).toBe(null);
    expect(
      payloadOfFresh({ style: [{ width: 5 }, { width: null }] }).width ?? null,
    ).toBe(null);
  });

  it('ignores a non-style prop set to undefined', () => {
    expect('testID' in payloadOfFresh({ testID: undefined })).toBe(false);
  });
});

describe('diff (second commit)', () => {
  // Контроль для проверок «ключ исчез»: без удаления тот же ключ остаётся в payload
  it('keeps a prop and a style key that stay', () => {
    const payload = payloadAfter(
      { testID: 'a', style: { width: 5 } },
      { testID: 'a', style: { width: 5 } },
    );
    expect(payload.testID).toBe('a');
    expect(payload.width).toBe(5);
  });

  it('removes a prop', () => {
    expect(payloadAfter({ testID: 'a' }, {}).testID ?? null).toBe(null);
  });

  it('removes a prop set to undefined', () => {
    expect(
      payloadAfter({ testID: 'a' }, { testID: undefined }).testID ?? null,
    ).toBe(null);
  });

  it('removes style keys when the style goes away', () => {
    const payload = payloadAfter(
      { style: { width: 5, height: 6 } },
      { style: undefined },
    );
    expect(payload.width ?? null).toBe(null);
    expect(payload.height ?? null).toBe(null);
  });

  it('adds style keys when style appears', () => {
    expect(
      payloadAfter({ style: undefined }, { style: { width: 5 } }).width,
    ).toBe(5);
  });

  it('flattens nested styles on the way in and clears them on the way out', () => {
    expect(
      payloadAfter(
        {},
        { style: [[{ width: 1 }, { width: 2 }], { height: 3 }] },
      ),
    ).toMatchObject({ width: 2, height: 3 });
    const cleared = payloadAfter({ style: [{ width: 1 }, { height: 2 }] }, {});
    expect(cleared.width ?? null).toBe(null);
    expect(cleared.height ?? null).toBe(null);
  });

  it('resets a value to the earlier slot when the later one drops it', () => {
    expect(
      payloadAfter(
        { style: [{ width: 1 }, { width: 3 }] },
        { style: [{ width: 1 }, { height: 2 }] },
      ),
    ).toMatchObject({ width: 1, height: 2 });
  });

  it('keeps a value that another slot still sets', () => {
    expect(
      payloadAfter(
        { style: [{}, { width: 3, height: 2 }] },
        { style: [{ width: 3 }, { height: 2 }] },
      ),
    ).toMatchObject({ width: 3, height: 2 });
    expect(
      payloadAfter(
        { style: [{}, { width: 3, height: 2 }] },
        { style: [{ width: 1, height: 1 }, { height: 2 }] },
      ),
    ).toMatchObject({ width: 1, height: 2 });
  });

  it('clears a prop when a later slot sets it to null or undefined', () => {
    expect(
      payloadAfter(
        { style: [{}, { width: 3, height: 2 }] },
        { style: [{ width: 1 }, { height: 2, width: null }] },
      ).width ?? null,
    ).toBe(null);
    expect(
      payloadAfter(
        { style: [{ width: 3 }, { width: null, height: 2 }] },
        { style: [{ width: null }, { height: 2 }] },
      ).width ?? null,
    ).toBe(null);
    expect(
      payloadAfter(
        { style: [{ width: 1 }, { width: 3 }] },
        { style: [{ width: 2 }, { width: undefined }] },
      ).width ?? null,
    ).toBe(null);
  });
});
