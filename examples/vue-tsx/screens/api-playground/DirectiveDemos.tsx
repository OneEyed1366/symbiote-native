import { defineComponent, h, ref, withDirectives } from 'vue';
import type { ObjectDirective } from 'vue';
import type { ISymbioteNode } from '@symbiote-native/vue';
// The commit-timing API of the engine is not re-exported by the `@symbiote-native/vue` root
import { setNativeProps, whenCommitted } from '@symbiote-native/engine';
// `vue-tsc` resolves a bare `vue` import to the npm types, and `withModifiers` is missing there
import { withModifiers } from '@symbiote-native/vue/runtime-helpers';
import { ActionButton } from '../../components/ActionButton';
import { LINE_COLOR } from '../../navigation-lines';
import { LogCard } from './LogCard';
import { pushLimited } from './log';

const RENDER_MODE = { A: 'a', B: 'b', C: 'c' } as const;
type IRenderMode = (typeof RENDER_MODE)[keyof typeof RENDER_MODE];

const NEXT_MODE: Record<IRenderMode, IRenderMode> = {
  [RENDER_MODE.A]: RENDER_MODE.B,
  [RENDER_MODE.B]: RENDER_MODE.C,
  [RENDER_MODE.C]: RENDER_MODE.A,
};

const BRANCH_LABEL: Record<IRenderMode, string> = {
  [RENDER_MODE.A]: 'branch A',
  [RENDER_MODE.B]: 'branch B',
  [RENDER_MODE.C]: 'branch C (else)',
};

const FRUITS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'apple', label: 'apple' },
  { id: 'pear', label: 'pear' },
  { id: 'plum', label: 'plum' },
];

// `v-once` and `v-memo` have no `h()` primitive, so the value is computed once in `setup()`
const OnceNote = defineComponent({
  name: 'OnceNote',
  setup() {
    const computedAt = 'computed once at setup() time';
    return () => (
      <text class="note-text">
        {computedAt} — proven never-recomputed by cycling "mode" above and
        watching this line stay put.
      </text>
    );
  },
});

// `v-if`, `v-else-if` and `v-else` are plain control flow, a render function needs no directive
export const ConditionalRenderingDemo = defineComponent({
  name: 'ConditionalRenderingDemo',
  setup() {
    const mode = ref<IRenderMode>(RENDER_MODE.A);
    const cycleMode = (): void => {
      mode.value = NEXT_MODE[mode.value];
    };

    return () => (
      <view class="section-nested">
        <text class="section-label">
          v-if / v-else-if / v-else → a plain ternary chain
        </text>
        <ActionButton
          testID="conditional-cycle"
          title={`mode: ${mode.value} (tap to cycle)`}
          onPress={cycleMode}
          color={LINE_COLOR.introspection}
        />
        <text class="info-text">{BRANCH_LABEL[mode.value]}</text>
        <text class="section-label">v-for → .map()</text>
        {FRUITS.map(fruit => (
          <text key={fruit.id} class="list-row-text">{`• ${fruit.label}`}</text>
        ))}
        <text class="section-label">
          v-once / v-memo → hand-rolled (no h()-level primitive)
        </text>
        <OnceNote />
      </view>
    );
  },
});

type INumberStepperProps = { modelValue: number };
type INumberStepperEmits = { 'update:modelValue': (value: number) => boolean };

// The prop and event pair that the compiler's `v-model` sugar would expand to, wired by hand
const NumberStepper = defineComponent<INumberStepperProps, INumberStepperEmits>(
  (props, { emit }) => {
    return () => (
      <view class="stepper-row">
        <pressable
          testID="stepper-dec"
          class="stepper-button"
          onPress={() => emit('update:modelValue', props.modelValue - 1)}
        >
          <text class="stepper-button-text">−</text>
        </pressable>
        <text class="stepper-value">{props.modelValue}</text>
        <pressable
          testID="stepper-inc"
          class="stepper-button"
          onPress={() => emit('update:modelValue', props.modelValue + 1)}
        >
          <text class="stepper-button-text">+</text>
        </pressable>
      </view>
    );
  },
  {
    name: 'NumberStepper',
    props: ['modelValue'],
    emits: { 'update:modelValue': (_value: number): boolean => true },
  },
);

export const NumberStepperVModelDemo = defineComponent({
  name: 'NumberStepperVModelDemo',
  setup() {
    const count = ref(0);
    return () => (
      <view class="section-nested">
        <text class="section-label">
          v-model on a component → wired by hand (modelValue /
          onUpdate:modelValue)
        </text>
        {/* `h()` here, not JSX: the no-inline-styles visitor of eslint-plugin-react-native
            crashes on a namespaced JSX attribute such as `onUpdate:modelValue` */}
        {h(NumberStepper, {
          modelValue: count.value,
          'onUpdate:modelValue': (value: number) => (count.value = value),
        })}
      </view>
    );
  },
});

// The canonical modal case: `.self` on the backdrop, `.stop` on the card
export const EventModifiersDemo = defineComponent({
  name: 'EventModifiersDemo',
  setup() {
    const log = ref<string[]>([]);
    const onBackdropPress = withModifiers(
      () =>
        pushLimited(
          log,
          'backdrop pressed (.self — only fires on a direct tap)',
        ),
      ['self'],
    );
    const onCardPress = withModifiers(
      () =>
        pushLimited(
          log,
          'card pressed (.stop — never reaches the backdrop handler)',
        ),
      ['stop'],
    );

    return () => (
      <view class="section-nested">
        <text class="section-label">
          withModifiers() → v-on.stop / v-on.self for render functions
        </text>
        <pressable
          testID="modifiers-backdrop"
          class="frame-box"
          onPress={onBackdropPress}
        >
          <text class="info-text">
            backdrop — tap the empty area around the card
          </text>
          <pressable
            testID="modifiers-card"
            class="tab-card"
            onPress={onCardPress}
          >
            <text class="list-row-text">
              card — .stop keeps this tap from also logging "backdrop pressed"
            </text>
          </pressable>
        </pressable>
        <LogCard
          entries={log.value}
          emptyText="tap the card, then tap the backdrop around it"
        />
      </view>
    );
  },
});

const pendingFlashCommits = new WeakMap<ISymbioteNode, () => void>();

// A directive hook fires during the Vue patch, before the engine commit has given the node a tag
function applyFlash(el: ISymbioteNode, color: string): void {
  pendingFlashCommits.get(el)?.();
  const cancel = whenCommitted(el, () =>
    setNativeProps(el, { style: { backgroundColor: color } }),
  );
  pendingFlashCommits.set(el, cancel);
}

const vFlash: ObjectDirective<ISymbioteNode, string> = {
  mounted: (el, { value }) => applyFlash(el, value),
  updated: (el, { value }) => applyFlash(el, value),
  unmounted: el => pendingFlashCommits.get(el)?.(),
};

const ALTERNATE_FLASH_COLOR = '#68d391';

// `withDirectives` is the render-function form of a template custom directive
// `el` is a `SymbioteNode`, so the directive goes through `setNativeProps`, never a DOM style
export const CustomDirectiveDemo = defineComponent({
  name: 'CustomDirectiveDemo',
  setup() {
    const flashColor = ref(LINE_COLOR.introspection);
    const onFlashAgain = (): void => {
      flashColor.value =
        flashColor.value === LINE_COLOR.introspection
          ? ALTERNATE_FLASH_COLOR
          : LINE_COLOR.introspection;
    };
    return () => (
      <view class="section-nested">
        <text class="section-label">
          Custom directive → withDirectives(vnode, [[vFlash, value]])
        </text>
        <ActionButton
          testID="custom-directive-flash"
          title="Flash again"
          onPress={onFlashAgain}
          color={flashColor.value}
        />
        {withDirectives(
          <view testID="custom-directive-box" class="flash-box">
            <text class="flash-box-text">flashed via a custom directive</text>
          </view>,
          [[vFlash, flashColor.value]],
        )}
      </view>
    );
  },
});

type IFrameScope = { count: number };
type IFrameSlots = { default?: (scope: IFrameScope) => unknown };
type IFrameProps = { count: number };

const Frame = defineComponent<IFrameProps>(
  (props, { slots }) => {
    return () => (
      <view class="frame-box" testID="scoped-slot-frame">
        <text class="section-label">Frame (defines a scoped slot)</text>
        {slots.default?.({ count: props.count })}
      </view>
    );
  },
  { name: 'Frame', props: ['count'] },
);

// `v-slot` in a render function is a slot object literal passed as the children
export const ScopedSlotDemo = defineComponent({
  name: 'ScopedSlotDemo',
  setup() {
    const count = ref(0);
    return () => (
      <view class="section-nested">
        <text class="section-label">
          v-slot → a slot object literal, passed straight as children
        </text>
        <ActionButton
          testID="scoped-slot-inc"
          title="Increment"
          onPress={() => (count.value += 1)}
          color={LINE_COLOR.introspection}
        />
        <Frame count={count.value}>
          {
            {
              default: (scope: IFrameScope) => (
                <text class="list-row-text">{`scoped slot prop from Frame: count=${scope.count}`}</text>
              ),
            } satisfies IFrameSlots
          }
        </Frame>
      </view>
    );
  },
});
