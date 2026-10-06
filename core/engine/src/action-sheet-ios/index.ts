// ActionSheetIOS: императивный модуль поверх нативного `ActionSheetManager`, только iOS
// Как в `ActionSheetIOS.js`: инварианты на аргументы, цвета через `processColor`

import { dlog } from '../debug';
import { invariant } from '../invariant';
import { getNativeModule } from '../native-modules';
import { isProcessableColor, processColor } from '../platform-color';

export const ACTION_SHEET_MANAGER = 'ActionSheetManager';

// Без нативного модуля методы бросают это сообщение, как RN
const MISSING_MANAGER = "ActionSheetManager doesn't exist";
const COLOR_ERROR =
  'Unexpected color given for ActionSheetIOS.showActionSheetWithOptions';

export type IActionSheetIOSOptions = {
  title?: string;
  message?: string;
  options: string[];
  // Один индекс или массив, в native всегда уходит массив
  destructiveButtonIndex?: number | number[];
  cancelButtonIndex?: number;
  anchor?: number;
  tintColor?: unknown;
  cancelButtonTintColor?: unknown;
  disabledButtonTintColor?: unknown;
  userInterfaceStyle?: string;
  disabledButtonIndices?: number[];
};

// Что получает native: цвета уже числа, destructive всегда массивом или `null`
type INativeActionSheetOptions = Omit<
  IActionSheetIOSOptions,
  | 'destructiveButtonIndex'
  | 'tintColor'
  | 'cancelButtonTintColor'
  | 'disabledButtonTintColor'
> & {
  destructiveButtonIndices: number[] | null;
  tintColor?: number;
  cancelButtonTintColor?: number;
  disabledButtonTintColor?: number;
};

export type IShareActionSheetIOSOptions = {
  message?: string;
  url?: string;
  subject?: string;
  anchor?: number;
  tintColor?: unknown;
  cancelButtonTintColor?: unknown;
  disabledButtonTintColor?: unknown;
  excludedActivityTypes?: string[];
  userInterfaceStyle?: string;
};

export type IShareActionSheetError = {
  domain: string;
  code: string;
  userInfo?: Record<string, unknown>;
  message: string;
};

export type INativeActionSheetManager = {
  showActionSheetWithOptions(
    options: INativeActionSheetOptions,
    callback: (buttonIndex: number) => void,
  ): void;
  showShareActionSheetWithOptions(
    options: IShareActionSheetIOSOptions,
    failureCallback: (error: IShareActionSheetError) => void,
    successCallback: (completed: boolean, activityType?: string) => void,
  ): void;
  dismissActionSheet?(): void;
};

function requireManager(): INativeActionSheetManager {
  const manager =
    getNativeModule<INativeActionSheetManager>(ACTION_SHEET_MANAGER);
  invariant(manager !== null, MISSING_MANAGER);
  return manager;
}

function numericColor(color: unknown, name: string): number | undefined {
  const processed = isProcessableColor(color) ? processColor(color) : undefined;
  invariant(
    processed === undefined ||
      processed === null ||
      typeof processed === 'number',
    `${COLOR_ERROR} ${name}`,
  );
  return typeof processed === 'number' ? processed : undefined;
}

function destructiveIndices(
  index: number | number[] | undefined,
): number[] | null {
  if (Array.isArray(index)) return index;
  return typeof index === 'number' ? [index] : null;
}

export const ActionSheetIOS = {
  showActionSheetWithOptions(
    options: IActionSheetIOSOptions,
    callback: (buttonIndex: number) => void,
  ): void {
    invariant(
      typeof options === 'object' && options !== null,
      'Options must be a valid object',
    );
    invariant(typeof callback === 'function', 'Must provide a valid callback');
    const manager = requireManager();
    dlog('ActionSheetIOS.showActionSheetWithOptions');
    const {
      tintColor,
      cancelButtonTintColor,
      disabledButtonTintColor,
      destructiveButtonIndex,
      ...remainingOptions
    } = options;
    manager.showActionSheetWithOptions(
      {
        ...remainingOptions,
        tintColor: numericColor(tintColor, 'tintColor'),
        cancelButtonTintColor: numericColor(
          cancelButtonTintColor,
          'cancelButtonTintColor',
        ),
        disabledButtonTintColor: numericColor(
          disabledButtonTintColor,
          'disabledButtonTintColor',
        ),
        destructiveButtonIndices: destructiveIndices(destructiveButtonIndex),
      },
      buttonIndex => {
        dlog(`ActionSheetIOS callback buttonIndex=${buttonIndex}`);
        callback(buttonIndex);
      },
    );
  },

  showShareActionSheetWithOptions(
    options: IShareActionSheetIOSOptions,
    failureCallback: (error: IShareActionSheetError) => void,
    successCallback: (completed: boolean, activityType?: string) => void,
  ): void {
    invariant(
      typeof options === 'object' && options !== null,
      'Options must be a valid object',
    );
    invariant(
      typeof failureCallback === 'function',
      'Must provide a valid failureCallback',
    );
    invariant(
      typeof successCallback === 'function',
      'Must provide a valid successCallback',
    );
    const manager = requireManager();
    dlog('ActionSheetIOS.showShareActionSheetWithOptions');
    const tintColor = isProcessableColor(options.tintColor)
      ? processColor(options.tintColor)
      : undefined;
    manager.showShareActionSheetWithOptions(
      { ...options, tintColor },
      error => {
        dlog('ActionSheetIOS share failure callback');
        failureCallback(error);
      },
      (completed, activityType) => {
        dlog(`ActionSheetIOS share success completed=${completed}`);
        successCallback(completed, activityType);
      },
    );
  },

  dismissActionSheet(): void {
    const manager = requireManager();
    dlog('ActionSheetIOS.dismissActionSheet');
    if (typeof manager.dismissActionSheet === 'function') {
      manager.dismissActionSheet();
    }
  },
};
