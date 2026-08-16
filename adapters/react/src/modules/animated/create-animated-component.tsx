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

export interface IAnimatedComponentProps {
  style?: unknown;
  ref?: Ref<unknown>;
  [key: string]: unknown;
}

// Base components carry their own concrete prop shape (View wants ViewStyle, etc.).
// We stay generic over that P so reduced props type-check against the base, while
// presenting an open animated-friendly surface (IAnimatedComponentProps) to callers.
type IAnimatableProps = { style?: unknown; children?: unknown };

export function createAnimatedComponent<P extends IAnimatableProps>(
  Component: ComponentType<P>,
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

    // The leaf lifecycle - build/swap/bind/detach, native event rebinding, and the
    // rebuild-vs-skip decision - is the engine's, shared by every adapter
    // (core/engine/src/animated/leaf-lifecycle.ts). React owns only WHEN to run it.
    //
    // This used to be `useMemo(() => new AnimatedProps(rest), [rest])`, which reads like the same
    // guard but never was one: `rest` comes out of a rest-destructure, so it is a fresh object on
    // every render and the memo's dependency always differed. The real content check now lives in
    // the shared lifecycle.
    const lifecycleRef = useRef<IAnimatedLeafLifecycle | null>(null);
    lifecycleRef.current ??= createAnimatedLeafLifecycle('react');
    const lifecycle = lifecycleRef.current;

    // The committed host node, captured by the ref below - a native event binds to the node's
    // tag, not the AnimatedProps leaf.
    const nodeRef = useRef<unknown>(null);

    // Reconcile after every commit. No dependency array on purpose: the props object is rebuilt
    // by every render anyway, so a dependency list could only ever say "always" - the real
    // rebuild-vs-skip decision is the lifecycle's, and it compares CONTENT by key identity.
    useEffect(() => {
      lifecycle.reconcile(rest, isSymbioteNode(nodeRef.current) ? nodeRef.current : null, wantsNative);
    });

    // Final teardown: detach the last-attached leaf and any native event bindings on unmount.
    useEffect(() => {
      return () => lifecycle.teardown();
    }, [lifecycle]);


    // Callback ref: when the base component mounts, capture its public instance, resolve
    // it to the underlying host node (unwrapping a scroll-container handle), record THAT
    // for the event-attach effect and bind it to the leaf, but forward the ORIGINAL
    // instance to the caller, who expects the component's public handle (scrollTo, …).
    const captureRef = (instance: unknown): void => {
      nodeRef.current = resolveHostNode(instance);
      assignRef(forwardedRef, instance);
    };

    // Reduced props are P-shaped (animated nodes already replaced by values); add the
    // capture ref. Build via Object.assign so the merged object stays typed as P & ref
    // without a cast. createElement then accepts it for the generic base component.
    const reduced = reduceProps(rest);
    // Override the committed style with the explicit passthrough values (last wins via the style
    // array, which the commit layer flattens) so the ShadowTree carries the current transform.
    const passthroughStyle = readPassthroughStyle(passthrough);
    if (passthroughStyle !== undefined) {
      reduced.style =
        reduced.style === undefined ? passthroughStyle : [reduced.style, passthroughStyle];
    }
    const childProps: P & { ref: (instance: unknown) => void } = Object.assign(
      Object.create(null),
      reduced,
      { ref: captureRef },
    );
    return createElement(Component, childProps);
  }

  AnimatedComponent.displayName = `Animated(${Component.displayName ?? Component.name ?? 'Anonymous'})`;
  return AnimatedComponent;
}
