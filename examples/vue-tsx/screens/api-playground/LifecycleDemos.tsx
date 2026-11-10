import {
  defineComponent,
  onBeforeMount,
  onBeforeUnmount,
  onBeforeUpdate,
  onErrorCaptured,
  onMounted,
  onRenderTracked,
  onRenderTriggered,
  onUnmounted,
  onUpdated,
  ref,
  shallowRef,
} from 'vue';
import type { ISymbioteNode } from '@symbiote-native/vue';
import { getNativeTag, whenCommitted } from '@symbiote-native/engine';
import { ActionButton } from '../../components/ActionButton';
import { LINE_COLOR } from '../../navigation-lines';
import { LogCard } from './LogCard';
import { pushLimited } from './log';

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
      <view ref={boxRef} class="tab-card" testID="lifecycle-child">
        <text class="info-text">{`bump: ${props.bump}`}</text>
      </view>
    );
  },
  { name: 'LifecycleLoggerChild', props: ['onLog', 'bump'] },
);

export const LifecycleLoggerDemo = defineComponent({
  name: 'LifecycleLoggerDemo',
  setup() {
    const mounted = ref(false);
    const bump = ref(0);
    const log = ref<string[]>([]);
    return () => (
      <view class="section-nested">
        <text class="section-label">Lifecycle hooks</text>
        <text class="note-text">
          onRenderTracked/onRenderTriggered are dev-only — never firing in a
          release bundle is expected, not broken.
        </text>
        <view class="row-tight">
          <ActionButton
            testID="lifecycle-toggle"
            title={mounted.value ? 'Unmount' : 'Mount'}
            onPress={() => (mounted.value = !mounted.value)}
            color={LINE_COLOR.introspection}
          />
          <ActionButton
            testID="lifecycle-bump"
            title="Force update"
            onPress={() => (bump.value += 1)}
            color={LINE_COLOR.introspection}
          />
        </view>
        {mounted.value && (
          <LifecycleLoggerChild
            bump={bump.value}
            onLog={msg => pushLimited(log, msg)}
          />
        )}
        <LogCard
          entries={log.value}
          emptyText="mount the child to start logging"
        />
      </view>
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
      <text class="list-row-text">error child mounted without throwing</text>
    );
  },
  { name: 'ErrorChild', props: ['shouldThrow'] },
);

export const ErrorCapturedDemo = defineComponent({
  name: 'ErrorCapturedDemo',
  setup() {
    const armed = ref(false);
    const caught = ref<string | null>(null);
    onErrorCaptured(error => {
      caught.value = error instanceof Error ? error.message : String(error);
      armed.value = false;
      // Stops the propagation, so the rest of the screen keeps rendering
      return false;
    });
    return () => (
      <view class="section-nested">
        <text class="section-label">onErrorCaptured()</text>
        <ActionButton
          testID="error-arm"
          title="Mount a child that throws"
          onPress={() => {
            caught.value = null;
            armed.value = true;
          }}
          color={LINE_COLOR.introspection}
        />
        {armed.value && <ErrorChild shouldThrow={true} />}
        <text class="info-text">
          {caught.value === null
            ? 'no error captured yet'
            : `captured: ${caught.value}`}
        </text>
      </view>
    );
  },
});
