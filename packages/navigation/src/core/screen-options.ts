// Pure folds from a route's agnostic IScreenOptions into the native view-props shapes
// (RNSScreen + RNSScreenStackHeaderConfig + RNSSearchBar paint from). Framework-agnostic and
// shared verbatim by every adapter — the adapter's own job is only wiring identity (screenId),
// position (activityState via computeActivityState) and the lifecycle event handlers into
// `passthrough`.

import { imageStatics } from '@symbiote-native/components';
import { processColor } from '@symbiote-native/engine';
import type { ISymbioteEvent } from '@symbiote-native/engine';
import type {
  IHeaderBarButtonIcon,
  IHeaderBarButtonItem,
  IHeaderBarButtonItemAction,
  IHeaderBarButtonItemMenu,
  IHeaderBarButtonMenuAction,
  IHeaderBarButtonSubmenu,
  IHeaderConfigViewProps,
  INavigatorPlatform,
  IOptionalBooleanNativeProp,
  IScreenOptions,
  IScreenViewProps,
  ISearchBarOptions,
  ISearchBarViewProps,
  ISheetAllowedDetents,
  ISheetInitialDetent,
  ISheetLargestUndimmedDetent,
} from './navigator-props';

// These sentinels must be kept in sync with react-native-screens' native side — they are RNS's
// own compat values for the 'fitToContents'/'large'/'medium'/'all' legacy presets, replicated
// here because we drive RNSScreen directly (no react-native-screens JS component in the path).
const SHEET_FIT_TO_CONTENTS: number[] = [-1];
const SHEET_COMPAT_LARGE: number[] = [1.0];
const SHEET_COMPAT_MEDIUM: number[] = [0.5];
const SHEET_COMPAT_ALL: number[] = [0.5, 1.0];
const SHEET_DIMMED_ALWAYS = -1;

function resolveSheetAllowedDetents(compat: ISheetAllowedDetents | undefined): number[] {
  if (compat === undefined) return SHEET_COMPAT_LARGE;
  if (Array.isArray(compat)) return compat;
  switch (compat) {
    case 'fitToContents':
      return SHEET_FIT_TO_CONTENTS;
    case 'large':
      return SHEET_COMPAT_LARGE;
    case 'medium':
      return SHEET_COMPAT_MEDIUM;
    case 'all':
      return SHEET_COMPAT_ALL;
  }
}

function resolveSheetLargestUndimmedDetent(
  compat: ISheetLargestUndimmedDetent | undefined,
  lastDetentIndex: number,
): number {
  if (typeof compat === 'number') return compat;
  switch (compat) {
    case 'last':
      return lastDetentIndex;
    case 'large':
      return 1;
    case 'medium':
      return 0;
    case 'none':
    case 'all':
    case undefined:
      return SHEET_DIMMED_ALWAYS;
  }
}

function resolveSheetInitialDetent(
  compat: ISheetInitialDetent | undefined,
  lastDetentIndex: number,
): number {
  if (compat === 'last') return lastDetentIndex;
  if (compat === undefined) return 0;
  return compat;
}

// --- Header bar-button items -------------------------------------------------------------
// RNS flattens `icon` into sfSymbolName/xcassetName/imageSource/templateSource at native-payload
// time (both the structured `icon` field AND the flat native keys reach native — RNS's own
// prepareHeaderBarButtonItems keeps both), and resolves image assets through the same resolver
// the Image component uses.
function prepareIcon(icon: IHeaderBarButtonIcon | undefined): Record<string, unknown> {
  if (!icon) return {};
  switch (icon.type) {
    case 'sfSymbol':
      return { sfSymbolName: icon.name };
    case 'xcasset':
      return { xcassetName: icon.name };
    case 'imageSource':
      return { imageSource: imageStatics.resolveAssetSource(icon.imageSource) };
    case 'templateSource':
      return { templateSource: imageStatics.resolveAssetSource(icon.templateSource) };
  }
}

type ISharedItem = IHeaderBarButtonItemAction | IHeaderBarButtonItemMenu;

function prepareTitleStyle(
  titleStyle: ISharedItem['titleStyle'],
): Record<string, unknown> | undefined {
  if (!titleStyle) return undefined;
  return {
    ...titleStyle,
    color: titleStyle.color === undefined ? undefined : processColor(titleStyle.color),
  };
}

function prepareBadge(badge: ISharedItem['badge']): Record<string, unknown> | undefined {
  if (!badge) return undefined;
  return {
    ...badge,
    style: badge.style
      ? {
          ...badge.style,
          color: badge.style.color === undefined ? undefined : processColor(badge.style.color),
          backgroundColor:
            badge.style.backgroundColor === undefined
              ? undefined
              : processColor(badge.style.backgroundColor),
        }
      : undefined,
  };
}

// onPress is captured separately into the buttonId/menuId -> handler map (collectBarButtonHandlers/
// collectMenuHandlers below) and must never reach native: a function value fails Fabric's
// dynamic-value serialization, which silently drops the WHOLE headerLeftBarButtonItems/
// headerRightBarButtonItems array it's nested in — not just the one bad field — so bar buttons and
// menu actions never reached native at all, despite the buttonId/menuId dispatch wiring itself
// being entirely correct.
function excludeOnPress<T extends { onPress: unknown }>(item: T): Omit<T, 'onPress'> {
  const { onPress: _onPress, ...rest } = item;
  return rest;
}

// Shared fields common to the 'button' and 'menu' item variants (title/icon/tint/badge/…) — the
// 'spacing' variant carries none of these and passes through untouched.
function prepareSharedFields(
  item: IHeaderBarButtonItem & { type: 'button' | 'menu' },
): Record<string, unknown> {
  return {
    ...(item.type === 'button' ? excludeOnPress(item) : item),
    ...prepareIcon(item.icon),
    titleStyle: prepareTitleStyle(item.titleStyle),
    tintColor: item.tintColor === undefined ? undefined : processColor(item.tintColor),
    badge: prepareBadge(item.badge),
  };
}

type IMenuLike = { items: (IHeaderBarButtonMenuAction | IHeaderBarButtonSubmenu)[] };

// Recursively tags every menu action with a `menuId` derived from its tree position
// (`${path}-${index}-${side}`), mirroring RNS's own prepareMenu exactly — the id must match what
// buildHeaderBarButtonDispatch computes below, or a press silently no-ops.
function prepareMenuItems<T extends IMenuLike>(
  menuLike: T,
  index: number,
  side: 'left' | 'right',
  path = '',
): T {
  return {
    ...menuLike,
    items: menuLike.items.map((menuItem, menuIndex) => {
      const currentPath = path ? `${path}.${menuIndex}` : `${menuIndex}`;
      const icon = prepareIcon(menuItem.icon);
      if (menuItem.type === 'submenu') {
        return { ...menuItem, ...icon, ...prepareMenuItems(menuItem, index, side, currentPath) };
      }
      return { ...excludeOnPress(menuItem), ...icon, menuId: `${currentPath}-${index}-${side}` };
    }),
  };
}

// Builds the native-shaped payload react-native-screens' own ScreenStackHeaderConfig component
// would send down (buttonId/menuId-tagged, colors processColor'd) — this is what
// IHeaderConfigViewProps.headerLeftBarButtonItems/headerRightBarButtonItems actually carry.
function prepareHeaderBarButtonItems(
  items: IHeaderBarButtonItem[] | undefined,
  side: 'left' | 'right',
): unknown[] | undefined {
  if (!items) return undefined;
  return items.map((item, index) => {
    if (item.type === 'spacing') return item;
    const prepared = prepareSharedFields(item);
    if (item.type === 'button') return { ...prepared, buttonId: `${index}-${side}` };
    return { ...prepared, menu: prepareMenuItems(item.menu, index, side) };
  });
}

function collectMenuHandlers(
  items: (IHeaderBarButtonMenuAction | IHeaderBarButtonSubmenu)[],
  index: number,
  side: 'left' | 'right',
  path: string,
  handlers: Map<string, () => void>,
): void {
  items.forEach((item, menuIndex) => {
    const currentPath = path ? `${path}.${menuIndex}` : `${menuIndex}`;
    if (item.type === 'submenu') {
      collectMenuHandlers(item.items, index, side, currentPath, handlers);
      return;
    }
    handlers.set(`${currentPath}-${index}-${side}`, item.onPress);
  });
}

function collectBarButtonHandlers(
  items: IHeaderBarButtonItem[] | undefined,
  side: 'left' | 'right',
  buttonHandlers: Map<string, () => void>,
  menuHandlers: Map<string, () => void>,
): void {
  items?.forEach((item, index) => {
    if (item.type === 'button') {
      buttonHandlers.set(`${index}-${side}`, item.onPress);
    } else if (item.type === 'menu') {
      collectMenuHandlers(item.menu.items, index, side, '', menuHandlers);
    }
  });
}

function readStringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

type IHeaderBarButtonDispatch = {
  onPressHeaderBarButtonItem?: (event: ISymbioteEvent) => void;
  onPressHeaderBarButtonMenuItem?: (event: ISymbioteEvent) => void;
};

// The buttonId/menuId → onPress lookup is built independently from prepareHeaderBarButtonItems'
// native payload (rather than re-parsing it back out of the `unknown[]` result) — one shared id
// algorithm, walked twice over the ORIGINAL typed items, so a change to the id scheme can't
// desync payload tagging from dispatch lookup.
function buildHeaderBarButtonDispatch(
  leftItems: IHeaderBarButtonItem[] | undefined,
  rightItems: IHeaderBarButtonItem[] | undefined,
): IHeaderBarButtonDispatch {
  const buttonHandlers = new Map<string, () => void>();
  const menuHandlers = new Map<string, () => void>();
  collectBarButtonHandlers(leftItems, 'left', buttonHandlers, menuHandlers);
  collectBarButtonHandlers(rightItems, 'right', buttonHandlers, menuHandlers);
  if (buttonHandlers.size === 0 && menuHandlers.size === 0) return {};
  return {
    onPressHeaderBarButtonItem: event => {
      const buttonId = readStringField(event.nativeEvent, 'buttonId');
      if (buttonId !== undefined) buttonHandlers.get(buttonId)?.();
    },
    onPressHeaderBarButtonMenuItem: event => {
      const menuId = readStringField(event.nativeEvent, 'menuId');
      if (menuId !== undefined) menuHandlers.get(menuId)?.();
    },
  };
}

function toOptionalBooleanNativeProp(value: boolean | undefined): IOptionalBooleanNativeProp {
  if (value === undefined) return 'undefined';
  return value ? 'true' : 'false';
}

export function resolveHeaderConfigView(
  options: IScreenOptions | undefined,
  platform: INavigatorPlatform,
  passthrough: Record<string, unknown> = {},
): IHeaderConfigViewProps {
  return {
    title: options?.title,
    hidden: options?.headerShown === false,
    backTitle: options?.headerBackTitle,
    backTitleVisible: platform.defaultHeaderBackTitleVisible,
    backButtonDisplayMode: options?.headerBackButtonDisplayMode,
    largeTitle: options?.headerLargeTitle,
    translucent: options?.headerTranslucent,
    color: options?.headerTintColor,
    titleColor: options?.headerTitleColor,
    backgroundColor: options?.headerStyle?.backgroundColor,
    largeTitleBackgroundColor: options?.headerLargeStyle?.backgroundColor,
    userInterfaceStyle: options?.headerUserInterfaceStyle,
    headerLeftBarButtonItems: prepareHeaderBarButtonItems(
      options?.headerLeftBarButtonItems,
      'left',
    ),
    headerRightBarButtonItems: prepareHeaderBarButtonItems(
      options?.headerRightBarButtonItems,
      'right',
    ),
    ...buildHeaderBarButtonDispatch(
      options?.headerLeftBarButtonItems,
      options?.headerRightBarButtonItems,
    ),
    passthrough,
  };
}

export function resolveScreenView(
  screenId: string,
  activityState: number,
  options: IScreenOptions | undefined,
  passthrough: Record<string, unknown> = {},
): IScreenViewProps {
  const sheetAllowedDetents = resolveSheetAllowedDetents(options?.sheetAllowedDetents);
  const lastDetentIndex = sheetAllowedDetents.length - 1;
  return {
    screenId,
    activityState,
    gestureEnabled: options?.gestureEnabled,
    stackAnimation: options?.stackAnimation,
    stackPresentation: options?.stackPresentation,
    transitionDuration: options?.transitionDuration,
    sheetAllowedDetents,
    sheetLargestUndimmedDetent: resolveSheetLargestUndimmedDetent(
      options?.sheetLargestUndimmedDetentIndex,
      lastDetentIndex,
    ),
    sheetInitialDetent: resolveSheetInitialDetent(
      options?.sheetInitialDetentIndex,
      lastDetentIndex,
    ),
    sheetGrabberVisible: options?.sheetGrabberVisible,
    sheetCornerRadius: options?.sheetCornerRadius,
    sheetExpandsWhenScrolledToEdge: options?.sheetExpandsWhenScrolledToEdge,
    sheetElevation: options?.sheetElevation,
    sheetShouldOverflowTopInset: options?.sheetShouldOverflowTopInset,
    sheetDefaultResizeAnimationEnabled: options?.sheetDefaultResizeAnimationEnabled,
    statusBarStyle: options?.statusBarStyle,
    statusBarHidden: options?.statusBarHidden,
    statusBarAnimation: options?.statusBarAnimation,
    screenOrientation: options?.screenOrientation,
    passthrough,
  };
}

// RNSSearchBar is a standalone Fabric leaf (react-native-screens mounts it as a header-subview
// child in its own JS component) — resolveSearchBarView only folds the static config surface;
// where/how the adapter mounts the resulting leaf in the header tree is an adapter concern.
export function resolveSearchBarView(
  options: ISearchBarOptions | undefined,
  passthrough: Record<string, unknown> = {},
): ISearchBarViewProps {
  return {
    placeholder: options?.placeholder,
    autoCapitalize: options?.autoCapitalize,
    placement: options?.placement,
    hideWhenScrolling: options?.hideWhenScrolling,
    allowToolbarIntegration: options?.allowToolbarIntegration,
    obscureBackground: toOptionalBooleanNativeProp(options?.obscureBackground),
    hideNavigationBar: toOptionalBooleanNativeProp(options?.hideNavigationBar),
    cancelButtonText: options?.cancelButtonText,
    barTintColor: options?.barTintColor,
    tintColor: options?.tintColor,
    textColor: options?.textColor,
    autoFocus: options?.autoFocus,
    disableBackButtonOverride: options?.disableBackButtonOverride,
    inputType: options?.inputType,
    hintTextColor: options?.hintTextColor,
    headerIconColor: options?.headerIconColor,
    shouldShowHintSearchIcon: options?.shouldShowHintSearchIcon,
    passthrough,
  };
}
