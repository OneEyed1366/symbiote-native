// `<Text>` с нажатием, как у RN: `usePressability` в `Text.js` нужен только при `isPressable`
// Машина вешается лениво на первый такой слушатель и снимается вместе с последним

import {
  appListenerFor,
  Platform,
  propOf,
  registerLazyHostBehavior,
  requestCommitFor,
  setProp,
  TEXT_COMPONENT,
  type IHostBehavior,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import {
  attachPressMachine,
  createPressBehavior,
  detachPressMachine,
} from './pressable';
import type { IPressMachineConfig } from '../state/pressable';

export const TEXT_TAG = 'text';

const HIGHLIGHT_PROP = 'isHighlighted';

// Имена, из-за которых текст становится нажимаемым (`isPressable` в `Text.js`)
const PRESSABLE_TRIGGERS = [
  'press',
  'longPress',
  'startShouldSetResponder',
] as const;

type IPressableTrigger = (typeof PRESSABLE_TRIGGERS)[number];

function isTriggerWired(node: ISymbioteNode, name: IPressableTrigger): boolean {
  return appListenerFor(node, name) != null;
}

// `isHighlighted` читает только iOS, на других платформах запись лишь перерисовывала бы текст
function setHighlighted(node: ISymbioteNode, isHighlighted: boolean): void {
  setProp(node, HIGHLIGHT_PROP, isHighlighted);
  requestCommitFor(node);
}

// `useTextPressability`: подсветка на `pressIn` без `suppressHighlighting`, гасится на `pressOut`
function withHighlight(
  node: ISymbioteNode,
  config: IPressMachineConfig,
): IPressMachineConfig {
  const isSuppressed = propOf(node, 'suppressHighlighting') === true;
  return {
    ...config,
    onPressIn(event: ISymbioteEvent): void {
      setHighlighted(node, !isSuppressed);
      config.onPressIn?.(event);
    },
    onPressOut(event: ISymbioteEvent): void {
      setHighlighted(node, false);
      config.onPressOut?.(event);
    },
  };
}

function keepConfig(
  _node: ISymbioteNode,
  config: IPressMachineConfig,
): IPressMachineConfig {
  return config;
}

const refineForPlatform = Platform.select({
  ios: withHighlight,
  default: keepConfig,
});

function onOwnedListenerChange(node: ISymbioteNode): void {
  if (PRESSABLE_TRIGGERS.some(name => isTriggerWired(node, name))) {
    attachPressMachine(node, { refine: refineForPlatform });
  } else {
    detachPressMachine(node);
  }
}

// Идемпотентна: точка входа адаптера может подключаться в бандл не раз
// Поведение садится на узел с первым press-слушателем, а не при создании, т.к. `text` есть в каждом
// приложении и иначе обход при сносе включился бы везде
export function registerTextBehavior(): void {
  const { ownedListeners, detach } = createPressBehavior();
  const behavior: IHostBehavior = {
    ownedListeners,
    attach() {},
    detach,
    onOwnedListenerChange,
  };
  registerLazyHostBehavior(TEXT_COMPONENT, TEXT_TAG, behavior);
}
