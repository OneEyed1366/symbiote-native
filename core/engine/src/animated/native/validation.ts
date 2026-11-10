// Dev-проверки конфига перед отправкой в native, как `NativeAnimatedValidation` в RN
// Native всё равно упадёт на неподдерживаемом свойстве, лог говорит об этом раньше и понятнее

import { isDevBuild } from '../../platform/shared';
import {
  isSupportedInterpolationParam,
  isSupportedStyleProp,
  isSupportedTransformProp,
} from './allowlist';

export function validateInterpolation(config: object): void {
  if (!isDevBuild()) return;
  for (const key of Object.keys(config)) {
    if (key !== 'debugID' && !isSupportedInterpolationParam(key)) {
      console.error(
        `Interpolation property '${key}' is not supported by native animated module`,
      );
    }
  }
}

export function validateStyles(styles: object): void {
  if (!isDevBuild()) return;
  for (const key of Object.keys(styles)) {
    if (!isSupportedStyleProp(key)) {
      console.error(
        `Style property '${key}' is not supported by native animated module`,
      );
    }
  }
}

export function validateTransform(
  configs: readonly { readonly property: string }[],
): void {
  if (!isDevBuild()) return;
  for (const config of configs) {
    if (!isSupportedTransformProp(config.property)) {
      console.error(
        `Property '${config.property}' is not supported by native animated module`,
      );
    }
  }
}
