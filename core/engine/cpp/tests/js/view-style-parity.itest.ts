// Style-кейсы `View-itest` из RN, раскладка читается через `getBoundingClientRect`

import {
  appendChild,
  createElement,
  createSurface,
  getBoundingClientRect,
  setProp,
} from '@symbiote-native/engine';
import type { ISymbioteNode } from '@symbiote-native/engine';

import { describe, expect, findCommitted, it, report } from './harness';

const PROBE_ID = 'probe';

function view(style: Record<string, unknown>): ISymbioteNode {
  const node = createElement('RCTView');
  setProp(node, 'style', style);
  return node;
}

function probeInside(
  parentStyle: Record<string, unknown>,
  probeStyle: Record<string, unknown>,
) {
  const surface = createSurface(1);
  const parent = view(parentStyle);
  const probe = view(probeStyle);
  setProp(probe, 'testID', PROBE_ID);
  appendChild(parent, probe);
  surface.appendChild(parent);
  surface.commit();
  return { surface, probe };
}

function frameOf(node: ISymbioteNode, includeTransform = false) {
  const rect = getBoundingClientRect(node, includeTransform);
  if (rect === undefined) throw new Error('the probe has no committed layout');
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

describe('width and height style', () => {
  it('resolves percentage dimensions against the parent', () => {
    const { probe } = probeInside(
      { width: 100, height: 100 },
      { width: '20%', height: '50%' },
    );

    expect(frameOf(probe)).toEqual({ x: 0, y: 0, width: 20, height: 50 });
  });

  it('reads numeric strings as points', () => {
    const { probe } = probeInside({}, { width: '5', height: '10' });

    expect(frameOf(probe)).toEqual({ x: 0, y: 0, width: 5, height: 10 });
  });

  // `5pt` валидный CSS, но RN его не разбирает, оба ключа откатываются к значениям по умолчанию
  it('falls back to the default for a value it cannot parse', () => {
    const { probe } = probeInside(
      { width: 100, height: 100 },
      { width: '5pt', height: 'error 50%' },
    );

    expect(frameOf(probe)).toEqual({ x: 0, y: 0, width: 100, height: 0 });
  });
});

describe('margin style', () => {
  it('resolves a percentage margin against the parent width', () => {
    const { probe } = probeInside(
      { width: 100, height: 200 },
      { width: 5, height: 10, margin: '50%' },
    );

    expect(frameOf(probe)).toEqual({ x: 50, y: 50, width: 5, height: 10 });
  });

  it('reads a numeric string margin as points', () => {
    const { probe } = probeInside(
      { width: 100, height: 200 },
      { width: 5, height: 10, margin: '5' },
    );

    expect(frameOf(probe)).toEqual({ x: 5, y: 5, width: 5, height: 10 });
  });
});

describe('transformOrigin', () => {
  const cases: [string | undefined, ReturnType<typeof frameOf>][] = [
    [undefined, { x: -5, y: 0, width: 20, height: 10 }],
    ['50% 50%', { x: -5, y: 0, width: 20, height: 10 }],
    ['top left', { x: 0, y: 0, width: 20, height: 10 }],
    ['right bottom', { x: -10, y: 0, width: 20, height: 10 }],
  ];
  for (const [transformOrigin, expected] of cases) {
    it(`scales around ${String(transformOrigin)}`, () => {
      const surface = createSurface(1);
      const probe = view({
        width: 10,
        height: 10,
        transform: [{ scaleX: 2 }],
        transformOrigin,
      });
      surface.appendChild(probe);
      surface.commit();

      expect(frameOf(probe, true)).toEqual(expected);
    });
  }
});

describe('aspectRatio', () => {
  it('survives an update of an unrelated prop', () => {
    const surface = createSurface(1);
    const probe = view({ width: 100, aspectRatio: 2 });
    setProp(probe, 'nativeID', 'first');
    surface.appendChild(probe);
    surface.commit();
    expect(frameOf(probe).height).toBe(50);

    setProp(probe, 'nativeID', 'second');
    surface.commit();

    expect(frameOf(probe).height).toBe(50);
  });

  it('can be cleared after it had a value', () => {
    const surface = createSurface(1);
    const probe = view({ width: 100, aspectRatio: 2 });
    surface.appendChild(probe);
    surface.commit();
    expect(frameOf(probe).height).toBe(50);

    setProp(probe, 'style', { width: 100, aspectRatio: undefined });
    surface.commit();

    expect(frameOf(probe).height).toBe(0);
  });
});

describe('pointerEvents', () => {
  function committedPointerEvents(value: string): string | undefined {
    const surface = createSurface(1);
    const node = createElement('RCTView');
    setProp(node, 'testID', PROBE_ID);
    setProp(node, 'pointerEvents', value);
    surface.appendChild(node);
    surface.commit();
    return findCommitted(each => each.props.testID === PROBE_ID)?.props
      .pointerEvents;
  }

  it('leaves auto out of the payload, it is the default', () => {
    expect(committedPointerEvents('auto')).toBe(undefined);
  });

  for (const value of ['box-none', 'box-only', 'none']) {
    it(`sends ${value} to the mounting layer`, () => {
      expect(committedPointerEvents(value)).toBe(value);
    });
  }
});

report();
