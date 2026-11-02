import { describe, expect, it } from 'vitest';
import {
  configRows,
  legacyInsetOptionsOf,
  readIsLegacyInset,
} from './runtime-config';
import type { IConfigInput } from './runtime-config';

const INPUT: IConfigInput = {
  experiment: {
    androidLegacyTopInsetBehavior: false,
    synchronousScreenUpdatesEnabled: true,
    iosPreventReattachmentOfDismissedScreens: true,
  },
  stable: { debugLogging: false },
  compatibility: { isNewBackTitleImplementation: true },
  isSearchBarAvailable: true,
  areScreensEnabled: true,
};

function rowNamed(name: string) {
  const row = configRows(INPUT).find(candidate => candidate.name === name);
  if (row === undefined) throw new Error(`no row named ${name}`);
  return row;
}

describe('runtime config rows', () => {
  describe('Positive', () => {
    it('gives every flag and both platform answers exactly one row', () => {
      expect(configRows(INPUT).map(row => row.name)).toEqual([
        'androidLegacyTopInsetBehavior',
        'synchronousScreenUpdatesEnabled',
        'iosPreventReattachmentOfDismissedScreens',
        'debugLogging',
        'isNewBackTitleImplementation',
        'isSearchBarAvailableForCurrentPlatform',
        'screensEnabled()',
      ]);
    });

    it('groups the rows the way the library groups its flags', () => {
      expect(rowNamed('synchronousScreenUpdatesEnabled').group).toBe(
        'experiment',
      );
      expect(rowNamed('debugLogging').group).toBe('stable');
      expect(rowNamed('isNewBackTitleImplementation').group).toBe(
        'compatibility',
      );
      expect(rowNamed('screensEnabled()').group).toBe('platform');
    });

    it('carries the live value of each flag', () => {
      expect(rowNamed('androidLegacyTopInsetBehavior').value).toBe(false);
      expect(rowNamed('synchronousScreenUpdatesEnabled').value).toBe(true);
      expect(rowNamed('isSearchBarAvailableForCurrentPlatform').value).toBe(
        true,
      );
    });

    it('marks the flags the library no longer lets anyone change', () => {
      expect(
        rowNamed('iosPreventReattachmentOfDismissedScreens').isRetired,
      ).toBe(true);
      expect(rowNamed('androidLegacyTopInsetBehavior').isRetired).toBe(false);
    });

    it('explains every flag it knows in a sentence', () => {
      for (const row of configRows(INPUT)) {
        expect(row.note.trim()).not.toBe('');
      }
    });

    it('reads the legacy top inset switch from the route params', () => {
      expect(readIsLegacyInset({ isLegacyInset: true })).toBe(true);
      expect(legacyInsetOptionsOf(true)).toEqual({
        headerLegacyTopInsetBehavior: true,
      });
    });

    it('leaves the legacy top inset to the global flag while the switch is off', () => {
      expect(legacyInsetOptionsOf(false)).toEqual({});
    });
  });

  describe('Negative', () => {
    it('shows a flag it has no description for, saying so', () => {
      const rows = configRows({
        ...INPUT,
        experiment: { brandNewFlag: true },
      });
      expect(rows[0]).toMatchObject({
        name: 'brandNewFlag',
        note: 'No description here yet',
        isRetired: false,
      });
    });

    it('reads a switch value the panel could not have written as off', () => {
      expect(readIsLegacyInset({ isLegacyInset: 'yes' })).toBe(false);
      expect(readIsLegacyInset(undefined)).toBe(false);
    });
  });
});
