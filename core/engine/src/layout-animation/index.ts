// LayoutAnimation: взводит анимацию следующего коммита, сама анимация нативная
// Вызывает `configureNextLayoutAnimation` через слот Fabric или TurboModule `UIManager`

import { getNativeModule } from '../native-modules';
import { dlog } from '../debug';
import { Platform } from '../platform';
import { isRecord } from '../type-guards';

// Как в RN: сначала слот Fabric (JSI-глобал), затем TurboModule `UIManager`
const NATIVE_UI_MANAGER_MODULE_NAME = 'UIManager';

// Запас гонки с нативным callback: один кадр и 1 мс
const COMPLETION_RACE_SLACK_MS = 17;

const ANIMATION_TYPE = {
  spring: 'spring',
  linear: 'linear',
  easeInEaseOut: 'easeInEaseOut',
  easeIn: 'easeIn',
  easeOut: 'easeOut',
  keyboard: 'keyboard',
} as const;

const ANIMATION_PROPERTY = {
  opacity: 'opacity',
  scaleX: 'scaleX',
  scaleY: 'scaleY',
  scaleXY: 'scaleXY',
} as const;

export type ILayoutAnimationType =
  (typeof ANIMATION_TYPE)[keyof typeof ANIMATION_TYPE];
export type ILayoutAnimationProperty =
  (typeof ANIMATION_PROPERTY)[keyof typeof ANIMATION_PROPERTY];

export type ILayoutAnimationTypes = Readonly<
  Record<ILayoutAnimationType, ILayoutAnimationType>
>;
export type ILayoutAnimationProperties = Readonly<
  Record<ILayoutAnimationProperty, ILayoutAnimationProperty>
>;

export type ILayoutAnimationAnim = {
  duration?: number;
  delay?: number;
  springDamping?: number;
  initialVelocity?: number;
  type?: ILayoutAnimationType;
  property?: ILayoutAnimationProperty;
};

export type ILayoutAnimationConfig = {
  duration: number;
  create?: ILayoutAnimationAnim;
  update?: ILayoutAnimationAnim;
  delete?: ILayoutAnimationAnim;
};

type IOnAnimationDidEndCallback = () => void;
type IOnAnimationDidFailCallback = () => void;

// Метод опционален: старый или частичный хост его не отдаёт, перед вызовом проверяем
type INativeLayoutAnimationUIManager = {
  configureNextLayoutAnimation?(
    config: ILayoutAnimationConfig,
    onSuccess: IOnAnimationDidEndCallback,
    onError: IOnAnimationDidFailCallback,
  ): void;
};

// Слот Fabric в `IFabricSlot` этого метода не объявляет, поэтому проверяем в рантайме, как RN
function hasConfigureNextLayoutAnimation(
  value: unknown,
): value is INativeLayoutAnimationUIManager {
  return (
    isRecord(value) && typeof value.configureNextLayoutAnimation === 'function'
  );
}

// Не мемоизируем: слот Fabric и TurboModule появляются и пропадают в рантайме,
// а кэш закрепил бы первый ответ
function resolveUIManager(): INativeLayoutAnimationUIManager | null {
  const fabricUIManager = globalThis.nativeFabricUIManager;
  if (hasConfigureNextLayoutAnimation(fabricUIManager)) {
    dlog(
      'LayoutAnimation: resolved native UIManager via the Fabric global slot',
    );
    return fabricUIManager;
  }

  const module = getNativeModule<INativeLayoutAnimationUIManager>(
    NATIVE_UI_MANAGER_MODULE_NAME,
  );
  if (module !== null) {
    dlog(
      `LayoutAnimation: resolved native UIManager via "${NATIVE_UI_MANAGER_MODULE_NAME}"`,
    );
    return module;
  }

  dlog(
    'LayoutAnimation: no native UIManager resolved (no Fabric global slot, ' +
      `"${NATIVE_UI_MANAGER_MODULE_NAME}" module not linked)`,
  );
  return null;
}

// `create` и `delete` несут тип и свойство, `update` только тип, как в RN
function createLayoutAnimation(
  duration: number,
  type?: ILayoutAnimationType,
  property?: ILayoutAnimationProperty,
): ILayoutAnimationConfig {
  return {
    duration,
    create: { type, property },
    update: { type },
    delete: { type, property },
  };
}

const PRESET_DURATION = {
  easeInEaseOut: 300,
  linear: 500,
  spring: 700,
} as const;

const SPRING_DAMPING = 0.4;

const Presets = {
  easeInEaseOut: createLayoutAnimation(
    PRESET_DURATION.easeInEaseOut,
    ANIMATION_TYPE.easeInEaseOut,
    ANIMATION_PROPERTY.opacity,
  ),
  linear: createLayoutAnimation(
    PRESET_DURATION.linear,
    ANIMATION_TYPE.linear,
    ANIMATION_PROPERTY.opacity,
  ),
  spring: {
    duration: PRESET_DURATION.spring,
    create: {
      type: ANIMATION_TYPE.linear,
      property: ANIMATION_PROPERTY.opacity,
    },
    update: { type: ANIMATION_TYPE.spring, springDamping: SPRING_DAMPING },
    delete: {
      type: ANIMATION_TYPE.linear,
      property: ANIMATION_PROPERTY.opacity,
    },
  },
} as const satisfies Readonly<Record<string, ILayoutAnimationConfig>>;

// RN сидит на флаге, по умолчанию включено
let isLayoutAnimationEnabled = true;

// В RN `setEnabled` присваивает флаг самому себе и ничего не делает, здесь он переключает
function setLayoutAnimationEnabled(value: boolean): void {
  isLayoutAnimationEnabled = value;
}

// Native-callback гоняется с таймером `duration + 17`, как в RN: хост без анимаций
// не отзовётся, а `onAnimationDidEnd` должен прийти. Без UIManager таймер тоже взводится
function configureNext(
  config: ILayoutAnimationConfig,
  onAnimationDidEnd?: IOnAnimationDidEndCallback,
  onAnimationDidFail?: IOnAnimationDidFailCallback,
): void {
  if (Platform.isDisableAnimations || !isLayoutAnimationEnabled) {
    dlog('LayoutAnimation.configureNext: disabled; no-op');
    return;
  }

  let hasCompletionRun = false;
  const onComplete: IOnAnimationDidEndCallback = () => {
    if (hasCompletionRun) return;
    hasCompletionRun = true;
    clearTimeout(raceTimer);
    onAnimationDidEnd?.();
  };
  const raceTimer = setTimeout(
    onComplete,
    config.duration + COMPLETION_RACE_SLACK_MS,
  );

  const manager = resolveUIManager();
  if (manager === null || manager.configureNextLayoutAnimation === undefined) {
    dlog('LayoutAnimation.configureNext: no native UIManager');
    return;
  }

  dlog(
    `LayoutAnimation.configureNext: dispatching config (duration=${config.duration})`,
  );
  manager.configureNextLayoutAnimation(
    config,
    onComplete,
    onAnimationDidFail ?? (() => {}),
  );
}

class LayoutAnimationImpl {
  readonly Types: ILayoutAnimationTypes = Object.freeze({ ...ANIMATION_TYPE });
  readonly Properties: ILayoutAnimationProperties = Object.freeze({
    ...ANIMATION_PROPERTY,
  });
  readonly Presets = Presets;

  // Методы, а не поля класса: остаются переопределяемыми при `useDefineForClassFields`
  configureNext(
    config: ILayoutAnimationConfig,
    onAnimationDidEnd?: IOnAnimationDidEndCallback,
    onAnimationDidFail?: IOnAnimationDidFailCallback,
  ): void {
    configureNext(config, onAnimationDidEnd, onAnimationDidFail);
  }

  create(
    duration: number,
    type?: ILayoutAnimationType,
    property?: ILayoutAnimationProperty,
  ): ILayoutAnimationConfig {
    return createLayoutAnimation(duration, type, property);
  }

  easeInEaseOut(onAnimationDidEnd?: IOnAnimationDidEndCallback): void {
    configureNext(Presets.easeInEaseOut, onAnimationDidEnd);
  }

  linear(onAnimationDidEnd?: IOnAnimationDidEndCallback): void {
    configureNext(Presets.linear, onAnimationDidEnd);
  }

  spring(onAnimationDidEnd?: IOnAnimationDidEndCallback): void {
    configureNext(Presets.spring, onAnimationDidEnd);
  }

  setEnabled(enabled: boolean): void {
    setLayoutAnimationEnabled(enabled);
  }

  setLayoutAnimationEnabled(enabled: boolean): void {
    setLayoutAnimationEnabled(enabled);
  }

  // RN отключил валидатор, вызов только пишет в `console.error`
  checkConfig(..._args: unknown[]): void {
    console.error('LayoutAnimation.checkConfig(...) has been disabled.');
  }

  // Строка вроде `easing` из события клавиатуры, не из `Types`, превращается в 'keyboard'
  coerceType(easing: string): ILayoutAnimationType {
    const types: Readonly<Record<string, ILayoutAnimationType>> = this.Types;
    return types[easing] ?? ANIMATION_TYPE.keyboard;
  }
}

export const LayoutAnimation = new LayoutAnimationImpl();
