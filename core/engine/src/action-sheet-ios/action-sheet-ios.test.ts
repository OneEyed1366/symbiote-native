// Фейковый ActionSheetManager пишет опции и сразу вызывает callback с индексом 1
// Как в RN, без нативного модуля методы бросают, а не молчат

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ICapturedOptions = {
  options: string[];
  cancelButtonIndex?: number;
  destructiveButtonIndex?: number | number[];
  destructiveButtonIndices?: number[] | null;
  tintColor?: unknown;
  cancelButtonTintColor?: unknown;
  disabledButtonTintColor?: unknown;
};

type ICapturedShareOptions = {
  message?: string;
  url?: string;
  tintColor?: unknown;
};

let ActionSheetIOS: typeof import('./index').ActionSheetIOS;

let captured: ICapturedOptions | null;
let capturedShare: ICapturedShareOptions | null;
let dismissCalled: boolean;

const MISSING_MANAGER = "ActionSheetManager doesn't exist";

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

type IFakeManager = {
  showActionSheetWithOptions?(
    options: ICapturedOptions,
    callback: (buttonIndex: number) => void,
  ): void;
  showShareActionSheetWithOptions?(
    options: ICapturedShareOptions,
    failureCallback: (error: { message: string }) => void,
    successCallback: (completed: boolean, activityType?: string) => void,
  ): void;
  dismissActionSheet?(): void;
};

function installFakeManager(manager: IFakeManager | null): void {
  globalThis.__turboModuleProxy = <T>(name: string): T | null =>
    name === 'ActionSheetManager' && manager !== null && isPresent<T>(manager)
      ? manager
      : null;
}

function defaultFakeManager(): Required<
  Pick<IFakeManager, 'showActionSheetWithOptions'>
> &
  IFakeManager {
  return {
    showActionSheetWithOptions(
      options: ICapturedOptions,
      callback: (buttonIndex: number) => void,
    ): void {
      captured = options;
      callback(1);
    },
    showShareActionSheetWithOptions(
      options: ICapturedShareOptions,
      _failureCallback,
      successCallback,
    ): void {
      capturedShare = options;
      successCallback(true, 'com.apple.UIKit.activity.Mail');
    },
    dismissActionSheet(): void {
      dismissCalled = true;
    },
  };
}

beforeEach(async () => {
  captured = null;
  capturedShare = null;
  dismissCalled = false;

  installFakeManager(defaultFakeManager());

  vi.resetModules();
  ({ ActionSheetIOS } = await import('./index'));
});

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
});

describe('ActionSheetIOS', () => {
  describe('Positive', () => {
    it('passes options through, normalizes a single destructiveButtonIndex, and delivers the chosen index', () => {
      let chosen = -1;
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['A', 'B', 'Cancel'],
          cancelButtonIndex: 2,
          destructiveButtonIndex: 1,
        },
        idx => {
          chosen = idx;
        },
      );

      expect(captured?.options).toEqual(['A', 'B', 'Cancel']);
      expect(captured?.cancelButtonIndex).toBe(2);
      expect(captured?.destructiveButtonIndex).toBeUndefined();
      expect(captured?.destructiveButtonIndices).toEqual([1]);
      expect(chosen).toBe(1);
    });

    it('an array destructiveButtonIndex passes through unchanged', () => {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['A', 'B'], destructiveButtonIndex: [0, 1] },
        () => undefined,
      );
      expect(captured?.destructiveButtonIndices).toEqual([0, 1]);
    });

    // RN отдаёт native `null`, а не пропускает ключ
    it('omitting destructiveButtonIndex sends destructiveButtonIndices as null', () => {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['A', 'B'] },
        () => undefined,
      );
      expect(captured?.destructiveButtonIndices).toBeNull();
    });

    // RN прогоняет три цвета через `processColor`, в native уходит число
    it('sends processed tint colors', async () => {
      const { setColorProcessor } = await import('../platform-color');
      setColorProcessor(value => (value === '#ff0000' ? 0xff_ff_00_00 : value));
      try {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: ['A'],
            tintColor: '#ff0000',
            cancelButtonTintColor: '#ff0000',
            disabledButtonTintColor: '#ff0000',
          },
          () => undefined,
        );
      } finally {
        setColorProcessor(value => value);
      }
      expect(captured?.tintColor).toBe(0xff_ff_00_00);
      expect(captured?.cancelButtonTintColor).toBe(0xff_ff_00_00);
      expect(captured?.disabledButtonTintColor).toBe(0xff_ff_00_00);
    });

    it('showShareActionSheetWithOptions forwards options and delivers the success callback', () => {
      let completedResult: boolean | null = null;
      let activityTypeResult: string | undefined;
      ActionSheetIOS.showShareActionSheetWithOptions(
        { message: 'hello', url: 'https://example.com' },
        () => undefined,
        (completed, activityType) => {
          completedResult = completed;
          activityTypeResult = activityType;
        },
      );
      expect(capturedShare?.message).toBe('hello');
      expect(capturedShare?.url).toBe('https://example.com');
      expect(completedResult).toBe(true);
      expect(activityTypeResult).toBe('com.apple.UIKit.activity.Mail');
    });

    it('showShareActionSheetWithOptions sends a processed tintColor', async () => {
      const { setColorProcessor } = await import('../platform-color');
      setColorProcessor(value => (value === '#ff0000' ? 0xff_ff_00_00 : value));
      try {
        ActionSheetIOS.showShareActionSheetWithOptions(
          { message: 'hello', tintColor: '#ff0000' },
          () => undefined,
          () => undefined,
        );
      } finally {
        setColorProcessor(value => value);
      }
      expect(capturedShare?.tintColor).toBe(0xff_ff_00_00);
    });

    it('showShareActionSheetWithOptions delivers the failure callback on native error', () => {
      installFakeManager({
        showActionSheetWithOptions:
          defaultFakeManager().showActionSheetWithOptions,
        showShareActionSheetWithOptions(_options, failureCallback): void {
          failureCallback({ message: 'user cancelled' });
        },
      });
      let failureMessage: string | null = null;
      ActionSheetIOS.showShareActionSheetWithOptions(
        { message: 'hello' },
        error => {
          failureMessage = error.message;
        },
        () => undefined,
      );
      expect(failureMessage).toBe('user cancelled');
    });

    it('dismissActionSheet calls the native dismissActionSheet when present', () => {
      ActionSheetIOS.dismissActionSheet();
      expect(dismissCalled).toBe(true);
    });
  });

  describe('invalid arguments', () => {
    const notAnObject: unknown = JSON.parse('5');
    const notAFunction: unknown = JSON.parse('"x"');

    it('showActionSheetWithOptions needs an options object', () => {
      expect(() =>
        Reflect.apply(ActionSheetIOS.showActionSheetWithOptions, undefined, [
          notAnObject,
          () => undefined,
        ]),
      ).toThrow('Options must be a valid object');
    });

    it('showActionSheetWithOptions needs a callback', () => {
      expect(() =>
        Reflect.apply(ActionSheetIOS.showActionSheetWithOptions, undefined, [
          { options: ['A'] },
          notAFunction,
        ]),
      ).toThrow('Must provide a valid callback');
    });

    it('showShareActionSheetWithOptions needs options and both callbacks', () => {
      const share = ActionSheetIOS.showShareActionSheetWithOptions;
      const noop = () => undefined;
      expect(() =>
        Reflect.apply(share, undefined, [notAnObject, noop, noop]),
      ).toThrow('Options must be a valid object');
      expect(() =>
        Reflect.apply(share, undefined, [{}, notAFunction, noop]),
      ).toThrow('Must provide a valid failureCallback');
      expect(() =>
        Reflect.apply(share, undefined, [{}, noop, notAFunction]),
      ).toThrow('Must provide a valid successCallback');
    });
  });

  describe('native module unavailable', () => {
    beforeEach(() => installFakeManager(null));

    it('showActionSheetWithOptions throws and never invokes the callback', () => {
      let callbackCalled = false;
      expect(() =>
        ActionSheetIOS.showActionSheetWithOptions({ options: ['A'] }, () => {
          callbackCalled = true;
        }),
      ).toThrow(MISSING_MANAGER);
      expect(callbackCalled).toBe(false);
    });

    it('showShareActionSheetWithOptions throws', () => {
      expect(() =>
        ActionSheetIOS.showShareActionSheetWithOptions(
          { message: 'hello' },
          () => undefined,
          () => undefined,
        ),
      ).toThrow(MISSING_MANAGER);
    });

    it('dismissActionSheet throws', () => {
      expect(() => ActionSheetIOS.dismissActionSheet()).toThrow(
        MISSING_MANAGER,
      );
    });
  });

  // Старые хосты могут не иметь `dismissActionSheet`, RN проверяет typeof
  it('dismissActionSheet is a no-op when the module lacks dismissActionSheet', () => {
    installFakeManager({
      showActionSheetWithOptions:
        defaultFakeManager().showActionSheetWithOptions,
    });
    expect(() => ActionSheetIOS.dismissActionSheet()).not.toThrow();
    expect(dismissCalled).toBe(false);
  });
});
