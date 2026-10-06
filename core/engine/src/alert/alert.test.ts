// Unit test for the Alert imperative module across BOTH native
// backends and both platform builds. The platform builds are separate files
// (alert/index.ios.ts / alert/index.android.ts), imported DIRECTLY here. Fake native
// modules (installed via the New-Architecture `__turboModuleProxy` global, the same global
// getNativeModule reads) stand in for the host.
//
// Alert is deliberately non-throwing (like StatusBar/ActionSheetIOS): a missing native module
// degrades to a logged no-op, never a crash. So each platform is grouped Positive / no-op
// (native module unavailable) rather than Positive/Negative.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ICapturedArgs = {
  title: string;
  message?: string;
  buttons: Array<Record<number, string>>;
  type?: string;
  cancelButtonKey?: string;
  destructiveButtonKey?: string;
  preferredButtonKey?: string;
};

type IDialogConfig = {
  title: string;
  message: string;
  cancelable: boolean;
  buttonPositive?: string;
  buttonNegative?: string;
  buttonNeutral?: string;
};

const ANDROID_CONSTANTS = {
  buttonClicked: 'buttonClicked',
  dismissed: 'dismissed',
  buttonPositive: -1,
  buttonNegative: -2,
  buttonNeutral: -3,
};

let iosAlert: typeof import('./index.ios').Alert;
let androidAlert: typeof import('./index.android').Alert;

let captured: ICapturedArgs | null;
let capturedConfig: IDialogConfig | null;

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

type IFakeAlertManager = {
  alertWithArgs(
    args: ICapturedArgs,
    callback: (id: number, value: string) => void,
  ): void;
};

type IFakeDialogManagerAndroid = {
  getConstants(): unknown;
  showAlert(
    config: IDialogConfig,
    onError: (error: string) => void,
    onAction: (action: string, buttonKey?: number) => void,
  ): void;
};

// iOS: records the args and invokes the native callback with the id of whichever button
// index the test asks for (default: the second button, index 1).
function fakeAlertManager(tappedId = 1): IFakeAlertManager {
  return {
    alertWithArgs(args, callback): void {
      captured = args;
      callback(tappedId, '');
    },
  };
}

// Android: getConstants() + showAlert that immediately fires the real onAction it's handed
// with a tap on the positive button (RN's DialogManagerAndroid shape).
function fakeDialogManagerAndroid(): IFakeDialogManagerAndroid {
  return {
    getConstants(): typeof ANDROID_CONSTANTS {
      return ANDROID_CONSTANTS;
    },
    showAlert(config, _onError, onAction): void {
      capturedConfig = config;
      onAction(
        ANDROID_CONSTANTS.buttonClicked,
        ANDROID_CONSTANTS.buttonPositive,
      );
    },
  };
}

function installFakeModules(config: {
  alert?: IFakeAlertManager | null;
  dialog?: IFakeDialogManagerAndroid | null;
}): void {
  globalThis.__turboModuleProxy = <T>(name: string): T | null => {
    if (name === 'AlertManager') {
      return config.alert !== undefined &&
        config.alert !== null &&
        isPresent<T>(config.alert)
        ? config.alert
        : null;
    }
    if (name === 'DialogManagerAndroid') {
      return config.dialog !== undefined &&
        config.dialog !== null &&
        isPresent<T>(config.dialog)
        ? config.dialog
        : null;
    }
    return null;
  };
}

beforeEach(async () => {
  captured = null;
  capturedConfig = null;

  installFakeModules({
    alert: fakeAlertManager(),
    dialog: fakeDialogManagerAndroid(),
  });

  vi.resetModules();
  ({ Alert: iosAlert } = await import('./index.ios'));
  ({ Alert: androidAlert } = await import('./index.android'));
});

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
});

describe('Alert (iOS build -> AlertManager)', () => {
  describe('Positive', () => {
    it('passes title/message and both buttons to native, and dispatches the tapped id', () => {
      let okPressed = false;
      iosAlert.alert('t', 'm', [
        { text: 'Cancel' },
        {
          text: 'OK',
          onPress: () => {
            okPressed = true;
          },
        },
      ]);

      expect(captured).not.toBeNull();
      expect(captured?.title).toBe('t');
      expect(captured?.message).toBe('m');
      // Both buttons must reach native as { [index]: label } entries.
      expect(captured?.buttons).toHaveLength(2);
      expect(captured?.buttons[0][0]).toBe('Cancel');
      expect(captured?.buttons[1][1]).toBe('OK');
      // native returned id=1, so the second button's onPress must have fired.
      expect(okPressed).toBe(true);
    });

    // Стиль кнопки уходит в native ключом по индексу, по нему рисуются destructive и preferred
    it('maps button style/isPreferred to cancelButtonKey/destructiveButtonKey/preferredButtonKey by index', () => {
      iosAlert.alert('t', 'm', [
        { text: 'Delete', style: 'destructive' },
        { text: 'OK', isPreferred: true },
        { text: 'Cancel', style: 'cancel' },
      ]);
      expect(captured?.destructiveButtonKey).toBe('0');
      expect(captured?.preferredButtonKey).toBe('1');
      expect(captured?.cancelButtonKey).toBe('2');
    });

    // why: prompt() is the general entry both `alert` (type 'default') and text-input dialogs
    // share — the type string must reach native verbatim so the native side renders the right
    // input field (plain vs secure vs login/password), not just the title/message/buttons.
    it('prompt forwards a non-default type to native', () => {
      iosAlert.prompt('Enter PIN', undefined, () => undefined, 'secure-text');
      expect(captured?.type).toBe('secure-text');
    });
  });

  describe('trailing textless button — upstream parity', () => {
    // Баг RN `Alert.js:173`: `onPress` такой кнопки уже не сработает, native её не знает
    it('drops a trailing button with no text from the native buttons list', () => {
      iosAlert.alert('t', 'm', [{ text: 'Cancel' }, {}]);
      expect(captured?.buttons).toHaveLength(1);
      expect(captured?.buttons[0][0]).toBe('Cancel');
    });

    // RN проверяет `btn.text` на truthiness, пустая подпись отбрасывается как и отсутствующая
    it('drops a trailing button whose text is empty', () => {
      iosAlert.alert('t', 'm', [{ text: 'Cancel' }, { text: '' }]);
      expect(captured?.buttons).toHaveLength(1);
    });

    it('keeps an empty-text button that is not the last', () => {
      iosAlert.alert('t', 'm', [{ text: '' }, { text: 'OK' }]);
      expect(captured?.buttons).toEqual([{ 0: '' }, { 1: 'OK' }]);
    });
  });

  describe('no-op (native module unavailable)', () => {
    // why: AlertManager may be unlinked on a given host — alert() must degrade silently rather
    // than throw, and no onPress can ever fire since native never calls back.
    it('alert is a no-op and never invokes any onPress', () => {
      installFakeModules({ alert: null });
      let pressed = false;
      expect(() =>
        iosAlert.alert('t', 'm', [
          { text: 'OK', onPress: () => (pressed = true) },
        ]),
      ).not.toThrow();
      expect(pressed).toBe(false);
    });
  });
});

describe('Alert (Android build -> DialogManagerAndroid)', () => {
  describe('Positive', () => {
    it('maps last/middle/first buttons to positive/negative/neutral and fires only positive', () => {
      let androidPositivePressed = false;
      let androidNeutralPressed = false;

      androidAlert.alert('androidTitle', 'androidMsg', [
        {
          text: 'Neutral',
          onPress: () => {
            androidNeutralPressed = true;
          },
        },
        { text: 'Cancel' },
        {
          text: 'OK',
          onPress: () => {
            androidPositivePressed = true;
          },
        },
      ]);

      expect(capturedConfig).not.toBeNull();
      expect(capturedConfig?.title).toBe('androidTitle');
      expect(capturedConfig?.message).toBe('androidMsg');
      expect(capturedConfig?.buttonPositive).toBe('OK');
      expect(capturedConfig?.buttonNegative).toBe('Cancel');
      expect(capturedConfig?.buttonNeutral).toBe('Neutral');
      // onAction fired buttonPositive, so only OK's onPress must have run.
      expect(androidPositivePressed).toBe(true);
      expect(androidNeutralPressed).toBe(false);
    });

    // Четвёртая кнопка отбрасывается молча, остальные идут в neutral, negative и positive
    it('more than three buttons: only the first three are used, the rest are dropped', () => {
      androidAlert.alert('t', 'm', [
        { text: 'Neutral' },
        { text: 'Cancel' },
        { text: 'OK' },
        { text: 'Extra' },
      ]);
      expect(capturedConfig?.buttonNeutral).toBe('Neutral');
      expect(capturedConfig?.buttonNegative).toBe('Cancel');
      expect(capturedConfig?.buttonPositive).toBe('OK');
    });

    // Без массива кнопок RN показывает одну кнопку OK
    it('no buttons supplied defaults to a single OK positive button', () => {
      androidAlert.alert('t', 'm');
      expect(capturedConfig?.buttonPositive).toBe('OK');
      expect(capturedConfig?.buttonNegative).toBeUndefined();
      expect(capturedConfig?.buttonNeutral).toBeUndefined();
    });

    // OK по умолчанию только при отсутствии `buttons`, пустой массив даёт диалог без кнопок
    it('an explicit empty buttons array shows no buttons', () => {
      androidAlert.alert('t', 'm', []);
      expect(capturedConfig?.buttonPositive).toBeUndefined();
      expect(capturedConfig?.buttonNegative).toBeUndefined();
      expect(capturedConfig?.buttonNeutral).toBeUndefined();
    });

    // `dismissed` вызывает `onDismiss`, а не `onPress` кнопки
    it('the dismissed action fires options.onDismiss instead of a button onPress', () => {
      installFakeModules({
        alert: fakeAlertManager(),
        dialog: {
          getConstants: () => ANDROID_CONSTANTS,
          showAlert(_config, _onError, onAction): void {
            onAction(ANDROID_CONSTANTS.dismissed);
          },
        },
      });
      let dismissed = false;
      let pressed = false;
      androidAlert.alert(
        't',
        'm',
        [{ text: 'OK', onPress: () => (pressed = true) }],
        {
          onDismiss: () => (dismissed = true),
        },
      );
      expect(dismissed).toBe(true);
      expect(pressed).toBe(false);
    });

    // RN показывает ошибку нативного диалога через `console.warn`
    it('warns with the native error message', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      installFakeModules({
        dialog: {
          getConstants: () => ANDROID_CONSTANTS,
          showAlert(_config, onError): void {
            onError('dialog failed');
          },
        },
      });
      androidAlert.alert('t', 'm');
      expect(warn).toHaveBeenCalledWith('dialog failed');
      warn.mockRestore();
    });

    // `getConstants()` с чужим форматом откатывается на зашитые ключи кнопок
    it('falls back to the documented button-key defaults when getConstants returns something malformed', () => {
      installFakeModules({
        alert: fakeAlertManager(),
        dialog: {
          getConstants: () => 'not-an-object',
          showAlert(_config, _onError, onAction): void {
            // The hardwired default buttonPositive is -1 (ANDROID_DIALOG_CONSTANTS in the
            // production module) — firing that id must still resolve to the positive button.
            onAction('buttonClicked', -1);
          },
        },
      });
      let pressed = false;
      androidAlert.alert('t', 'm', [
        { text: 'OK', onPress: () => (pressed = true) },
      ]);
      expect(pressed).toBe(true);
    });

    // why: Android's Alert has no native prompt (DialogManagerAndroid exposes no text-input
    // path) — the symbol must exist for surface parity but stay an inert no-op, never throw.
    it('prompt is a documented no-op on Android', () => {
      expect(() => androidAlert.prompt()).not.toThrow();
    });
  });

  describe('no-op (native module unavailable)', () => {
    it('alert is a no-op and never invokes any onPress', () => {
      installFakeModules({ dialog: null });
      let pressed = false;
      expect(() =>
        androidAlert.alert('t', 'm', [
          { text: 'OK', onPress: () => (pressed = true) },
        ]),
      ).not.toThrow();
      expect(pressed).toBe(false);
    });
  });
});
