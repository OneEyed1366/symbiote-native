import {
  defineComponent,
  markRaw,
  nextTick,
  ref,
  shallowRef,
  toRaw,
  triggerRef,
  useTemplateRef,
  watch,
  watchEffect,
} from 'vue';
import type { IHostInstance, ISymbioteNode } from '@symbiote-native/vue';
import { getNativeTag, whenCommitted } from '@symbiote-native/engine';
import { ActionButton } from '../../components/ActionButton';
import { LINE_COLOR } from '../../navigation-lines';
import { LogCard } from './LogCard';
import { pushLimited } from './log';

const IDLE_BOX_COLOR = '#13243a';

export const IdentitySafeHostRefDemo = defineComponent({
  name: 'IdentitySafeHostRefDemo',
  setup() {
    // `shallowRef`, not `ref`: a deep reactive Proxy around an engine node breaks the identity
    // keyed mirror of the engine, and every imperative call below would silently do nothing
    const boxRef = shallowRef<IHostInstance | null>(null);
    // A Vue composable that the react-hooks plugin misreads as a hook inside `setup()`
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const tplRef = useTemplateRef<IHostInstance>('api-playground-tpl-box');
    const frame = ref('tap "Measure"');
    const flashed = ref(false);
    const identityProof = ref('not mounted yet');
    const effectRuns = ref(0);

    // Reading `boxRef.value` here is the dependency that `triggerRef(boxRef)` re-fires manually
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
          backgroundColor: flashed.value
            ? LINE_COLOR.introspection
            : IDLE_BOX_COLOR,
        },
      });
    };
    const onTriggerRef = (): void => triggerRef(boxRef);

    return () => (
      <view class="section-nested">
        <text class="section-label">
          Template Refs · shallowRef / useTemplateRef / triggerRef / markRaw /
          toRaw
        </text>
        <view ref={boxRef} testID="tplref-shallow-box" class="flash-box">
          <text class="flash-box-text">{frame.value}</text>
        </view>
        <view
          // eslint-disable-next-line react/no-string-refs -- the string ref form of Vue 3.5
          ref="api-playground-tpl-box"
          testID="tplref-named-box"
          class="flash-box"
        >
          <text class="flash-box-text">{`useTemplateRef resolved: ${tplRef.value !== null}`}</text>
        </view>
        <view class="row-tight">
          <ActionButton
            testID="tplref-measure"
            title="Measure"
            onPress={onMeasure}
            color={LINE_COLOR.introspection}
          />
          <ActionButton
            testID="tplref-flash"
            title="Flash"
            onPress={onFlash}
            color={LINE_COLOR.introspection}
          />
          <ActionButton
            testID="tplref-trigger"
            title="triggerRef"
            onPress={onTriggerRef}
            color={LINE_COLOR.introspection}
          />
        </view>
        <text class="info-text">{identityProof.value}</text>
        <text class="info-text">{`watchEffect over the shallowRef re-ran ${effectRuns.value} time(s)`}</text>
      </view>
    );
  },
});

export const CommitTimingDemo = defineComponent({
  name: 'CommitTimingDemo',
  setup() {
    const attempt = ref(0);
    const log = ref<string[]>([]);
    const probeRef = shallowRef<ISymbioteNode | null>(null);

    // `flush: 'post'` runs after the Vue patch, while the Fabric commit is a separate microtask
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
      <view class="section-nested">
        <text class="section-label">
          nextTick() vs whenCommitted() — the async-commit race
        </text>
        <text class="note-text">
          nextTick() only guarantees Vue's own patch flush finished, not that
          the engine's Fabric commit (a separate microtask) landed — a
          "tag=undefined" line below is the race actually happening, not a bug
          in this demo.
        </text>
        <ActionButton
          testID="commit-timing-probe"
          title="Mount + probe both"
          onPress={onMountProbe}
          color={LINE_COLOR.introspection}
        />
        {attempt.value > 0 && (
          <view
            key={attempt.value}
            ref={probeRef}
            testID="commit-timing-node"
            class="flash-box"
          >
            <text class="flash-box-text">freshly mounted probe node</text>
          </view>
        )}
        <LogCard
          entries={log.value}
          emptyText="tap the button to mount a fresh node and race the two reads"
        />
      </view>
    );
  },
});
