import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SHEET_SETTINGS,
  readSheetSettings,
  sheetOptionsOf,
  sheetParamsOf,
} from './sheet-settings';
import type { ISheetSettings } from './sheet-settings';

function sheetWith(patch: Partial<ISheetSettings>): ISheetSettings {
  return { ...DEFAULT_SHEET_SETTINGS, isSheet: true, ...patch };
}

describe('sheet settings', () => {
  describe('Positive', () => {
    it('reads the defaults when the route has no params', () => {
      expect(readSheetSettings(undefined)).toEqual(DEFAULT_SHEET_SETTINGS);
    });

    it('is no sheet by default, so the panel screen keeps the options of the app', () => {
      expect(DEFAULT_SHEET_SETTINGS.isSheet).toBe(false);
      expect(sheetOptionsOf(DEFAULT_SHEET_SETTINGS)).toEqual({});
    });

    it('carries the panel to the sheet through the route params', () => {
      const panel: ISheetSettings = {
        ...DEFAULT_SHEET_SETTINGS,
        detents: 'fitToContents',
        undimmed: 'last',
        hasFooter: true,
      };
      const copy = readSheetSettings(sheetParamsOf(panel));
      expect(copy).toEqual({ ...panel, isSheet: true });
    });

    it('presents the sheet as a formSheet', () => {
      expect(sheetOptionsOf(sheetWith({})).stackPresentation).toBe('formSheet');
    });

    it('turns the detent presets into the lists and names the library takes', () => {
      expect(
        sheetOptionsOf(sheetWith({ detents: 'three' })).sheetAllowedDetents,
      ).toEqual([0.3, 0.6, 1]);
      expect(
        sheetOptionsOf(sheetWith({ detents: 'single' })).sheetAllowedDetents,
      ).toEqual([0.5]);
      expect(
        sheetOptionsOf(sheetWith({ detents: 'fitToContents' }))
          .sheetAllowedDetents,
      ).toBe('fitToContents');
    });

    it('turns the initial and undimmed choices into indexes', () => {
      const options = sheetOptionsOf(
        sheetWith({ initialDetent: '1', undimmed: '0' }),
      );
      expect(options.sheetInitialDetentIndex).toBe(1);
      expect(options.sheetLargestUndimmedDetentIndex).toBe(0);
    });

    // A dev build throws when an index is past the detent list, which blanks the screen
    it('pulls an index back to the last detent when the list is shorter', () => {
      const single = sheetOptionsOf(
        sheetWith({ detents: 'single', initialDetent: '1', undimmed: '1' }),
      );
      expect(single.sheetInitialDetentIndex).toBe(0);
      expect(single.sheetLargestUndimmedDetentIndex).toBe(0);
      const all = sheetOptionsOf(
        sheetWith({ detents: 'all', initialDetent: '1', undimmed: '1' }),
      );
      expect(all.sheetInitialDetentIndex).toBe(1);
      expect(all.sheetLargestUndimmedDetentIndex).toBe(1);
    });

    it('keeps the last and none names where the library has them', () => {
      const options = sheetOptionsOf(
        sheetWith({ initialDetent: 'last', undimmed: 'none' }),
      );
      expect(options.sheetInitialDetentIndex).toBe('last');
      expect(options.sheetLargestUndimmedDetentIndex).toBe('none');
    });

    it('leaves the corner radius and the elevation to the system until asked', () => {
      const system = sheetOptionsOf(sheetWith({}));
      expect(system.sheetCornerRadius).toBeUndefined();
      expect(system.sheetElevation).toBeUndefined();
      const chosen = sheetOptionsOf(
        sheetWith({ cornerRadius: '40', elevation: '12' }),
      );
      expect(chosen.sheetCornerRadius).toBe(40);
      expect(chosen.sheetElevation).toBe(12);
    });

    it('maps the grabber, the scroll expansion and the Android switches', () => {
      expect(
        sheetOptionsOf(
          sheetWith({
            isGrabberVisible: true,
            isExpandsOnScroll: false,
            isOverflowTopInset: true,
            isDefaultResizeAnimation: false,
          }),
        ),
      ).toMatchObject({
        sheetGrabberVisible: true,
        sheetExpandsWhenScrolledToEdge: false,
        sheetShouldOverflowTopInset: true,
        sheetDefaultResizeAnimationEnabled: false,
      });
    });

    it('tints the content only when asked', () => {
      expect(sheetOptionsOf(sheetWith({})).contentStyle).toBeUndefined();
      expect(
        sheetOptionsOf(sheetWith({ contentStyle: 'tint' })).contentStyle,
      ).toEqual({
        backgroundColor: expect.any(String),
      });
    });
  });

  describe('Negative', () => {
    it('falls back to the default for a value the panel could not have written', () => {
      expect(
        readSheetSettings({
          detents: 'huge',
          initialDetent: 9,
          undimmed: 'sometimes',
          isGrabberVisible: 'yes',
          cornerRadius: '-5',
        }),
      ).toEqual(DEFAULT_SHEET_SETTINGS);
    });
  });
});
