import { describe, expect, it } from 'vitest';
import { ROUTE_NAME } from '../../routes';
import {
  ANIMATIONS,
  canPushProbe,
  DEFAULT_PANEL,
  PRESENTATIONS,
  probeOptionsOf,
  pushProbeParams,
  readPanel,
  readProbe,
  resetStateOf,
  timedPanelOf,
} from './probe';
import type { IPanel } from './probe';

function panelWith(patch: Partial<IPanel>): IPanel {
  return { ...DEFAULT_PANEL, ...patch };
}

describe('stack transition probe', () => {
  describe('Positive', () => {
    it('lists every presentation and animation the port accepts', () => {
      expect(PRESENTATIONS).toHaveLength(8);
      expect(ANIMATIONS).toHaveLength(11);
    });

    it('reads the root screen as no probe at depth zero', () => {
      expect(readProbe(undefined)).toMatchObject({ isProbe: false, depth: 0 });
    });

    it('reads the panel defaults when the route has no params', () => {
      expect(readPanel(undefined)).toEqual(DEFAULT_PANEL);
    });

    it('reads back what the panel wrote', () => {
      const written = panelWith({
        nextPresentation: 'formSheet',
        popCount: '2',
      });
      expect(readPanel({ ...written })).toEqual(written);
    });

    it('pushes a probe one level deeper carrying the panel choices', () => {
      const params = pushProbeParams(
        panelWith({ nextPresentation: 'modal', nextAnimation: 'fade' }),
        { depth: 0, anchorKey: undefined, routeKey: 'root-1' },
      );
      expect(readProbe(params)).toMatchObject({
        isProbe: true,
        depth: 1,
        presentation: 'modal',
        animation: 'fade',
      });
    });

    it('anchors popTo at the first probe and keeps it for the deeper ones', () => {
      const first = pushProbeParams(DEFAULT_PANEL, {
        depth: 0,
        anchorKey: undefined,
        routeKey: 'root-1',
      });
      const second = pushProbeParams(DEFAULT_PANEL, {
        depth: 1,
        anchorKey: readProbe(first).anchorKey,
        routeKey: 'probe-1',
      });
      expect(readProbe(first).anchorKey).toBe('root-1');
      expect(readProbe(second).anchorKey).toBe('root-1');
    });

    it('turns the probe into the options of its own entry transition', () => {
      const params = pushProbeParams(
        panelWith({
          nextPresentation: 'fullScreenModal',
          nextAnimation: 'slide_from_bottom',
          nextDuration: '1000',
          nextReplaceAnimation: 'push',
        }),
        { depth: 0, anchorKey: undefined, routeKey: 'root-1' },
      );
      expect(probeOptionsOf(readProbe(params))).toEqual({
        stackPresentation: 'fullScreenModal',
        stackAnimation: 'slide_from_bottom',
        transitionDuration: 1_000,
        replaceAnimation: 'push',
      });
    });

    it('leaves the duration to the platform while the panel says default', () => {
      const params = pushProbeParams(DEFAULT_PANEL, {
        depth: 0,
        anchorKey: undefined,
        routeKey: 'root-1',
      });
      expect(
        probeOptionsOf(readProbe(params)).transitionDuration,
      ).toBeUndefined();
    });

    // Presented in the context of a parent, a root stack leaves a blank screen with no way back
    it('refuses to push the two contained presentations and allows the rest', () => {
      for (const nextPresentation of PRESENTATIONS) {
        const isContained = nextPresentation.startsWith('contained');
        expect(canPushProbe(panelWith({ nextPresentation }))).toBe(
          !isContained,
        );
      }
    });

    // iOS reads the duration for these four animations only, and not on a modal or a sheet
    it('keeps an animation and a presentation the duration is honoured on', () => {
      const panel = panelWith({
        nextPresentation: 'push',
        nextAnimation: 'slide_from_bottom',
        nextDuration: '2000',
      });
      expect(timedPanelOf(panel)).toEqual(panel);
    });

    it('swaps the default animation for fade so the duration is visible', () => {
      const timed = timedPanelOf(
        panelWith({ nextAnimation: 'default', nextDuration: '2000' }),
      );
      expect(timed.nextAnimation).toBe('fade');
      expect(timed.nextDuration).toBe('2000');
    });

    it('swaps a modal or a sheet for a plain push', () => {
      for (const nextPresentation of [
        'modal',
        'formSheet',
        'pageSheet',
      ] as const) {
        const timed = timedPanelOf(
          panelWith({ nextPresentation, nextAnimation: 'fade' }),
        );
        expect(timed.nextPresentation).toBe('push');
      }
    });

    it('adds no transition options to the root screen', () => {
      expect(probeOptionsOf(readProbe(undefined))).toEqual({});
    });

    it('resets to the menu with one probe on top', () => {
      const state = resetStateOf(DEFAULT_PANEL, 7);
      expect(state.routes.map(route => route.name)).toEqual([
        ROUTE_NAME.Menu,
        ROUTE_NAME.StackTransitions,
      ]);
      expect(readProbe(state.routes[1].params)).toMatchObject({
        isProbe: true,
        depth: 1,
      });
      expect(new Set(state.routes.map(route => route.key)).size).toBe(2);
    });
  });

  describe('Negative', () => {
    it('falls back to the defaults for values the panel could not have written', () => {
      expect(
        readPanel({
          nextPresentation: 'sideways',
          nextAnimation: 3,
          nextDuration: 'forever',
          popCount: '9',
        }),
      ).toEqual(DEFAULT_PANEL);
      expect(readProbe({ isProbe: 'yes', depth: 'deep' })).toMatchObject({
        isProbe: false,
        depth: 0,
      });
    });
  });
});
