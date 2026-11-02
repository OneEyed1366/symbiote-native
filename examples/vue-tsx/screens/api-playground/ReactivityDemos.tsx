import {
  customRef,
  defineComponent,
  effectScope,
  getCurrentScope,
  isProxy,
  isReactive,
  isReadonly,
  isRef,
  isShallow,
  onScopeDispose,
  reactive,
  readonly,
  ref,
  shallowReactive,
  shallowReadonly,
  shallowRef,
  toRaw,
  toRef,
  toRefs,
  toValue,
  unref,
  watch,
  watchEffect,
  watchPostEffect,
  watchSyncEffect,
  computed,
} from 'vue';
import type { Ref } from 'vue';
import { ActionButton } from '../../components/ActionButton';
import { LINE_COLOR } from '../../navigation-lines';
import { LogCard } from './LogCard';
import { pushLimited } from './log';

export const RefComputedWatchDemo = defineComponent({
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
      <view class="section-nested">
        <text class="section-label">
          ref() / computed() / watch() / watchEffect() / watchPostEffect() /
          watchSyncEffect()
        </text>
        <ActionButton
          testID="reactivity-increment"
          title={`count: ${count.value} (tap to increment)`}
          onPress={() => (count.value += 1)}
          color={LINE_COLOR.introspection}
        />
        <text class="info-text">{`computed doubled: ${doubled.value}`}</text>
        <view class="log-card">
          {log.value.map((entry, index) => (
            <text key={index} class="list-row-text">
              {entry}
            </text>
          ))}
        </view>
      </view>
    );
  },
});

export const DeepVsShallowDemo = defineComponent({
  name: 'DeepVsShallowDemo',
  setup() {
    const deep = reactive({ nested: { hits: 0 } });
    const shallow = shallowReactive({ nested: { hits: 0 } });
    const deepHitLog = ref(0);
    const shallowHitLog = ref(0);

    watch(
      () => deep.nested.hits,
      () => (deepHitLog.value += 1),
    );
    // `shallowReactive` stops at root-level keys, so this watcher never fires
    watch(
      () => shallow.nested.hits,
      () => (shallowHitLog.value += 1),
    );

    const mutateNested = (): void => {
      deep.nested.hits += 1;
      shallow.nested.hits += 1;
    };

    const deepGuard = readonly(deep);
    const shallowGuard = shallowReadonly(shallow);
    return () => (
      <view class="section-nested">
        <text class="section-label">
          reactive() vs shallowReactive() / readonly() / shallowReadonly()
        </text>
        <ActionButton
          testID="deep-shallow-mutate"
          title="Mutate nested.hits on both"
          onPress={mutateNested}
          color={LINE_COLOR.introspection}
        />
        <text class="info-text">
          {`reactive(): watcher fired ${deepHitLog.value} time(s) · deep.nested.hits=${deep.nested.hits}`}
        </text>
        <text class="info-text">
          {`shallowReactive(): watcher fired ${shallowHitLog.value} time(s) · shallow.nested.hits=${shallow.nested.hits}`}
        </text>
        <text class="info-text">
          {`isReadonly(readonly(deep)): ${isReadonly(deepGuard)} · isReadonly(shallowReadonly(shallow)): ${isReadonly(shallowGuard)}`}
        </text>
      </view>
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

export const CustomRefDemo = defineComponent({
  name: 'CustomRefDemo',
  setup() {
    const draft = ref('');
    const committed = debouncedRef('', DEBOUNCE_MS);
    watch(draft, value => (committed.value = value));
    return () => (
      <view class="section-nested">
        <text class="section-label">customRef() → a debounced ref</text>
        <text-input
          testID="customref-input"
          class="text-input"
          value={draft.value}
          onValueChange={event => (draft.value = event.text)}
          placeholder="type — commits 400ms after the last keystroke"
          placeholderTextColor="#41506a"
        />
        <text class="info-text">{`committed (debounced) value: "${committed.value}"`}</text>
      </view>
    );
  },
});

export const EffectScopeDemo = defineComponent({
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
      <view class="section-nested">
        <text class="section-label">
          effectScope() / getCurrentScope() / onScopeDispose()
        </text>
        <view class="row-tight">
          <ActionButton
            testID="scope-start"
            title="Start scope"
            onPress={startScope}
            color={LINE_COLOR.introspection}
          />
          <ActionButton
            testID="scope-bump"
            title="Bump source"
            onPress={() => (source.value += 1)}
            color={LINE_COLOR.introspection}
          />
          <ActionButton
            testID="scope-stop"
            title="Stop scope"
            onPress={stopScope}
            color={LINE_COLOR.introspection}
          />
        </view>
        <LogCard
          entries={log.value}
          emptyText="start a scope, then bump — stop to see onScopeDispose fire"
        />
      </view>
    );
  },
});

export const ReactivityUtilityInspector = defineComponent({
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
      <view class="section-nested">
        <text class="section-label">
          Reactivity utilities · isRef / unref / isReactive / isReadonly /
          isProxy / isShallow / toRef / toRefs / toValue / toRaw
        </text>
        <ActionButton
          testID="inspector-run"
          title="Run inspector"
          onPress={runInspector}
          color={LINE_COLOR.introspection}
        />
        {ranAt.value === null ? (
          <text class="list-row-text">
            tap "Run inspector" to evaluate every check live
          </text>
        ) : (
          <view class="log-card">
            {rows.value.map(([key, value]) => (
              <view key={key} class="inspector-row">
                <text class="inspector-key">{key}</text>
                <text class="inspector-value">{value}</text>
              </view>
            ))}
          </view>
        )}
      </view>
    );
  },
});
