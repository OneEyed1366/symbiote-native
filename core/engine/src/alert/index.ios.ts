// Alert: iOS build. The native module is `AlertManager`
// (RN's TurboModuleRegistry.get('AlertManager')); `alertWithArgs(args, callback)` pops the
// native alert, and the native `callback(id, value)` reports which button (by numeric id)
// the user tapped plus any text-input value. `alert` delegates to `prompt`, the same
// AlertManager path RN uses. Metro picks this file on an iOS host; the base alert.ts
// re-exports it for web/headless.
//
// The native contract is confirmed from RN's TurboModule spec for
// `INativeAlertManager`:
//   alertWithArgs(args: Args, callback: (id: number, value: string) => void)
//
// Non-throwing, like StatusBar: a missing native module is a no-op, never a crash (on a
// device the module may be absent).

import { dlog } from '../debug';
import { getNativeModule } from '../native-modules';

import type {
  IAlertButtons,
  IAlertOptions,
  IAlertStatic,
  IAlertType,
} from './shared';

export type {
  IAlertButton,
  IAlertButtonStyle,
  IAlertButtons,
  IAlertOptions,
  IAlertType,
} from './shared';

const ALERT_MANAGER = 'AlertManager';

// The native `Args` the spec accepts. Each entry in `buttons` is a single-key map of
// `{ [index]: label }`, RN's wire shape (the native side assigns the tapped button's
// index back as the callback `id`).
type IAlertArgs = {
  title: string;
  message?: string;
  buttons: Array<Record<number, string>>;
  type?: IAlertType;
  defaultValue?: string;
  cancelButtonKey?: string;
  destructiveButtonKey?: string;
  preferredButtonKey?: string;
  keyboardType?: string;
  userInterfaceStyle?: string;
};

// Нативный модуль с одним методом `alertWithArgs`, `id` и `value` приходят уже типизированными
type INativeAlertManager = {
  alertWithArgs(
    args: IAlertArgs,
    callback: (id: number, value: string) => void,
  ): void;
};

type IPromptCallbackOrButtons = ((text: string) => void) | IAlertButtons;

type IButtonPlan = {
  // Индекс кнопки это id, который native возвращает в callback
  callbacks: Array<((value: string) => void) | undefined>;
  buttons: Array<Record<number, string>>;
  cancelButtonKey?: string;
  destructiveButtonKey?: string;
  preferredButtonKey?: string;
};

// Разбираем кнопки так же, как RN, включая его особенность с последней кнопкой без `text`
function planButtons(
  callbackOrButtons?: IPromptCallbackOrButtons,
): IButtonPlan {
  const plan: IButtonPlan = { callbacks: [], buttons: [] };
  if (typeof callbackOrButtons === 'function') {
    plan.callbacks = [callbackOrButtons];
    return plan;
  }
  if (!Array.isArray(callbackOrButtons)) return plan;
  callbackOrButtons.forEach((btn, index) => {
    plan.callbacks[index] = btn.onPress;
    if (btn.style === 'cancel') {
      plan.cancelButtonKey = String(index);
    } else if (btn.style === 'destructive') {
      plan.destructiveButtonKey = String(index);
    }
    if (btn.isPreferred) {
      plan.preferredButtonKey = String(index);
    }
    // Последняя кнопка без текста не попадает в native, и её `onPress` уже не сработает
    if (btn.text || index < callbackOrButtons.length - 1) {
      plan.buttons.push({ [index]: btn.text || '' });
    }
  });
  return plan;
}

// Позиционная сигнатура RN, поэтому tuple, а не объект
type IPromptArgs = [
  title?: string,
  message?: string,
  callbackOrButtons?: IPromptCallbackOrButtons,
  type?: IAlertType,
  defaultValue?: string,
  keyboardType?: string,
  options?: IAlertOptions,
];

// Без нативного модуля пишем в лог и выходим
function prompt(...args: IPromptArgs): void {
  const [
    title,
    message,
    callbackOrButtons,
    type = 'plain-text',
    defaultValue,
    keyboardType,
    options,
  ] = args;
  dlog('Alert.prompt');

  const {
    callbacks,
    buttons,
    cancelButtonKey,
    destructiveButtonKey,
    preferredButtonKey,
  } = planButtons(callbackOrButtons);

  const manager = getNativeModule<INativeAlertManager>(ALERT_MANAGER);
  if (manager === null) {
    dlog(`Alert.prompt: "${ALERT_MANAGER}" unresolved — no-op`);
    return;
  }

  manager.alertWithArgs(
    {
      title: title ?? '',
      message: message || undefined,
      buttons,
      type: type || undefined,
      defaultValue,
      cancelButtonKey,
      destructiveButtonKey,
      preferredButtonKey,
      keyboardType,
      userInterfaceStyle: options?.userInterfaceStyle || undefined,
    },
    (id, value) => {
      dlog(`Alert callback id=${id}`);
      callbacks[id]?.(value);
    },
  );
}

// The static imperative API RN exposes, mirrored as a static-method object. `prompt` is
// iOS-only, so it lives beyond IAlertStatic on this build.
export const Alert: IAlertStatic & { prompt: typeof prompt } = {
  // alert delegates to prompt (same AlertManager path), exactly as RN does on iOS.
  alert(
    title?: string,
    message?: string,
    buttons?: IAlertButtons,
    options?: IAlertOptions,
  ): void {
    prompt(title, message, buttons, 'default', undefined, undefined, options);
  },

  prompt,
};
