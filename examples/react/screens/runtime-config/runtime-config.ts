import type {
  compatibilityFlags,
  featureFlags,
  IScreenOptions,
} from '@symbiote-native/navigation/react';
import { isParamsRecord, readFlag } from '../read-params';

type IKnownFlag =
  | keyof typeof featureFlags.experiment
  | keyof typeof featureFlags.stable
  | keyof typeof compatibilityFlags;

const RETIRED_NOTE = 'Retired: always on, setting it does nothing';
const UNKNOWN_NOTE = 'No description here yet';

// One sentence per flag, so a reader learns what it is for without the vendor source
const FLAG_NOTES: Record<IKnownFlag, string> = {
  synchronousScreenUpdatesEnabled:
    'Screens and sheets push their size into Fabric state in the same frame',
  synchronousHeaderConfigUpdatesEnabled:
    'The header config pushes its updates into Fabric state in the same frame',
  synchronousHeaderSubviewUpdatesEnabled:
    'The left, right and center header views do the same',
  androidLegacyTopInsetBehavior:
    'Android pads the top on every header, even when an outer header already did',
  androidResetScreenShadowStateOnOrientationChangeEnabled:
    'Android resets the screen size state on rotation, a screen can override it',
  iosOrientationInheritanceFixEnabled:
    'iOS orientation inheritance fix, a screen can override it',
  iosPreventReattachmentOfDismissedScreens: RETIRED_NOTE,
  iosPreventReattachmentOfDismissedModals: RETIRED_NOTE,
  ios26AllowInteractionsDuringTransition: RETIRED_NOTE,
  debugLogging: 'Debug logging of the screens library',
  isNewBackTitleImplementation:
    'Back titles treat a blank string as a default back button, since screens 3.21',
  usesHeaderFlexboxImplementation:
    'The header is laid out with flexbox, since screens 4.0',
  usesNewAndroidHeaderHeightImplementation:
    'Android reports the corrected header height in onHeaderHeightChange',
  usesStableTabsApi: 'The tabs API has the shape meant for stabilisation',
};

type IFlagGroup = 'experiment' | 'stable' | 'compatibility' | 'platform';

export type IConfigRow = {
  group: IFlagGroup;
  name: string;
  value: boolean;
  note: string;
  isRetired: boolean;
};

export type IConfigInput = {
  experiment: Record<string, boolean>;
  stable: Record<string, boolean>;
  compatibility: Record<string, boolean>;
  isSearchBarAvailable: boolean;
  areScreensEnabled: boolean;
};

function noteOf(name: string): string {
  const known = Object.entries(FLAG_NOTES).find(([flag]) => flag === name);
  return known === undefined ? UNKNOWN_NOTE : known[1];
}

function rowsOf(
  group: IFlagGroup,
  flags: Record<string, boolean>,
): IConfigRow[] {
  return Object.entries(flags).map(([name, value]) => {
    const note = noteOf(name);
    return { group, name, value, note, isRetired: note === RETIRED_NOTE };
  });
}

export function configRows(input: IConfigInput): IConfigRow[] {
  return [
    ...rowsOf('experiment', input.experiment),
    ...rowsOf('stable', input.stable),
    ...rowsOf('compatibility', input.compatibility),
    {
      group: 'platform',
      name: 'isSearchBarAvailableForCurrentPlatform',
      value: input.isSearchBarAvailable,
      note: 'The header search bar exists on iOS and Android only',
      isRetired: false,
    },
    {
      group: 'platform',
      name: 'screensEnabled()',
      value: input.areScreensEnabled,
      note: 'The app-wide switch of enableScreens, a container without enabled follows it',
      isRetired: false,
    },
  ];
}

export function readIsLegacyInset(params: unknown): boolean {
  return isParamsRecord(params) && readFlag(params, 'isLegacyInset', false);
}

// Off leaves the choice to the global `androidLegacyTopInsetBehavior` flag
export function legacyInsetOptionsOf(isLegacyInset: boolean): IScreenOptions {
  return isLegacyInset ? { headerLegacyTopInsetBehavior: true } : {};
}
