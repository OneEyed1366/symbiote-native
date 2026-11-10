import {
  KeepAlive,
  Suspense,
  defineAsyncComponent,
  defineComponent,
  h,
  onActivated,
  onDeactivated,
  ref,
} from 'vue';
import { ActionButton } from '../../components/ActionButton';
import { LINE_COLOR } from '../../navigation-lines';
import { LogCard } from './LogCard';
import { pushLimited } from './log';

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
        <view class="tab-card">
          <text class="hero-title">{props.label}</text>
          <text class="info-text">{`local count: ${count.value}`}</text>
          <ActionButton
            testID={`keepalive-inc-${componentName}`}
            title="Increment"
            onPress={() => (count.value += 1)}
            color={props.color}
          />
        </view>
      );
    },
    { name: componentName, props: ['label', 'color', 'onLog'] },
  );
}

const KeepAliveTabA = makeKeepAliveTab('KeepAliveTabA');
const KeepAliveTabB = makeKeepAliveTab('KeepAliveTabB');

// Switching between two component types is also what `<component :is>` resolves
export const KeepAliveDemo = defineComponent({
  name: 'KeepAliveDemo',
  setup() {
    const active = ref<'a' | 'b'>('a');
    const log = ref<string[]>([]);
    return () => (
      <view class="section-nested">
        <text class="section-label">
          {'<KeepAlive> — onActivated / onDeactivated'}
        </text>
        <text class="note-text">
          Switching tabs would normally reset each child's local counter on
          unmount — KeepAlive caches both instances instead, so each survives a
          switch away and back.
        </text>
        <view class="row-tight">
          <ActionButton
            testID="keepalive-tab-a"
            title="Tab A"
            onPress={() => (active.value = 'a')}
            color={LINE_COLOR.introspection}
          />
          <ActionButton
            testID="keepalive-tab-b"
            title="Tab B"
            onPress={() => (active.value = 'b')}
            color={LINE_COLOR.introspection}
          />
        </view>
        <KeepAlive>
          {active.value === 'a' ? (
            <KeepAliveTabA
              label="Tab A"
              color={LINE_COLOR.introspection}
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
        <LogCard
          entries={log.value}
          emptyText="switch tabs to see activation events"
        />
      </view>
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
      <text class="list-row-text">
        resolved after 1.2s inside {'<Suspense>'}
      </text>
    );
  },
});

// Built with `h(Suspense, …)` instead of JSX, so the render-function symbol is exercised too
export const SuspenseDemo = defineComponent({
  name: 'SuspenseDemo',
  setup() {
    const attempt = ref(0);
    return () => (
      <view class="section-nested">
        <text class="section-label">
          {'<Suspense> + h(Suspense, …) — the render-function symbol'}
        </text>
        <text class="note-text">
          First real test of Suspense against Fabric for this adapter — if the
          fallback never clears, that is a genuine finding, not something to
          hide.
        </text>
        <ActionButton
          testID="suspense-remount"
          title="Remount async child"
          onPress={() => (attempt.value += 1)}
          color={LINE_COLOR.introspection}
        />
        {h(
          Suspense,
          { key: attempt.value },
          {
            default: () => h(AsyncGreeting),
            fallback: () => <text class="list-row-text">loading…</text>,
          },
        )}
      </view>
    );
  },
});

const AsyncLoaded = defineComponent({
  name: 'AsyncLoaded',
  setup() {
    return () => (
      <text class="list-row-text">defineAsyncComponent resolved ✓</text>
    );
  },
});
const AsyncFailed = defineComponent({
  name: 'AsyncFailed',
  setup() {
    return () => (
      <text class="list-row-text">
        defineAsyncComponent's errorComponent (simulated failure)
      </text>
    );
  },
});
const AsyncLoadingPlaceholder = defineComponent({
  name: 'AsyncLoadingPlaceholder',
  setup() {
    return () => (
      <text class="list-row-text">
        defineAsyncComponent's loadingComponent (delay 200ms)…
      </text>
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

// Independent of `<Suspense>` on purpose, it brings its own loading and error components
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

export const AsyncComponentDemo = defineComponent({
  name: 'AsyncComponentDemo',
  setup() {
    const mode = ref<IAsyncDemoMode>(ASYNC_DEMO_MODE.Idle);
    return () => (
      <view class="section-nested">
        <text class="section-label">
          defineAsyncComponent() — its own loading/error components, independent
          of Suspense
        </text>
        <view class="row-tight">
          <ActionButton
            testID="async-load-ok"
            title="Load (succeeds)"
            onPress={() => (mode.value = ASYNC_DEMO_MODE.Ok)}
            color={LINE_COLOR.introspection}
          />
          <ActionButton
            testID="async-load-fail"
            title="Load (fails)"
            onPress={() => (mode.value = ASYNC_DEMO_MODE.Fail)}
            color={LINE_COLOR.introspection}
          />
        </view>
        {mode.value === ASYNC_DEMO_MODE.Ok && <AsyncComponentOk />}
        {mode.value === ASYNC_DEMO_MODE.Fail && <AsyncComponentFail />}
        {mode.value === ASYNC_DEMO_MODE.Idle && (
          <text class="list-row-text">pick a load button</text>
        )}
      </view>
    );
  },
});
