<script lang="ts">
  // State persistence demo: "Serialize" reads the LIVE root Stack state via useNavigationState and
  // JSON.stringifies serializeNavigatorState's output for display; "Restore" parses that same JSON
  // back with deserializeNavigatorState (which validates the shape, no blind cast) and hands it to
  // navigation.reset() — the round trip real @react-navigation persistence (initialState/
  // onStateChange) is built on. Restoring genuinely navigates: the stack becomes exactly the
  // serialized snapshot, which may move you away from this very screen. Svelte twin of
  // examples/vue-sfc/screens/StatePersistenceScreen.vue.
  import {
    deserializeNavigatorState,
    serializeNavigatorState,
  } from '@symbiote-native/navigation';
  import type { INavigatorState } from '@symbiote-native/navigation';
  import {
    useNavigation,
    useNavigationState,
  } from '@symbiote-native/navigation/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  const JSON_INDENT = 2;

  const navigation = useNavigation();
  // NOT named `state`: a local called `state` makes svelte2tsx read every `$state(...)` rune below
  // as a store subscription on it (`$state`), which fails to type-check with a store error that
  // never mentions the real cause.
  const navigatorState = useNavigationState<INavigatorState>(
    currentState => currentState,
  );
  let snapshot = $state<string | undefined>(undefined);
  let restoreError = $state<string | undefined>(undefined);

  function onSerialize(): void {
    restoreError = undefined;
    snapshot = JSON.stringify(
      serializeNavigatorState(navigatorState.current),
      null,
      JSON_INDENT,
    );
  }

  function onRestore(): void {
    if (snapshot === undefined) return;
    const handle = navigation.current;
    if (!('reset' in handle)) {
      restoreError =
        'this screen is not mounted under a Stack — reset() is unavailable';
      return;
    }
    try {
      const parsed: unknown = JSON.parse(snapshot);
      handle.reset(deserializeNavigatorState(parsed));
      restoreError = undefined;
    } catch (error) {
      restoreError = error instanceof Error ? error.message : 'restore failed';
    }
  }

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.StatePersistence];
</script>

<safe-area-view class="screen">
  <view class="section">
    <view class={`line-tag line-tag-${lineInfo.line}`}>
      <text class="line-tag-text">
        {`${lineInfo.code} · ${lineInfo.label}`}
      </text>
    </view>
    <view class="hero-card">
      <view class="hero-badge" style={{ backgroundColor: LINE_COLOR.routing }}>
        <text class="hero-badge-text">SP</text>
      </view>
      <view class="hero-copy">
        <text class="hero-title">State persistence</text>
        <text class="hero-body">
          The Stack's own state serialized out and deserialized back in —
          restoring exactly where you left off.
        </text>
      </view>
    </view>
    <text class="info-text">
      {`current stack depth: ${navigatorState.current.routes.length}`}
    </text>
    <ActionButton
      testID="persist-serialize"
      title="Serialize current stack"
      onPress={onSerialize}
      color={LINE_COLOR.routing}
    />
    <ActionButton
      testID="persist-restore"
      title="Restore serialized snapshot"
      onPress={onRestore}
      color={LINE_COLOR.routing}
    />
    {#if restoreError !== undefined}
      <text class="info-text">{`error: ${restoreError}`}</text>
    {/if}
    <view class="box-list160">
      <text testID="persist-snapshot" class="list-row-text">
        {snapshot ?? 'tap Serialize to capture the current route stack as JSON'}
      </text>
    </view>
  </view>
</safe-area-view>
