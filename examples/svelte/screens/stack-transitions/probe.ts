import type {
  INavigatorHandle,
  IScreenOptions,
} from '@symbiote-native/navigation/svelte';
import { ROUTE_NAME } from '../../routes';
import { isParamsRecord, readChoice, readFlag, readText } from '../read-params';

type IPresentation = NonNullable<IScreenOptions['stackPresentation']>;
type IAnimation = NonNullable<IScreenOptions['stackAnimation']>;
type IReplaceAnimation = NonNullable<IScreenOptions['replaceAnimation']>;
type IResetState = Parameters<INavigatorHandle['reset']>[0];

// Leaves the choice to the platform: the animation it picks, the length it uses
const PLATFORM_DEFAULT = 'default';

export const PRESENTATIONS = [
  'push',
  'modal',
  'transparentModal',
  'fullScreenModal',
  'formSheet',
  'pageSheet',
  'containedModal',
  'containedTransparentModal',
] as const satisfies readonly IPresentation[];

export const ANIMATIONS = [
  PLATFORM_DEFAULT,
  'flip',
  'simple_push',
  'none',
  'fade',
  'slide_from_right',
  'slide_from_left',
  'slide_from_bottom',
  'fade_from_bottom',
  'ios_from_right',
  'ios_from_left',
] as const satisfies readonly IAnimation[];

// The others are milliseconds
export const DURATIONS = [PLATFORM_DEFAULT, '200', '1000', '2000'] as const;

export const REPLACE_ANIMATIONS = [
  'pop',
  'push',
] as const satisfies readonly IReplaceAnimation[];

export const POP_COUNTS = ['1', '2', '3'] as const;

type IDuration = (typeof DURATIONS)[number];
type IPopCount = (typeof POP_COUNTS)[number];

// What the panel will hand to the next probe, written to the route params of the screen showing it
export type IPanel = {
  nextPresentation: IPresentation;
  nextAnimation: IAnimation;
  nextDuration: IDuration;
  nextReplaceAnimation: IReplaceAnimation;
  popCount: IPopCount;
};

export const DEFAULT_PANEL: IPanel = {
  nextPresentation: 'push',
  nextAnimation: PLATFORM_DEFAULT,
  nextDuration: PLATFORM_DEFAULT,
  nextReplaceAnimation: 'pop',
  popCount: '1',
};

// How a probe was presented, fixed when it was pushed: later panel edits never touch it
export type IProbe = {
  isProbe: boolean;
  depth: number;
  // Key of the first screen under the probes, the target of `popTo`
  anchorKey: string | undefined;
  presentation: IPresentation;
  animation: IAnimation;
  duration: IDuration;
  replaceAnimation: IReplaceAnimation;
};

export function readPanel(params: unknown): IPanel {
  const base = DEFAULT_PANEL;
  if (!isParamsRecord(params)) return base;
  return {
    nextPresentation: readChoice(
      params,
      'nextPresentation',
      PRESENTATIONS,
      base.nextPresentation,
    ),
    nextAnimation: readChoice(
      params,
      'nextAnimation',
      ANIMATIONS,
      base.nextAnimation,
    ),
    nextDuration: readChoice(
      params,
      'nextDuration',
      DURATIONS,
      base.nextDuration,
    ),
    nextReplaceAnimation: readChoice(
      params,
      'nextReplaceAnimation',
      REPLACE_ANIMATIONS,
      base.nextReplaceAnimation,
    ),
    popCount: readChoice(params, 'popCount', POP_COUNTS, base.popCount),
  };
}

function readDepth(params: Record<string, unknown>): number {
  const { depth } = params;
  return typeof depth === 'number' && Number.isInteger(depth) && depth > 0
    ? depth
    : 0;
}

export function readProbe(params: unknown): IProbe {
  const base = DEFAULT_PANEL;
  const record = isParamsRecord(params) ? params : {};
  return {
    isProbe: readFlag(record, 'isProbe', false),
    depth: readDepth(record),
    anchorKey: readText(record, 'anchorKey', '') || undefined,
    presentation: readChoice(
      record,
      'presentation',
      PRESENTATIONS,
      base.nextPresentation,
    ),
    animation: readChoice(record, 'animation', ANIMATIONS, base.nextAnimation),
    duration: readChoice(record, 'duration', DURATIONS, base.nextDuration),
    replaceAnimation: readChoice(
      record,
      'replaceAnimation',
      REPLACE_ANIMATIONS,
      base.nextReplaceAnimation,
    ),
  };
}

type ICurrent = {
  depth: number;
  anchorKey: string | undefined;
  routeKey: string;
};

// The params of the probe the panel pushes, one level under the screen that shows the panel
export function pushProbeParams(panel: IPanel, current: ICurrent) {
  return {
    isProbe: true,
    depth: current.depth + 1,
    anchorKey: current.anchorKey ?? current.routeKey,
    presentation: panel.nextPresentation,
    animation: panel.nextAnimation,
    duration: panel.nextDuration,
    replaceAnimation: panel.nextReplaceAnimation,
  };
}

// iOS reads `transitionDuration` for these animations only
const TIMED_FALLBACK_ANIMATION = 'fade';
const DURATION_ANIMATIONS = [
  'slide_from_bottom',
  'fade_from_bottom',
  TIMED_FALLBACK_ANIMATION,
  'simple_push',
] as const satisfies readonly IAnimation[];
// A modal or a sheet ignores it whatever the animation is
const FIXED_DURATION_PRESENTATIONS = [
  'modal',
  'formSheet',
  'pageSheet',
] as const satisfies readonly IPresentation[];

// The panel with the animation and the presentation the duration shows on, nothing else changes
export function timedPanelOf(panel: IPanel): IPanel {
  const isFixed = FIXED_DURATION_PRESENTATIONS.some(
    presentation => presentation === panel.nextPresentation,
  );
  const isTimed = DURATION_ANIMATIONS.some(
    animation => animation === panel.nextAnimation,
  );
  return {
    ...panel,
    nextPresentation: isFixed ? 'push' : panel.nextPresentation,
    nextAnimation: isTimed ? panel.nextAnimation : TIMED_FALLBACK_ANIMATION,
  };
}

// Contained presentations open in the context of a parent screen, which a root stack lacks
export function canPushProbe(panel: IPanel): boolean {
  return !panel.nextPresentation.startsWith('contained');
}

// A probe is only the entry transition: the root screen keeps the options of the app
export function probeOptionsOf(probe: IProbe): IScreenOptions {
  if (!probe.isProbe) return {};
  return {
    stackPresentation: probe.presentation,
    stackAnimation: probe.animation,
    transitionDuration:
      probe.duration === PLATFORM_DEFAULT ? undefined : Number(probe.duration),
    replaceAnimation: probe.replaceAnimation,
  };
}

// The menu with one probe on top, `stamp` keeps the keys of two resets apart
export function resetStateOf(panel: IPanel, stamp: number): IResetState {
  const menuKey = `reset-menu-${stamp}`;
  return {
    routes: [
      { key: menuKey, name: ROUTE_NAME.Menu, params: undefined },
      {
        key: `reset-probe-${stamp}`,
        name: ROUTE_NAME.StackTransitions,
        params: pushProbeParams(panel, {
          depth: 0,
          anchorKey: undefined,
          routeKey: menuKey,
        }),
      },
    ],
  };
}
