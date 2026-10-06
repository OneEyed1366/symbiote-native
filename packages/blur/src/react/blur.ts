import { createElement, useEffect, useLayoutEffect, useState } from 'react';
import type { ReactElement, ReactNode, RefObject } from 'react';
import { descriptorToReactWithChildren } from '@symbiote-native/react';
import type { IHostInstance, IViewProps } from '@symbiote-native/react';
import {
  renderBlurTargetView,
  renderBlurView,
  warnBlurProps,
  watchBlurTarget,
} from '../core';
import type { IBlurTargetViewProps, IBlurViewProps } from '../core';

// Поверхность View как у `ViewProps` в upstream, дети и `className` свои у React
export type IBlurViewReactProps = IBlurViewProps &
  Omit<IViewProps, keyof IBlurViewProps | 'children'> & {
    /** Ref на `BlurTargetView`, его содержимое это фон для размытия */
    blurTarget?: RefObject<IHostInstance | null>;
    children?: ReactNode;
    className?: string;
  };

export type IBlurTargetViewReactProps = IBlurTargetViewProps &
  Omit<IViewProps, keyof IBlurTargetViewProps | 'children' | 'ref'> & {
    ref?: RefObject<IHostInstance | null>;
    children?: ReactNode;
    className?: string;
  };

/** React twin of `expo-blur`'s `BlurView`, children paint over the blur */
export function BlurView(props: IBlurViewReactProps): ReactElement {
  const { blurTarget, children, ...rest } = props;
  const [blurTargetId, setBlurTargetId] = useState<number | undefined>();

  // Без списка зависимостей, как `componentDidUpdate` upstream: ref цели ставится в коммите
  useLayoutEffect(() => watchBlurTarget(blurTarget?.current, setBlurTargetId));
  useEffect(() => warnBlurProps(rest, blurTarget !== undefined), []);

  return descriptorToReactWithChildren(
    renderBlurView(rest, blurTargetId),
    children,
  );
}

/** React twin of `expo-blur`'s `BlurTargetView`, native on Android and a plain View on iOS */
export function BlurTargetView(props: IBlurTargetViewReactProps): ReactElement {
  const { children, ...rest } = props;
  const descriptor = renderBlurTargetView(rest);
  return createElement(descriptor.type, descriptor.props, children);
}
