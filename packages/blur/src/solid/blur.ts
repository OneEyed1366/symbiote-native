import {
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  splitProps,
} from 'solid-js';
import type { JSX } from 'solid-js';
import {
  defineDescriptorComponent,
  descriptorToSolid,
} from '@symbiote-native/solid';
import type { IHostInstance, IViewProps } from '@symbiote-native/solid';
import type { IClassNameValue } from '@symbiote-native/engine';
import {
  renderBlurTargetView,
  renderBlurView,
  warnBlurProps,
  watchBlurTarget,
} from '../core';
import type { IBlurTargetViewProps, IBlurViewProps } from '../core';

// Поверхность View как у `ViewProps` в upstream, дети и `class` свои у Solid
export type IBlurViewSolidProps = IBlurViewProps &
  Omit<IViewProps, keyof IBlurViewProps | 'children' | 'ref'> & {
    /** Host-узел `BlurTargetView`, его содержимое это фон для размытия */
    blurTarget?: IHostInstance;
    children?: JSX.Element;
    class?: IClassNameValue;
  };

export type IBlurTargetViewSolidProps = IBlurTargetViewProps &
  Omit<IViewProps, keyof IBlurTargetViewProps | 'children'> & {
    children?: JSX.Element;
    class?: IClassNameValue;
  };

/** Solid twin of `expo-blur`'s `BlurView`, children paint over the blur */
export function BlurView(
  props: IBlurViewSolidProps,
): ReturnType<typeof descriptorToSolid> {
  const [local, rest] = splitProps(props, ['children', 'blurTarget']);
  const [blurTargetId, setBlurTargetId] = createSignal<number | undefined>();

  // Цель приходит сигналом после коммита, поэтому следим за ней, а не читаем один раз
  createEffect(() => {
    const cancel = watchBlurTarget(local.blurTarget, setBlurTargetId);
    onCleanup(cancel);
  });
  onMount(() => warnBlurProps({ ...rest }, local.blurTarget !== undefined));

  return descriptorToSolid(
    () => renderBlurView({ ...rest }, blurTargetId()),
    () => local.children,
  );
}

/** Solid twin of `expo-blur`'s `BlurTargetView`, native on Android and a plain View on iOS */
export const BlurTargetView =
  defineDescriptorComponent<IBlurTargetViewSolidProps>(renderBlurTargetView);
