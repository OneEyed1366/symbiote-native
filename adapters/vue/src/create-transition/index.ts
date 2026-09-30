// Vue's own <Transition>/<TransitionGroup> live in @vue/runtime-dom (CSS class
// toggling), unreachable through this adapter's runtime-core-only "vue" import.
// Wires BaseTransition's (runtime-core) enter/leave hooks to Animated instead.

import {
  BaseTransition,
  defineComponent,
  Fragment,
  getCurrentInstance,
  getTransitionRawChildren,
  h,
  resolveTransitionHooks,
  setTransitionHooks,
  useTransitionState,
  type BaseTransitionProps,
  type SetupContext,
  type VNode,
} from '@vue/runtime-core';
import {
  AnimatedValue,
  isSymbioteNode,
  propOf,
  requestCommitFor,
  routeProp,
  timing,
  type ISymbioteNode,
} from '@symbiote-native/engine';

export interface ITransitionProps {
  duration?: number;
  appear?: boolean;
}

const DEFAULT_DURATION_MS = 300;

const opacityOf = new WeakMap<ISymbioteNode, AnimatedValue>();

// routeProp, not setProp/setNativeProps: an AnimatedNode is only recognized and kept
// subscribed to per-frame updates through routeProp's own resolution
// (core/engine/src/animated/host-binding.ts).
function animatedOpacity(el: ISymbioteNode, initial: number): AnimatedValue {
  const value = new AnimatedValue(initial);
  opacityOf.set(el, value);
  const style = propOf(el, 'style');
  routeProp(el, 'style', {
    ...(typeof style === 'object' && style !== null ? style : {}),
    opacity: value,
  });
  requestCommitFor(el);
  return value;
}

function fadeTo(
  el: ISymbioteNode,
  toValue: number,
  duration: number,
  done: () => void,
): void {
  const value = opacityOf.get(el) ?? animatedOpacity(el, toValue === 1 ? 0 : 1);
  timing(value, { toValue, duration }).start(({ finished }) => {
    if (finished) done();
  });
}

// This project's native equivalent of Vue's CSS transition classes. Named per-`name`
// enter/leave effects are not implemented (see the gap-list for that decision).
function fadeHooks(duration: number): BaseTransitionProps<unknown> {
  return {
    onBeforeEnter: el => {
      if (isSymbioteNode(el)) animatedOpacity(el, 0);
    },
    onEnter: (el, done) => {
      if (isSymbioteNode(el)) fadeTo(el, 1, duration, done);
      else done();
    },
    onLeave: (el, done) => {
      if (isSymbioteNode(el)) fadeTo(el, 0, duration, done);
      else done();
    },
  };
}

export const Transition = defineComponent({
  name: 'Transition',
  props: {
    duration: { type: Number, default: DEFAULT_DURATION_MS },
    appear: { type: Boolean, default: false },
  },
  setup(props: Required<ITransitionProps>, { slots }: SetupContext) {
    return () =>
      h(
        BaseTransition,
        { appear: props.appear, ...fadeHooks(props.duration) },
        slots,
      );
  },
});

// The move/reorder FLIP animation Vue's own TransitionGroup does over
// offsetLeft/offsetTop is DOM-measurement-specific and not implemented here.
export const TransitionGroup = defineComponent({
  name: 'TransitionGroup',
  props: {
    duration: { type: Number, default: DEFAULT_DURATION_MS },
    appear: { type: Boolean, default: false },
  },
  setup(props: Required<ITransitionProps>, { slots }: SetupContext) {
    const instance = getCurrentInstance();
    const state = useTransitionState();
    return (): VNode => {
      const children = slots.default
        ? getTransitionRawChildren(slots.default())
        : [];
      for (const child of children) {
        if (child.key == null || !instance) continue;
        setTransitionHooks(
          child,
          resolveTransitionHooks(
            child,
            { appear: props.appear, ...fadeHooks(props.duration) },
            state,
            instance,
          ),
        );
      }
      return h(Fragment, null, children);
    };
  },
});
