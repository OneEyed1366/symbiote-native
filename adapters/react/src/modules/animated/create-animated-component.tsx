// createAnimatedComponent wraps a base component (View / Text / Image / any) so
// it can take AnimatedNodes in its props. Reimplemented thin against symbiote's
// shared primitive: NO native driver, NO scheduleUpdate fallback. A frame is the
// scoped commit setNativeProps drives from the AnimatedProps leaf. RN's
// createAnimatedComponent + useAnimatedProps + createAnimatedPropsHook are the
// structural reference, but their native helpers are deliberately not imported.
//
// Per render: build the AnimatedProps leaf for the current props, compute
// reducedProps (every animated node replaced by its current value) and hand those
// to the base component. A callback ref captures the rendered base component's
// public instance (the SymbioteNode the host config returns) and binds it to the
// leaf. An effect attaches the leaf to the value graph so flushValue reaches it,
// and detaches on unmount / when the leaf identity changes. The per-frame path is
// then: value.setValue / animation -> flushValue -> AnimatedProps.update() ->
// setNativeProps(node, partial).

import {
  createElement,
  useCallback,
  useEffect,
  useRef,
  type ComponentType,
  type ReactElement,
  type Ref,
} from 'react';
import {
  createAnimatedLeafLifecycle,
  isSymbioteNode,
  type IAnimatedLeafLifecycle,
  isNativeAnimatedAvailable,
  reduceProps,
  readPassthroughStyle,
  resolveHostNode,
} from '@symbiote-native/engine';

// A ref can be a function or a `.current` object; assign through both forms without
// casting so a forwarded ref from the caller still receives the instance. Framework-
// ref-specific, so it stays per-adapter (the rest of the wrap helpers are shared).
function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (ref === undefined || ref === null) return;
  if (typeof ref === 'function') {
    ref(value);
    return;
  }
  ref.current = value;
}

export type IAnimatedComponentProps = {
  style?: unknown;
  ref?: Ref<unknown>;
  [key: string]: unknown;
};

// Base components carry their own concrete prop shape (View wants ViewStyle, etc.).
// We stay generic over that P so reduced props type-check against the base, while
// presenting an open animated-friendly surface (IAnimatedComponentProps) to callers.
type IAnimatableProps = { style?: unknown; children?: unknown };

// The base may be a COMPONENT or an intrinsic TAG: `View`/`Text` are tags themselves (a
// capitalized export whose value is `'symbiote-view'`), so `createAnimatedComponent(View)` hands
// this a string, which `createElement` accepts.
type IAnimatableBase<P extends IAnimatableProps> = ComponentType<P> | string;

// A tag has no displayName/name, so read the label through the shape actually present.
function baseNameOf<P extends IAnimatableProps>(
  base: IAnimatableBase<P>,
): string {
  if (typeof base === 'string') return base;
  return base.displayName ?? base.name ?? 'Anonymous';
}

export function createAnimatedComponent<P extends IAnimatableProps>(
  Component: IAnimatableBase<P>,
): ComponentType<IAnimatedComponentProps> {
  function AnimatedComponent(props: IAnimatedComponentProps): ReactElement {
    const {
      ref: forwardedRef,
      passthroughAnimatedPropExplicitValues: passthrough,
      ...rest
    } = props;
    // Native driving is opt-in per the passthrough prop AND requires a real native module;
    // headless / unsupported hosts keep the JS flush path (and the existing JS smokes green).
    const wantsNative = passthrough != null && isNativeAnimatedAvailable();

    // Жизненный цикл листа общий для адаптеров (`leaf-lifecycle.ts`), React решает лишь когда
    const lifecycleRef = useRef<IAnimatedLeafLifecycle | null>(null);
    lifecycleRef.current ??= createAnimatedLeafLifecycle('react');
    const lifecycle = lifecycleRef.current;

    // The committed host node, captured by the ref below - a native event binds to the node's
    // tag, not the AnimatedProps leaf.
    const nodeRef = useRef<unknown>(null);

    // `rest` пересобирается каждым рендером, поэтому эффект идёт после каждого коммита,
    // а пересобирать ли лист, решает жизненный цикл по содержимому
    useEffect(() => {
      lifecycle.reconcile(
        rest,
        isSymbioteNode(nodeRef.current) ? nodeRef.current : null,
        wantsNative,
      );
    }, [lifecycle, rest, wantsNative]);

    // Final teardown: detach the last-attached leaf and any native event bindings on unmount.
    useEffect(() => {
      return () => lifecycle.teardown();
    }, [lifecycle]);

    // Стабильный ref, как у RN: пока `ref` приложения тот же, он не отцепляется и не цепляется
    // заново на каждый рендер. Приложению уходит исходный instance, а узлу для привязки - host node
    const captureRef = useCallback(
      (instance: unknown): void => {
        nodeRef.current = resolveHostNode(instance);
        assignRef(forwardedRef, instance);
      },
      [forwardedRef],
    );

    // Object.assign держит тип P & ref без приведения, `createElement` принимает его для базы
    const reduced = reduceProps(rest);
    // Override the committed style with the explicit passthrough values (last wins via the style
    // array, which the commit layer flattens) so the ShadowTree carries the current transform.
    const passthroughStyle = readPassthroughStyle(passthrough);
    if (passthroughStyle !== undefined) {
      reduced.style =
        reduced.style === undefined
          ? passthroughStyle
          : [reduced.style, passthroughStyle];
    }
    const childProps: P & { ref: (instance: unknown) => void } = Object.assign(
      Object.create(null),
      reduced,
      { ref: captureRef },
    );
    return createElement(Component, childProps);
  }

  AnimatedComponent.displayName = `Animated(${baseNameOf(Component)})`;
  return AnimatedComponent;
}
