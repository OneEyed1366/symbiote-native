// The inset props of a stack header, planned from the enclosing header and the screen's own options

import { describe, expect, it, vi } from 'vitest';
import { EMPTY_EDGE_INSETS } from './edge-insets';
import type { IEdgeInsetScope } from './edge-insets';
import { resolveScreenRenderPlan } from './render-stack';
import type { IScreenOptions } from './navigator-props';
import { featureFlags } from './screens-config';

function planOf(options: IScreenOptions, parentScope?: IEdgeInsetScope) {
  return resolveScreenRenderPlan({
    screenId: 'a',
    index: 0,
    routeCount: 1,
    options,
    platform: {
      defaultHeaderBackTitleVisible: true,
      headerBarButtonsAvailable: true,
      isIOS26OrHigher: false,
    },
    isAndroid: false,
    screenPassthrough: {},
    parentScope,
  });
}

describe('header inset props', () => {
  it('lets a root header take all four insets', () => {
    const { props } = planOf({}).headerConfig;

    expect(props.consumeTopInset).toBe(true);
    expect(props.consumeLeftInset).toBe(true);
    expect(props.consumeRightInset).toBe(true);
    expect(props.consumeBottomInset).toBe(true);
  });

  it('leaves the top inset to the header of an enclosing stack', () => {
    const { props } = planOf(
      {},
      { edgeInsets: { ...EMPTY_EDGE_INSETS, topAlreadyApplied: true } },
    ).headerConfig;

    expect(props.consumeTopInset).toBe(false);
    expect(props.consumeLeftInset).toBe(true);
  });

  it('reads the enclosing header through a Tab or Drawer scope in between', () => {
    const { props } = planOf(
      {},
      {
        parent: {
          edgeInsets: { ...EMPTY_EDGE_INSETS, leftDisabled: true },
        },
      },
    ).headerConfig;

    expect(props.consumeLeftInset).toBe(false);
  });

  it('gives up only the top inset when its header is hidden', () => {
    const { props } = planOf({ headerShown: false }).headerConfig;

    expect(props.consumeTopInset).toBe(false);
    expect(props.consumeLeftInset).toBe(true);
  });

  it.each([
    ['disableTopInsetApplication', 'consumeTopInset'],
    ['disableLeftInsetApplication', 'consumeLeftInset'],
    ['disableRightInsetApplication', 'consumeRightInset'],
    ['disableBottomInsetApplication', 'consumeBottomInset'],
  ] as const)('turns %s into %s false', (option, prop) => {
    expect(planOf({ [option]: true }).headerConfig.props[prop]).toBe(false);
  });

  it('hands the state for the screens below this header to the adapter', () => {
    const plan = planOf({ disableLeftInsetApplication: true });

    expect(plan.edgeInsets).toEqual({
      topAlreadyApplied: true,
      leftDisabled: true,
      rightDisabled: false,
      bottomDisabled: false,
    });
  });

  it('tells native about the legacy top inset flag unless the screen sets its own', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    featureFlags.experiment.androidLegacyTopInsetBehavior = true;
    try {
      expect(planOf({}).headerConfig.props.legacyTopInsetBehavior).toBe(true);
      expect(
        planOf({ headerLegacyTopInsetBehavior: false }).headerConfig.props
          .legacyTopInsetBehavior,
      ).toBe(false);
    } finally {
      featureFlags.experiment.androidLegacyTopInsetBehavior = false;
      vi.restoreAllMocks();
    }
  });
});
