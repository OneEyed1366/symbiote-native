import { describe, expect, it } from 'vitest';
import { ROUTE_NAME } from '../../routes';
import {
  breakSnapshot,
  PRESET_CHOICES,
  presetState,
} from './persistence-presets';

describe('persistence presets', () => {
  describe('Positive', () => {
    it('always starts the stack on the menu, which the stack never pops', () => {
      for (const preset of PRESET_CHOICES) {
        expect(presetState(preset).routes[0].name).toBe(ROUTE_NAME.Menu);
      }
    });

    it('gives every route of a preset its own key, the stack needs it to tell routes apart', () => {
      for (const preset of PRESET_CHOICES) {
        const keys = presetState(preset).routes.map(route => route.key);
        expect(new Set(keys).size).toBe(keys.length);
      }
    });

    it('makes the three presets three different depths', () => {
      const depths = PRESET_CHOICES.map(
        preset => presetState(preset).routes.length,
      );
      expect(new Set(depths).size).toBe(PRESET_CHOICES.length);
    });

    it('carries a param to the details route', () => {
      const routes = presetState('details').routes;
      expect(routes[routes.length - 1]).toMatchObject({
        name: ROUTE_NAME.Details,
        params: { id: '7' },
      });
    });
  });

  describe('Negative', () => {
    it('breaks a snapshot into valid JSON whose route has no key', () => {
      const parsed: unknown = JSON.parse(breakSnapshot());
      expect(parsed).toEqual({ routes: [{ name: ROUTE_NAME.Menu }] });
    });
  });
});
