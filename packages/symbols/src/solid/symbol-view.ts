import {
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  splitProps,
  untrack,
} from 'solid-js';
import type { JSX } from 'solid-js';
import { el } from '@symbiote-native/components';
import { descriptorToSolid } from '@symbiote-native/solid';
import type { IViewProps } from '@symbiote-native/solid';
import type { IClassNameValue } from '@symbiote-native/engine';
import { renderSymbolView, watchSymbolFont } from '../core';
import type { ISymbolViewProps } from '../core';

// Поверхность View как у `ViewProps` в upstream, `fallback` и `class` свои у Solid
export type ISymbolViewSolidProps = ISymbolViewProps &
  Omit<IViewProps, keyof ISymbolViewProps | 'children'> & {
    /** Rendered when a symbol for the current platform is not defined */
    fallback?: JSX.Element;
    class?: IClassNameValue;
  };

const FALLBACK_SHAPE = 'fallback';

/** Solid twin of `expo-symbols`' `SymbolView`, SF Symbols on iOS and Material Symbols elsewhere */
export function SymbolView(props: ISymbolViewSolidProps): JSX.Element {
  const [local, rest] = splitProps(props, ['fallback']);
  const [isFontLoaded, setIsFontLoaded] = createSignal(false);

  // Шрифт грузится один раз при монтировании, как в upstream
  onMount(() => onCleanup(watchSymbolFont({ ...rest }, setIsFontLoaded)));

  // Мост Solid требует постоянную форму дескриптора, а она меняется вместе с загрузкой шрифта
  // Поэтому узел пересобирается, когда меняется форма, а обычные пропсы он обновляет сам
  const shape = createMemo(() => {
    const descriptor = renderSymbolView({ ...rest }, isFontLoaded());
    return descriptor
      ? `${descriptor.type}:${descriptor.children.length}`
      : FALLBACK_SHAPE;
  });

  return createMemo(() => {
    if (shape() === FALLBACK_SHAPE) return local.fallback;
    return untrack(() => {
      const isLoadedAtBuild = isFontLoaded();
      return descriptorToSolid(
        () => renderSymbolView({ ...rest }, isLoadedAtBuild) ?? el('view', {}),
      );
    });
  });
}
