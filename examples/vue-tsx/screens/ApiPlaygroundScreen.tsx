/**
 * API Playground: live demos of Vue's OWN Composition API / reactivity / lifecycle /
 * render-function surface — h(), withDirectives(), withModifiers(), provide/inject, KeepAlive,
 * Suspense, the full reactivity-utilities family — running under Symbiote's engine instead of
 * the DOM. This is the render-function/TSX counterpart of examples/vue-sfc's sibling screen
 * (template-directive syntax there, plain JS/h() equivalents here) — NOT @symbiote-native/navigation,
 * which every other tour stop in this app exercises.
 *
 * Scope is the triaged checklist at .docs/framework-api-surface/vue.md: every `Yes`/`Partial` row
 * that is either a plain Composition/Reactivity API item (identical regardless of SFC vs
 * render-function authoring) or a render-function-specific API the checklist's Notes column
 * calls out as relevant to vue-tsx (h, withDirectives, withModifiers, the Suspense render-fn
 * symbol). A template-directive-only row (v-if, v-for, v-show, …) gets its plain-JS/render-fn
 * equivalent built and labeled as "the vue-tsx way", per that same checklist. v-show and
 * <Teleport> are already demoed live in CanaryScreen and are intentionally NOT rebuilt here — see
 * that screen instead (checklist "Notes on coverage"). KeepAlive and Suspense are marked `Yes`
 * specifically because this screen is the first real test of both against Fabric — built for
 * real, not stubbed.
 */

import {
  defineComponent,
  ref,
  shallowRef,
  computed,
  reactive,
  readonly,
  shallowReactive,
  shallowReadonly,
  toRaw,
  markRaw,
  toRef,
  toRefs,
  toValue,
  isRef,
  unref,
  isReactive,
  isReadonly,
  isProxy,
  isShallow,
  triggerRef,
  customRef,
  effectScope,
  getCurrentScope,
  onScopeDispose,
  watch,
  watchEffect,
  watchPostEffect,
  watchSyncEffect,
  onBeforeMount,
  onMounted,
  onBeforeUpdate,
  onUpdated,
  onBeforeUnmount,
  onUnmounted,
  onErrorCaptured,
  onRenderTracked,
  onRenderTriggered,
  onActivated,
  onDeactivated,
  provide,
  inject,
  hasInjectionContext,
  getCurrentInstance,
  nextTick,
  h,
  createVNode,
  cloneVNode,
  isVNode,
  mergeProps,
  Fragment,
  KeepAlive,
  Suspense,
  defineAsyncComponent,
  withDirectives,
  useTemplateRef,
  type InjectionKey,
  type Ref,
  type ObjectDirective,
} from 'vue';
import {
  SafeAreaView,
  ScrollView,
  Text,
  View,
  Pressable,
  TextInput,
} from '@symbiote-native/vue';
import type { IHostInstance, ISymbioteNode } from '@symbiote-native/vue';
// Not re-exported by @symbiote-native/vue's package root (same as this adapter's own vShow shim,
// adapters/vue/src/runtime-helpers/index.ts) — the engine's imperative/commit-timing API lives
// only in @symbiote-native/engine itself.
import {
  whenCommitted,
  getNativeTag,
  setNativeProps,
} from '@symbiote-native/engine';
// vue-tsc resolves a bare `from 'vue'` import of withModifiers/withKeys to the real npm `vue`
// package's own types for module-resolution purposes — and, unlike Teleport (already real in
// @vue/runtime-core), withModifiers/withKeys vue-tsc reports as missing from that resolution
// despite existing in this adapter's own runtime-helpers shim. Same fix as Teleport just above:
// import from the adapter subpath directly instead of through the bare 'vue' specifier.
import { withModifiers } from '@symbiote-native/vue/runtime-helpers';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const LOG_LIMIT = 8;

// The history lives OFF the reactive graph, and that is the whole point of this WeakMap.
//
// Reading `log.value` here would make every `watchEffect` that logs TRACK the very ref the same
// call then WRITES — an effect that re-triggers itself, which Vue eventually kills with "Maximum
// recursive updates exceeded". These demos did exactly that: the error fired on the first
// interaction on every screen using them, and it cost a real debugging session, because it looks
// like a renderer fault and shows up in the log above whatever is actually being investigated.
//
// Writing a ref does not track it; only READING does. So keeping the previous entries in a plain
// array makes the dependency one-directional: each effect tracks its real source (`count`,
// `doubled`, a scope's own signal) and nothing tracks the log it writes to.
const logHistory = new WeakMap<Ref<string[]>, string[]>();

function pushLimited(log: Ref<string[]>, entry: string): void {
  const history = logHistory.get(log) ?? [];
  history.unshift(entry);
  history.length = Math.min(history.length, LOG_LIMIT);
  logHistory.set(log, history);
  // A fresh array, so the render sees a new value; the ref is never read back.
  log.value = [...history];
}

/* ── Template Directives → the vue-tsx way ───────────────────────────────────────────────── */

const RENDER_MODE = { A: 'a', B: 'b', C: 'c' } as const;
type IRenderMode = (typeof RENDER_MODE)[keyof typeof RENDER_MODE];

const FRUITS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'apple', label: 'apple' },
  { id: 'pear', label: 'pear' },
  { id: 'plum', label: 'plum' },
];

// v-if/v-else-if/v-else compile to plain control flow with no renderer dependency — the
// render-function form is just the same ternary chain, no directive needed.
const ConditionalRenderingDemo = defineComponent({
  name: 'ConditionalRenderingDemo',
  setup() {
    const mode = ref<IRenderMode>(RENDER_MODE.A);
    const cycleMode = (): void => {
      mode.value =
        mode.value === RENDER_MODE.A
          ? RENDER_MODE.B
          : mode.value === RENDER_MODE.B
            ? RENDER_MODE.C
            : RENDER_MODE.A;
    };

    // v-once/v-memo have no h()-level primitive (checklist: "no public render-function-level
    // equivalent is exposed by Vue") — the hand-rolled dodge is computing inside setup(), which
    // Vue calls exactly once per component instance, never inside the render closure below.
    let onceComputeCount = 0;
    const onceValue = (() => {
      onceComputeCount += 1;
      return `computed once at setup() time (call #${onceComputeCount})`;
    })();

    return () => (
      <View class="section-nested">
        <Text class="section-label">
          v-if / v-else-if / v-else → a plain ternary chain
        </Text>
        <ActionButton
          testID="conditional-cycle"
          title={`mode: ${mode.value} (tap to cycle)`}
          onPress={cycleMode}
          color={LINE_COLOR.framework}
        />
        <Text class="info-text">
          {mode.value === RENDER_MODE.A
            ? 'branch A'
            : mode.value === RENDER_MODE.B
              ? 'branch B'
              : 'branch C (else)'}
        </Text>
        <Text class="section-label">v-for → .map()</Text>
        {FRUITS.map(fruit => (
          <Text key={fruit.id} class="list-row-text">{`• ${fruit.label}`}</Text>
        ))}
        <Text class="section-label">
          v-once / v-memo → hand-rolled (no h()-level primitive)
        </Text>
        <Text class="note-text">
          {onceValue} — proven never-recomputed by cycling "mode" above and
          watching this line stay put.
        </Text>
      </View>
    );
  },
});

type INumberStepperProps = { modelValue: number };
type INumberStepperEmits = { 'update:modelValue': (value: number) => boolean };

// No compiler v-model sugar exists for render functions — this is the exact prop+event pair the
// sugar would expand to (mirrors this adapter's own Switch/TextInput modelValue convention),
// wired here by hand.
const NumberStepper = defineComponent<INumberStepperProps, INumberStepperEmits>(
  (props, { emit }) => {
    return () => (
      <View class="stepper-row">
        <Pressable
          testID="stepper-dec"
          class="stepper-button"
          onPress={() => emit('update:modelValue', props.modelValue - 1)}
        >
          <Text class="stepper-button-text">−</Text>
        </Pressable>
        <Text class="stepper-value">{props.modelValue}</Text>
        <Pressable
          testID="stepper-inc"
          class="stepper-button"
          onPress={() => emit('update:modelValue', props.modelValue + 1)}
        >
          <Text class="stepper-button-text">+</Text>
        </Pressable>
      </View>
    );
  },
  {
    name: 'NumberStepper',
    props: ['modelValue'],
    emits: { 'update:modelValue': (_value: number): boolean => true },
  },
);

const NumberStepperVModelDemo = defineComponent({
  name: 'NumberStepperVModelDemo',
  setup() {
    const count = ref(0);
    return () => (
      <View class="section-nested">
        <Text class="section-label">
          v-model on a component → wired by hand (modelValue /
          onUpdate:modelValue)
        </Text>
        {/* h() here, not JSX: a namespaced JSX attribute (onUpdate:modelValue) crashes
            eslint-plugin-react-native's no-inline-styles visitor (it assumes every JSXAttribute
            name is a plain JSXIdentifier) — the object-literal prop key sidesteps that parser gap
            entirely while wiring the exact same prop+event pair. */}
        {h(NumberStepper, {
          modelValue: count.value,
          'onUpdate:modelValue': (value: number) => (count.value = value),
        })}
      </View>
    );
  },
});

// Modal backdrop-dismiss is Vue's own canonical example for both modifiers: .self on the
// backdrop only fires a direct tap on the backdrop itself; .stop on the card keeps its own tap
// from also bubbling up to the backdrop.
const EventModifiersDemo = defineComponent({
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
      <View class="section-nested">
        <Text class="section-label">
          withModifiers() → v-on.stop / v-on.self for render functions
        </Text>
        <Pressable
          testID="modifiers-backdrop"
          class="frame-box"
          onPress={onBackdropPress}
        >
          <Text class="info-text">
            backdrop — tap the empty area around the card
          </Text>
          <Pressable
            testID="modifiers-card"
            class="tab-card"
            onPress={onCardPress}
          >
            <Text class="list-row-text">
              card — .stop keeps this tap from also logging "backdrop pressed"
            </Text>
          </Pressable>
        </Pressable>
        <View class="log-card">
          {log.value.length === 0 ? (
            <Text class="list-row-text">
              tap the card, then tap the backdrop around it
            </Text>
          ) : (
            log.value.map((entry, index) => (
              <Text key={index} class="list-row-text">
                {entry}
              </Text>
            ))
          )}
        </View>
      </View>
    );
  },
});

const pendingFlashCommits = new WeakMap<ISymbioteNode, () => void>();

function applyFlash(el: ISymbioteNode, color: string): void {
  // Same non-obvious reason vShow needs this (adapters/vue/src/runtime-helpers/index.ts): a
  // directive's mounted/updated hook fires synchronously during Vue's patch pass, before the
  // engine's own microtask-coalesced commit has necessarily landed a tag for this node yet.
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

// withDirectives(vnode, [[directive, value]]) is the render-function equivalent of a template
// custom directive — same contract vShow already proves works: setNativeProps through
// whenCommitted, never a raw DOM API (there is no `el.style` here, `el` is a SymbioteNode).
const CustomDirectiveDemo = defineComponent({
  name: 'CustomDirectiveDemo',
  setup() {
    const flashColor = ref(LINE_COLOR.framework);
    const onFlashAgain = (): void => {
      flashColor.value =
        flashColor.value === LINE_COLOR.framework
          ? '#68d391'
          : LINE_COLOR.framework;
    };
    return () => (
      <View class="section-nested">
        <Text class="section-label">
          Custom directive → withDirectives(vnode, [[vFlash, value]])
        </Text>
        <ActionButton
          testID="custom-directive-flash"
          title="Flash again"
          onPress={onFlashAgain}
          color={flashColor.value}
        />
        {withDirectives(
          <View testID="custom-directive-box" class="flash-box">
            <Text class="flash-box-text">flashed via a custom directive</Text>
          </View>,
          [[vFlash, flashColor.value]],
        )}
      </View>
    );
  },
});

type IFrameScope = { count: number };
type IFrameSlots = { default?: (scope: IFrameScope) => unknown };
type IFrameProps = { count: number };

const Frame = defineComponent<IFrameProps>(
  (props, { slots }) => {
    return () => (
      <View class="frame-box" testID="scoped-slot-frame">
        <Text class="section-label">Frame (defines a scoped slot)</Text>
        {slots.default?.({ count: props.count })}
      </View>
    );
  },
  { name: 'Frame', props: ['count'] },
);

// v-slot's render-function form is a slot object literal passed as children (vue-adapter-slots
// Rule 4) — the same mechanism this adapter's own FlatList/SectionList/Pressable already stand on.
const ScopedSlotDemo = defineComponent({
  name: 'ScopedSlotDemo',
  setup() {
    const count = ref(0);
    return () => (
      <View class="section-nested">
        <Text class="section-label">
          v-slot → a slot object literal, passed straight as children
        </Text>
        <ActionButton
          testID="scoped-slot-inc"
          title="Increment"
          onPress={() => (count.value += 1)}
          color={LINE_COLOR.framework}
        />
        <Frame count={count.value}>
          {
            {
              default: (scope: IFrameScope) => (
                <Text class="list-row-text">{`scoped slot prop from Frame: count=${scope.count}`}</Text>
              ),
            } satisfies IFrameSlots
          }
        </Frame>
      </View>
    );
  },
});

/* ── Built-in Components · KeepAlive & Suspense (first real test) ───────────────────────────── */

type IKeepAliveTabProps = {
  label: string;
  color: string;
  onLog: (msg: string) => void;
};

function makeKeepAliveTab(componentName: string) {
  return defineComponent<IKeepAliveTabProps>(
    props => {
      const count = ref(0);
      onActivated(() => props.onLog(`${props.label} activated`));
      onDeactivated(() => props.onLog(`${props.label} deactivated`));
      return () => (
        <View class="tab-card">
          <Text class="hero-title">{props.label}</Text>
          <Text class="info-text">{`local count: ${count.value}`}</Text>
          <ActionButton
            testID={`keepalive-inc-${componentName}`}
            title="Increment"
            onPress={() => (count.value += 1)}
            color={props.color}
          />
        </View>
      );
    },
    { name: componentName, props: ['label', 'color', 'onLog'] },
  );
}

const KeepAliveTabA = makeKeepAliveTab('KeepAliveTabA');
const KeepAliveTabB = makeKeepAliveTab('KeepAliveTabB');

// Also exercises <component :is="…"> by construction — switching between two distinct component
// TYPES is exactly what that special attribute resolves.
const KeepAliveDemo = defineComponent({
  name: 'KeepAliveDemo',
  setup() {
    const active = ref<'a' | 'b'>('a');
    const log = ref<string[]>([]);
    return () => (
      <View class="section-nested">
        <Text class="section-label">
          {'<KeepAlive> — onActivated / onDeactivated'}
        </Text>
        <Text class="note-text">
          Switching tabs would normally reset each child's local counter on
          unmount — KeepAlive caches both instances instead, so each survives a
          switch away and back.
        </Text>
        <View class="row-tight">
          <ActionButton
            testID="keepalive-tab-a"
            title="Tab A"
            onPress={() => (active.value = 'a')}
            color={LINE_COLOR.framework}
          />
          <ActionButton
            testID="keepalive-tab-b"
            title="Tab B"
            onPress={() => (active.value = 'b')}
            color={LINE_COLOR.framework}
          />
        </View>
        <KeepAlive>
          {active.value === 'a' ? (
            <KeepAliveTabA
              label="Tab A"
              color={LINE_COLOR.framework}
              onLog={msg => pushLimited(log, msg)}
            />
          ) : (
            <KeepAliveTabB
              label="Tab B"
              color="#68d391"
              onLog={msg => pushLimited(log, msg)}
            />
          )}
        </KeepAlive>
        <View class="log-card">
          {log.value.length === 0 ? (
            <Text class="list-row-text">
              switch tabs to see activation events
            </Text>
          ) : (
            log.value.map((entry, index) => (
              <Text key={index} class="list-row-text">
                {entry}
              </Text>
            ))
          )}
        </View>
      </View>
    );
  },
});

const ASYNC_GREETING_DELAY_MS = 1_200;

const AsyncGreeting = defineComponent({
  name: 'AsyncGreeting',
  async setup() {
    await new Promise<void>(resolve =>
      setTimeout(resolve, ASYNC_GREETING_DELAY_MS),
    );
    return () => (
      <Text class="list-row-text">
        resolved after 1.2s inside {'<Suspense>'}
      </Text>
    );
  },
});

// Built with h(Suspense, …) rather than JSX <Suspense> so this ALSO exercises the "Suspense
// (render-function symbol)" row directly, not just the <Suspense> built-in component.
const SuspenseDemo = defineComponent({
  name: 'SuspenseDemo',
  setup() {
    const attempt = ref(0);
    return () => (
      <View class="section-nested">
        <Text class="section-label">
          {'<Suspense> + h(Suspense, …) — the render-function symbol'}
        </Text>
        <Text class="note-text">
          First real test of Suspense against Fabric for this adapter (checklist
          decision, 2026-08-17) — if the fallback never clears, that is a
          genuine finding, not something to hide.
        </Text>
        <ActionButton
          testID="suspense-remount"
          title="Remount async child"
          onPress={() => (attempt.value += 1)}
          color={LINE_COLOR.framework}
        />
        {h(
          Suspense,
          { key: attempt.value },
          {
            default: () => h(AsyncGreeting),
            fallback: () => <Text class="list-row-text">loading…</Text>,
          },
        )}
      </View>
    );
  },
});

const AsyncLoaded = defineComponent({
  name: 'AsyncLoaded',
  setup() {
    return () => (
      <Text class="list-row-text">defineAsyncComponent resolved ✓</Text>
    );
  },
});
const AsyncFailed = defineComponent({
  name: 'AsyncFailed',
  setup() {
    return () => (
      <Text class="list-row-text">
        defineAsyncComponent's errorComponent (simulated failure)
      </Text>
    );
  },
});
const AsyncLoadingPlaceholder = defineComponent({
  name: 'AsyncLoadingPlaceholder',
  setup() {
    return () => (
      <Text class="list-row-text">
        defineAsyncComponent's loadingComponent (delay 200ms)…
      </Text>
    );
  },
});

const ASYNC_LOAD_MS = 900;
const ASYNC_LOAD_DELAY_MS = 200;
const ASYNC_LOAD_TIMEOUT_MS = 5_000;

function loadAsyncComponent(
  shouldFail: boolean,
): () => Promise<typeof AsyncLoaded> {
  return () =>
    new Promise((resolve, reject) => {
      setTimeout(() => {
        if (shouldFail)
          reject(new Error('simulated defineAsyncComponent failure'));
        else resolve(AsyncLoaded);
      }, ASYNC_LOAD_MS);
    });
}

// Independent of <Suspense> on purpose (checklist Notes) — its OWN loading/error component
// options, exercised without any Suspense wrapper.
const AsyncComponentOk = defineAsyncComponent({
  loader: loadAsyncComponent(false),
  loadingComponent: AsyncLoadingPlaceholder,
  errorComponent: AsyncFailed,
  delay: ASYNC_LOAD_DELAY_MS,
  timeout: ASYNC_LOAD_TIMEOUT_MS,
});
const AsyncComponentFail = defineAsyncComponent({
  loader: loadAsyncComponent(true),
  loadingComponent: AsyncLoadingPlaceholder,
  errorComponent: AsyncFailed,
  delay: ASYNC_LOAD_DELAY_MS,
  timeout: ASYNC_LOAD_TIMEOUT_MS,
});

const ASYNC_DEMO_MODE = { Idle: 'idle', Ok: 'ok', Fail: 'fail' } as const;
type IAsyncDemoMode = (typeof ASYNC_DEMO_MODE)[keyof typeof ASYNC_DEMO_MODE];

const AsyncComponentDemo = defineComponent({
  name: 'AsyncComponentDemo',
  setup() {
    const mode = ref<IAsyncDemoMode>(ASYNC_DEMO_MODE.Idle);
    return () => (
      <View class="section-nested">
        <Text class="section-label">
          defineAsyncComponent() — its own loading/error components, independent
          of Suspense
        </Text>
        <View class="row-tight">
          <ActionButton
            testID="async-load-ok"
            title="Load (succeeds)"
            onPress={() => (mode.value = ASYNC_DEMO_MODE.Ok)}
            color={LINE_COLOR.framework}
          />
          <ActionButton
            testID="async-load-fail"
            title="Load (fails)"
            onPress={() => (mode.value = ASYNC_DEMO_MODE.Fail)}
            color={LINE_COLOR.framework}
          />
        </View>
        {mode.value === ASYNC_DEMO_MODE.Ok && <AsyncComponentOk />}
        {mode.value === ASYNC_DEMO_MODE.Fail && <AsyncComponentFail />}
        {mode.value === ASYNC_DEMO_MODE.Idle && (
          <Text class="list-row-text">pick a load button</Text>
        )}
      </View>
    );
  },
});

/* ── Reactivity API + Template Refs ──────────────────────────────────────────────────────────── */

const RefComputedWatchDemo = defineComponent({
  name: 'RefComputedWatchDemo',
  setup() {
    const count = ref(0);
    const doubled = computed(() => count.value * 2);
    const log = ref<string[]>([]);

    watch(count, (value, previous) =>
      pushLimited(log, `watch(count): ${previous} → ${value}`),
    );
    watchEffect(() =>
      pushLimited(log, `watchEffect: doubled is now ${doubled.value}`),
    );
    watchPostEffect(() =>
      pushLimited(
        log,
        `watchPostEffect: ran after the patch, doubled=${doubled.value}`,
      ),
    );
    watchSyncEffect(() =>
      pushLimited(
        log,
        `watchSyncEffect: fires synchronously, count=${count.value}`,
      ),
    );

    return () => (
      <View class="section-nested">
        <Text class="section-label">
          ref() / computed() / watch() / watchEffect() / watchPostEffect() /
          watchSyncEffect()
        </Text>
        <ActionButton
          testID="reactivity-increment"
          title={`count: ${count.value} (tap to increment)`}
          onPress={() => (count.value += 1)}
          color={LINE_COLOR.framework}
        />
        <Text class="info-text">{`computed doubled: ${doubled.value}`}</Text>
        <View class="log-card">
          {log.value.map((entry, index) => (
            <Text key={index} class="list-row-text">
              {entry}
            </Text>
          ))}
        </View>
      </View>
    );
  },
});

const DeepVsShallowDemo = defineComponent({
  name: 'DeepVsShallowDemo',
  setup() {
    const deep = reactive({ nested: { hits: 0 } });
    const shallow = shallowReactive({ nested: { hits: 0 } });
    const deepGuard = readonly(deep);
    const shallowGuard = shallowReadonly(shallow);
    const deepHitLog = ref(0);
    const shallowHitLog = ref(0);

    watch(
      () => deep.nested.hits,
      () => (deepHitLog.value += 1),
    );
    // shallow.nested is never wrapped in a reactive proxy (shallowReactive stops at root-level
    // keys) — this watcher genuinely never fires, proving the shallowness rather than assuming it.
    watch(
      () => shallow.nested.hits,
      () => (shallowHitLog.value += 1),
    );

    const mutateNested = (): void => {
      deep.nested.hits += 1;
      shallow.nested.hits += 1;
    };

    return () => (
      <View class="section-nested">
        <Text class="section-label">
          reactive() vs shallowReactive() / readonly() / shallowReadonly()
        </Text>
        <ActionButton
          testID="deep-shallow-mutate"
          title="Mutate nested.hits on both"
          onPress={mutateNested}
          color={LINE_COLOR.framework}
        />
        <Text class="info-text">
          {`reactive(): watcher fired ${deepHitLog.value} time(s) · deep.nested.hits=${deep.nested.hits}`}
        </Text>
        <Text class="info-text">
          {`shallowReactive(): watcher fired ${shallowHitLog.value} time(s) · shallow.nested.hits=${shallow.nested.hits}`}
        </Text>
        <Text class="info-text">
          {`isReadonly(readonly(deep)): ${isReadonly(deepGuard)} · isReadonly(shallowReadonly(shallow)): ${isReadonly(shallowGuard)}`}
        </Text>
      </View>
    );
  },
});

const IdentitySafeHostRefDemo = defineComponent({
  name: 'IdentitySafeHostRefDemo',
  setup() {
    // shallowRef, NOT ref: deep-wrapping an engine node in a reactive Proxy breaks the engine's
    // identity-keyed WeakMap mirror (vue-adapter-reactivity Gotcha 1) — every imperative call
    // below would silently no-op.
    const boxRef = shallowRef<IHostInstance | null>(null);
    // Vue composable, not a React hook; this plugin has no Vue setup() concept and misreads any
    // use*() call inside it (same pre-existing false positive as useColorScheme/
    // useWindowDimensions in CanaryScreen.tsx).
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const tplRef = useTemplateRef<IHostInstance>('api-playground-tpl-box');
    const frame = ref('tap "Measure"');
    const flashed = ref(false);
    const identityProof = ref('not mounted yet');
    const effectRuns = ref(0);

    // Reading boxRef.value HERE establishes the dependency triggerRef(boxRef) below manually
    // re-fires — a shallowRef only auto-notifies on IDENTITY replacement, never on this kind of
    // "nothing changed, just re-prove the identity" nudge.
    watchEffect(() => {
      const node = boxRef.value;
      effectRuns.value += 1;
      identityProof.value =
        node === null
          ? 'not mounted yet'
          : `markRaw(node) === toRaw(node): ${markRaw(node) === toRaw(node)} (never Proxy-wrapped — held via shallowRef)`;
    });

    const onMeasure = (): void => {
      const box = boxRef.value;
      if (box === null) return;
      box.measure((x, y, width, height) => {
        frame.value = `${Math.round(width)}×${Math.round(height)} at (${Math.round(x)},${Math.round(y)})`;
      });
    };
    const onFlash = (): void => {
      const box = boxRef.value;
      if (box === null) return;
      flashed.value = !flashed.value;
      box.setNativeProps({
        style: {
          backgroundColor: flashed.value ? LINE_COLOR.framework : '#13243a',
        },
      });
    };
    const onTriggerRef = (): void => triggerRef(boxRef);

    return () => (
      <View class="section-nested">
        <Text class="section-label">
          Template Refs · shallowRef / useTemplateRef / triggerRef / markRaw /
          toRaw
        </Text>
        <View ref={boxRef} testID="tplref-shallow-box" class="flash-box">
          <Text class="flash-box-text">{frame.value}</Text>
        </View>
        {/* eslint-disable-next-line react/no-string-refs -- Vue's OWN string-ref form (3.5+
            useTemplateRef), not React's legacy this.refs pattern this rule targets. */}
        <View
          ref="api-playground-tpl-box"
          testID="tplref-named-box"
          class="flash-box"
        >
          <Text class="flash-box-text">{`useTemplateRef resolved: ${tplRef.value !== null}`}</Text>
        </View>
        <View class="row-tight">
          <ActionButton
            testID="tplref-measure"
            title="Measure"
            onPress={onMeasure}
            color={LINE_COLOR.framework}
          />
          <ActionButton
            testID="tplref-flash"
            title="Flash"
            onPress={onFlash}
            color={LINE_COLOR.framework}
          />
          <ActionButton
            testID="tplref-trigger"
            title="triggerRef"
            onPress={onTriggerRef}
            color={LINE_COLOR.framework}
          />
        </View>
        <Text class="info-text">{identityProof.value}</Text>
        <Text class="info-text">{`watchEffect over the shallowRef re-ran ${effectRuns.value} time(s)`}</Text>
      </View>
    );
  },
});

const DEBOUNCE_MS = 400;

function debouncedRef<T>(initialValue: T, delayMs: number): Ref<T> {
  let value = initialValue;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  return customRef<T>((track, trigger) => ({
    get() {
      track();
      return value;
    },
    set(next) {
      value = next;
      clearTimeout(timeoutHandle);
      timeoutHandle = setTimeout(trigger, delayMs);
    },
  }));
}

const CustomRefDemo = defineComponent({
  name: 'CustomRefDemo',
  setup() {
    const draft = ref('');
    const committed = debouncedRef('', DEBOUNCE_MS);
    watch(draft, value => (committed.value = value));
    return () => (
      <View class="section-nested">
        <Text class="section-label">customRef() → a debounced ref</Text>
        <TextInput
          testID="customref-input"
          class="text-input"
          value={draft.value}
          onValueChange={(text: string) => (draft.value = text)}
          placeholder="type — commits 400ms after the last keystroke"
          placeholderTextColor="#41506a"
        />
        <Text class="info-text">{`committed (debounced) value: "${committed.value}"`}</Text>
      </View>
    );
  },
});

const EffectScopeDemo = defineComponent({
  name: 'EffectScopeDemo',
  setup() {
    const source = ref(0);
    const log = ref<string[]>([]);
    let scope: ReturnType<typeof effectScope> | null = null;

    const startScope = (): void => {
      scope?.stop();
      scope = effectScope();
      scope.run(() => {
        pushLimited(
          log,
          `getCurrentScope() inside run(): ${getCurrentScope() !== undefined}`,
        );
        watchEffect(() =>
          pushLimited(log, `scoped watchEffect: source=${source.value}`),
        );
        onScopeDispose(() =>
          pushLimited(log, 'onScopeDispose: scoped effect torn down'),
        );
      });
    };
    const stopScope = (): void => {
      scope?.stop();
      scope = null;
    };

    return () => (
      <View class="section-nested">
        <Text class="section-label">
          effectScope() / getCurrentScope() / onScopeDispose()
        </Text>
        <View class="row-tight">
          <ActionButton
            testID="scope-start"
            title="Start scope"
            onPress={startScope}
            color={LINE_COLOR.framework}
          />
          <ActionButton
            testID="scope-bump"
            title="Bump source"
            onPress={() => (source.value += 1)}
            color={LINE_COLOR.framework}
          />
          <ActionButton
            testID="scope-stop"
            title="Stop scope"
            onPress={stopScope}
            color={LINE_COLOR.framework}
          />
        </View>
        <View class="log-card">
          {log.value.length === 0 ? (
            <Text class="list-row-text">
              start a scope, then bump — stop to see onScopeDispose fire
            </Text>
          ) : (
            log.value.map((entry, index) => (
              <Text key={index} class="list-row-text">
                {entry}
              </Text>
            ))
          )}
        </View>
      </View>
    );
  },
});

const ReactivityUtilityInspector = defineComponent({
  name: 'ReactivityUtilityInspector',
  setup() {
    const sampleRef = ref(1);
    const sampleReactive = reactive({ a: 1 });
    const sampleReadonly = readonly(sampleReactive);
    const sampleShallowRef = shallowRef({ a: 1 });
    const sampleShallowReactive = shallowReactive({ a: 1 });
    const plainObject = { a: 1 };

    const ranAt = ref<number | null>(null);
    const rows = ref<ReadonlyArray<readonly [string, string]>>([]);

    const runInspector = (): void => {
      ranAt.value = Date.now();
      rows.value = [
        ['isRef(sampleRef)', String(isRef(sampleRef))],
        ['unref(sampleRef)', String(unref(sampleRef))],
        ['isReactive(sampleReactive)', String(isReactive(sampleReactive))],
        ['isReactive(plainObject)', String(isReactive(plainObject))],
        ['isReadonly(sampleReadonly)', String(isReadonly(sampleReadonly))],
        ['isProxy(sampleReactive)', String(isProxy(sampleReactive))],
        ['isProxy(plainObject)', String(isProxy(plainObject))],
        ['isShallow(sampleShallowRef)', String(isShallow(sampleShallowRef))],
        [
          'isShallow(sampleShallowReactive)',
          String(isShallow(sampleShallowReactive)),
        ],
        ['toValue(sampleRef)', String(toValue(sampleRef))],
        ['toValue(() => 42)', String(toValue(() => 42))],
        [
          'toRef(sampleReactive, "a").value',
          String(toRef(sampleReactive, 'a').value),
        ],
        [
          'Object.keys(toRefs(sampleReactive))',
          Object.keys(toRefs(sampleReactive)).join(', '),
        ],
        ['toRaw(sampleReactive)', JSON.stringify(toRaw(sampleReactive))],
      ];
    };

    return () => (
      <View class="section-nested">
        <Text class="section-label">
          Reactivity utilities · isRef / unref / isReactive / isReadonly /
          isProxy / isShallow / toRef / toRefs / toValue / toRaw
        </Text>
        <ActionButton
          testID="inspector-run"
          title="Run inspector"
          onPress={runInspector}
          color={LINE_COLOR.framework}
        />
        {ranAt.value === null ? (
          <Text class="list-row-text">
            tap "Run inspector" to evaluate every check live
          </Text>
        ) : (
          <View class="log-card">
            {rows.value.map(([key, value]) => (
              <View key={key} class="inspector-row">
                <Text class="inspector-key">{key}</Text>
                <Text class="inspector-value">{value}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  },
});

/* ── Lifecycle Hooks ──────────────────────────────────────────────────────────────────────────── */

type ILifecycleLoggerProps = { onLog: (msg: string) => void; bump: number };

const LifecycleLoggerChild = defineComponent<ILifecycleLoggerProps>(
  props => {
    const boxRef = shallowRef<ISymbioteNode | null>(null);
    onBeforeMount(() => props.onLog('onBeforeMount'));
    onMounted(() => {
      props.onLog(
        'onMounted (fires before the tag may exist — see whenCommitted below)',
      );
      const node = boxRef.value;
      if (node !== null) {
        whenCommitted(node, () =>
          props.onLog(
            `onMounted → whenCommitted: tag=${String(getNativeTag(node))}`,
          ),
        );
      }
    });
    onBeforeUpdate(() => props.onLog('onBeforeUpdate'));
    onUpdated(() => props.onLog('onUpdated'));
    onBeforeUnmount(() => props.onLog('onBeforeUnmount'));
    onUnmounted(() => props.onLog('onUnmounted'));
    onRenderTracked(() => props.onLog('onRenderTracked (dev-only)'));
    onRenderTriggered(() => props.onLog('onRenderTriggered (dev-only)'));
    return () => (
      <View ref={boxRef} class="tab-card" testID="lifecycle-child">
        <Text class="info-text">{`bump: ${props.bump}`}</Text>
      </View>
    );
  },
  { name: 'LifecycleLoggerChild', props: ['onLog', 'bump'] },
);

const LifecycleLoggerDemo = defineComponent({
  name: 'LifecycleLoggerDemo',
  setup() {
    const mounted = ref(false);
    const bump = ref(0);
    const log = ref<string[]>([]);
    return () => (
      <View class="section-nested">
        <Text class="section-label">Lifecycle hooks</Text>
        <Text class="note-text">
          onRenderTracked/onRenderTriggered are dev-only — never firing in a
          release bundle is expected, not broken.
        </Text>
        <View class="row-tight">
          <ActionButton
            testID="lifecycle-toggle"
            title={mounted.value ? 'Unmount' : 'Mount'}
            onPress={() => (mounted.value = !mounted.value)}
            color={LINE_COLOR.framework}
          />
          <ActionButton
            testID="lifecycle-bump"
            title="Force update"
            onPress={() => (bump.value += 1)}
            color={LINE_COLOR.framework}
          />
        </View>
        {mounted.value && (
          <LifecycleLoggerChild
            bump={bump.value}
            onLog={msg => pushLimited(log, msg)}
          />
        )}
        <View class="log-card">
          {log.value.length === 0 ? (
            <Text class="list-row-text">mount the child to start logging</Text>
          ) : (
            log.value.map((entry, index) => (
              <Text key={index} class="list-row-text">
                {entry}
              </Text>
            ))
          )}
        </View>
      </View>
    );
  },
});

type IErrorChildProps = { shouldThrow: boolean };

const ErrorChild = defineComponent<IErrorChildProps>(
  props => {
    onMounted(() => {
      if (props.shouldThrow) throw new Error('boom from ErrorChild.onMounted');
    });
    return () => (
      <Text class="list-row-text">error child mounted without throwing</Text>
    );
  },
  { name: 'ErrorChild', props: ['shouldThrow'] },
);

const ErrorCapturedDemo = defineComponent({
  name: 'ErrorCapturedDemo',
  setup() {
    const armed = ref(false);
    const caught = ref<string | null>(null);
    onErrorCaptured(error => {
      caught.value = error instanceof Error ? error.message : String(error);
      armed.value = false;
      return false; // stop propagation — the error dies here, the rest of the screen keeps rendering.
    });
    return () => (
      <View class="section-nested">
        <Text class="section-label">onErrorCaptured()</Text>
        <ActionButton
          testID="error-arm"
          title="Mount a child that throws"
          onPress={() => {
            caught.value = null;
            armed.value = true;
          }}
          color={LINE_COLOR.framework}
        />
        {armed.value && <ErrorChild shouldThrow={true} />}
        <Text class="info-text">
          {caught.value === null
            ? 'no error captured yet'
            : `captured: ${caught.value}`}
        </Text>
      </View>
    );
  },
});

/* ── Composition API / Dependency Injection ──────────────────────────────────────────────────── */

type IThemeContext = { accent: Ref<string> };
const THEME_KEY: InjectionKey<IThemeContext> = Symbol('api-playground-theme');

const ProvideInjectChild = defineComponent({
  name: 'ProvideInjectChild',
  setup() {
    const theme = inject(THEME_KEY);
    const hasContextHere = hasInjectionContext();
    const instance = getCurrentInstance();
    return () => (
      <View class="tab-card">
        <Text class="info-text">
          {`inject(THEME_KEY): ${theme === undefined ? 'undefined (no provider above)' : theme.accent.value}`}
        </Text>
        <Text class="info-text">{`hasInjectionContext() inside setup(): ${hasContextHere}`}</Text>
        <Text class="info-text">
          {`getCurrentInstance() inside setup(): ${instance !== null ? 'a real ComponentInternalInstance' : 'null'}`}
        </Text>
      </View>
    );
  },
});

const ProvideInjectDemo = defineComponent({
  name: 'ProvideInjectDemo',
  setup() {
    const accent = ref(LINE_COLOR.framework);
    provide(THEME_KEY, { accent });
    const outsideSetupCheck = ref<boolean | null>(null);
    onMounted(() => {
      // Called AFTER setup() has already returned — no active instance left to inject against,
      // exactly the false-vs-true contrast this row exists to show.
      outsideSetupCheck.value = hasInjectionContext();
    });
    return () => (
      <View class="section-nested">
        <Text class="section-label">
          provide() / inject() / hasInjectionContext() / getCurrentInstance()
        </Text>
        <ActionButton
          testID="provide-rotate"
          title="Rotate accent"
          onPress={() =>
            (accent.value =
              accent.value === LINE_COLOR.framework
                ? '#68d391'
                : LINE_COLOR.framework)
          }
          color={accent.value}
        />
        <ProvideInjectChild />
        <Text class="info-text">
          {`hasInjectionContext() from onMounted (outside setup): ${outsideSetupCheck.value ?? 'not checked yet'}`}
        </Text>
      </View>
    );
  },
});

const CommitTimingDemo = defineComponent({
  name: 'CommitTimingDemo',
  setup() {
    const attempt = ref(0);
    const log = ref<string[]>([]);
    const probeRef = shallowRef<ISymbioteNode | null>(null);

    // flush: 'post' — the exact timing vue-adapter-reactivity's Gotcha 2 warns about: this runs
    // AFTER Vue's own patch (probeRef.value already points at the fresh node), but the engine's
    // Fabric commit is a SEPARATE microtask (surface.requestCommit()) that may not have landed yet.
    watch(
      attempt,
      value => {
        if (value === 0) return;
        const node = probeRef.value;
        if (node === null) return;
        void nextTick().then(() =>
          pushLimited(log, `nextTick(): tag=${String(getNativeTag(node))}`),
        );
        whenCommitted(node, () =>
          pushLimited(
            log,
            `whenCommitted(): tag=${String(getNativeTag(node))}`,
          ),
        );
      },
      { flush: 'post' },
    );

    const onMountProbe = (): void => {
      log.value = [];
      attempt.value += 1;
    };

    return () => (
      <View class="section-nested">
        <Text class="section-label">
          nextTick() vs whenCommitted() — the async-commit race
        </Text>
        <Text class="note-text">
          nextTick() only guarantees Vue's own patch flush finished, not that
          the engine's Fabric commit (a separate microtask) landed — a
          "tag=undefined" line below is the race actually happening, not a bug
          in this demo.
        </Text>
        <ActionButton
          testID="commit-timing-probe"
          title="Mount + probe both"
          onPress={onMountProbe}
          color={LINE_COLOR.framework}
        />
        {attempt.value > 0 && (
          <View
            key={attempt.value}
            ref={probeRef}
            testID="commit-timing-node"
            class="flash-box"
          >
            <Text class="flash-box-text">freshly mounted probe node</Text>
          </View>
        )}
        <View class="log-card">
          {log.value.length === 0 ? (
            <Text class="list-row-text">
              tap the button to mount a fresh node and race the two reads
            </Text>
          ) : (
            log.value.map((entry, index) => (
              <Text key={index} class="list-row-text">
                {entry}
              </Text>
            ))
          )}
        </View>
      </View>
    );
  },
});

/* ── Render Function API ──────────────────────────────────────────────────────────────────────── */

const RawRenderFunctionDemo = defineComponent({
  name: 'RawRenderFunctionDemo',
  setup() {
    return () => {
      const original = createVNode(
        Text,
        { class: 'list-row-text', testID: 'raw-h-original' },
        'built with createVNode()',
      );
      const cloned = cloneVNode(original, {
        class: 'accent-note',
        testID: 'raw-h-cloned',
      });
      const merged = mergeProps(
        { class: 'list-row-text' },
        { testID: 'raw-h-merged' },
        { style: { opacity: 0.75 } },
      );
      return (
        <View class="section-nested">
          <Text class="section-label">
            h() / createVNode / cloneVNode / isVNode / Fragment / mergeProps
          </Text>
          <Text class="note-text">
            Every element on this whole screen already compiles down to h()
            through @vue/babel-plugin-jsx — this widget just calls the
            primitives directly instead of through JSX sugar.
          </Text>
          {original}
          {cloned}
          <Text class="info-text">{`isVNode(original): ${isVNode(original)} · isVNode({}): ${isVNode({})}`}</Text>
          {h(Fragment, {}, [
            <Text key="fragment-a" class="list-row-text">
              Fragment child A
            </Text>,
            <Text key="fragment-b" class="list-row-text">
              Fragment child B — one h(Fragment, …) call, two roots
            </Text>,
          ])}
          {h(Text, merged, 'props merged via mergeProps()')}
        </View>
      );
    };
  },
});

/* ── Screen composition ───────────────────────────────────────────────────────────────────────── */

export const ApiPlaygroundScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.ApiPlayground];
    return () => (
      <SafeAreaView class="screen">
        <ScrollView
          testID="playground-scroll"
          class="screen"
          contentContainerStyle="scroll-content"
        >
          <View class={`line-tag line-tag-${lineInfo.line}`}>
            <Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
          </View>
          <View class="hero-card">
            <View
              class="hero-badge"
              style={{ backgroundColor: LINE_COLOR.framework }}
            >
              <Text class="hero-badge-text">AP</Text>
            </View>
            <View class="hero-copy">
              <Text class="hero-title">API Playground</Text>
              <Text class="hero-body">
                Vue's own Composition API, reactivity, lifecycle, and
                render-function surface — h(), withDirectives(), provide/inject,
                KeepAlive, Suspense — running live under Symbiote's engine
                instead of the DOM. Not @symbiote-native/navigation; this is Vue
                itself.
              </Text>
            </View>
          </View>

          <Text class="section-label">
            TEMPLATE DIRECTIVES → the vue-tsx way
          </Text>
          <ConditionalRenderingDemo />
          <NumberStepperVModelDemo />
          <EventModifiersDemo />
          <CustomDirectiveDemo />
          <ScopedSlotDemo />
          <Text class="note-text">
            v-bind / v-on / v-bind.camel are already the JSX norm here (plain
            props, used throughout this app) — nothing to demo. v-text ≈ a text
            interpolation, which JSX always does. v-pre has no real purpose
            outside an in-DOM template. v-show and {'<Teleport>'} are already
            demoed live in CanaryScreen — not rebuilt here, see that screen
            instead.
          </Text>

          <Text class="section-label">
            BUILT-IN COMPONENTS · KeepAlive &amp; Suspense (first real test)
          </Text>
          <KeepAliveDemo />
          <SuspenseDemo />
          <AsyncComponentDemo />

          <Text class="section-label">REACTIVITY API + TEMPLATE REFS</Text>
          <RefComputedWatchDemo />
          <DeepVsShallowDemo />
          <IdentitySafeHostRefDemo />
          <CustomRefDemo />
          <EffectScopeDemo />
          <ReactivityUtilityInspector />

          <Text class="section-label">LIFECYCLE HOOKS</Text>
          <LifecycleLoggerDemo />
          <ErrorCapturedDemo />

          <Text class="section-label">
            COMPOSITION API / DEPENDENCY INJECTION
          </Text>
          <ProvideInjectDemo />
          <CommitTimingDemo />

          <Text class="section-label">RENDER FUNCTION API</Text>
          <RawRenderFunctionDemo />
          <Text class="note-text">
            withKeys() is a real shim (adapters/vue/src/runtime-helpers) but has
            no live demo here — Pressable's onPress event carries no `.key`
            field to filter against, and this screen has no keyboard-driven
            input wired up to try it on. resolveComponent()/resolveDirective()
            need a name registered via app.component()/app.directive(), which
            this app never does (every component here is imported directly).
            defineSlots() is type-only and compiled away — nothing to run.
            defineProps()/defineEmits()/defineExpose()/defineModel()/useModel()
            are {'<script setup>'} SFC compiler macros with no TSX form —
            NumberStepper above is the actual vue-tsx equivalent (a plain
            props/emits option pair). createApp()/app.mount()/ app.* are this
            whole app's own bootstrap (adapters/vue/src/render.ts) — already
            exercised once per app run, not something a single screen re-demos.
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  },
  { name: 'ApiPlaygroundScreen' },
);
