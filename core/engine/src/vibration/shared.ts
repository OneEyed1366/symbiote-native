// Общая часть Vibration, платформы подставляют только обход паттерна и отмену
// Модуль `Vibration` называется одинаково на iOS и Android
// Платформу выбирает имя файла, `Platform.OS` не читается

import { dlog } from '../debug';
import { getNativeModule } from '../native-modules';

const VIBRATION_MODULE = 'Vibration';

// RN `_default_vibration_length`: один импульс без паттерна и длина импульса в iOS-планировщике
export const DEFAULT_VIBRATION_LENGTH = 400;

const INVALID_PATTERN = 'Vibration pattern should be a number or array';

export type INativeVibration = {
  vibrate(pattern: number): void;
  vibrateByPattern(pattern: number[], repeat: number): void;
  cancel(): void;
};

export type IVibrationStatic = {
  vibrate(pattern?: number | number[], repeat?: boolean): void;
  cancel(): void;
};

// Android отдаёт паттерн в native, iOS обходит его в JS через `setTimeout`
// У iOS-native `cancel` реализации нет, поэтому отмена там своя, а пока паттерн идёт,
// любой `vibrate` игнорируется
export type IVibrationPlatform = {
  vibratePattern(
    module: INativeVibration,
    pattern: number[],
    repeat: boolean,
  ): void;
  isBusy?(): boolean;
  cancel?(): void;
};

// Свой кэш модуля на каждый вызов, чтобы две платформы в одном тесте не мешали друг другу
export function createVibration(
  platform: IVibrationPlatform,
): IVibrationStatic {
  let vibrationModule: INativeVibration | null | undefined;

  function getModule(): INativeVibration | null {
    if (vibrationModule === undefined) {
      vibrationModule = getNativeModule<INativeVibration>(VIBRATION_MODULE);
      dlog(
        `Vibration: Vibration module ${vibrationModule ? 'resolved' : 'NOT resolved (null)'}`,
      );
    }
    return vibrationModule;
  }

  return {
    // Число это один импульс, массив это паттерн, без нативного модуля ничего не делаем
    vibrate(
      pattern: number | number[] = DEFAULT_VIBRATION_LENGTH,
      repeat = false,
    ): void {
      if (platform.isBusy?.()) return;
      if (typeof pattern !== 'number' && !Array.isArray(pattern)) {
        throw new Error(INVALID_PATTERN);
      }
      const module = getModule();
      if (module === null) {
        dlog('Vibration.vibrate -> Vibration native module unavailable, no-op');
        return;
      }
      if (typeof pattern === 'number') {
        dlog(`Vibration.vibrate -> ${pattern}ms`);
        module.vibrate(pattern);
        return;
      }
      dlog(`Vibration.vibrate -> pattern[${pattern.length}], repeat=${repeat}`);
      platform.vibratePattern(module, pattern, repeat);
    },

    cancel(): void {
      const module = getModule();
      if (module === null) {
        dlog('Vibration.cancel -> Vibration native module unavailable, no-op');
        return;
      }
      dlog('Vibration.cancel');
      if (platform.cancel === undefined) {
        module.cancel();
        return;
      }
      platform.cancel();
    },
  };
}
