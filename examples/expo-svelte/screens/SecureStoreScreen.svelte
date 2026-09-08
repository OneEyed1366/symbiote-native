<script lang="ts">
  // @symbiote-native/secure-store tour stop — a capabilities card (isAvailableAsync,
  // canUseBiometricAuthentication), a stored-value card, and a write/read/delete card driving one
  // demo key. Kill and relaunch the app to prove the value survives outside the JS heap. Svelte
  // twin of examples/expo-vue-sfc/screens/SecureStoreScreen.vue.
  import { ScrollView } from '@symbiote-native/svelte';
  import {
    canUseBiometricAuthentication,
    deleteItemAsync,
    getItemAsync,
    isAvailableAsync,
    setItemAsync,
  } from '@symbiote-native/secure-store/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  const DEMO_KEY = 'canary.secure-store.demo';
  const PLACEHOLDER_COLOR = '#41506a';

  type ICapabilityStatus = 'checking' | 'yes' | 'no';

  const CAPABILITY_BADGE_TEXT: Record<ICapabilityStatus, string> = {
    checking: 'CHECKING…',
    yes: 'YES',
    no: 'NO',
  };

  function toCapabilityStatus(value: boolean): ICapabilityStatus {
    return value ? 'yes' : 'no';
  }

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.SecureStore];
  const lineColor = LINE_COLOR[lineInfo.line];

  let isAvailable = $state<ICapabilityStatus>('checking');
  let canUseBiometrics = $state<ICapabilityStatus>('checking');
  let inputText = $state('');
  let storedValue = $state<string | null>(null);
  let lastResult = $state('idle');

  $effect(() => {
    void isAvailableAsync().then(available => {
      isAvailable = toCapabilityStatus(available);
      // canUseBiometricAuthentication throws when the native module is missing entirely, so it
      // only runs once availability has come back positive.
      canUseBiometrics = available
        ? toCapabilityStatus(canUseBiometricAuthentication())
        : 'no';
    });
  });

  async function readBack(label: string): Promise<void> {
    const value = await getItemAsync(DEMO_KEY);
    storedValue = value;
    lastResult = value === null ? `${label}: no entry` : `${label}: ok`;
  }

  function handleRead(): void {
    void readBack('read').catch((error: Error) => {
      lastResult = `read failed: ${error.message}`;
    });
  }

  function handleSave(): void {
    void setItemAsync(DEMO_KEY, inputText)
      .then(() => readBack('saved'))
      .catch((error: Error) => {
        lastResult = `save failed: ${error.message}`;
      });
  }

  // Android prompts on every operation, iOS only when reading or updating an entry that already
  // exists — so the write below may pass silently and the read after it raise the prompt.
  function handleSaveAuthenticated(): void {
    void setItemAsync(DEMO_KEY, inputText, {
      requireAuthentication: true,
      authenticationPrompt: 'Unlock to store the demo value',
    })
      .then(() => readBack('saved (authenticated)'))
      .catch((error: Error) => {
        lastResult = `authenticated save failed: ${error.message}`;
      });
  }

  function handleDelete(): void {
    void deleteItemAsync(DEMO_KEY)
      .then(() => {
        storedValue = null;
        lastResult = 'deleted';
      })
      .catch((error: Error) => {
        lastResult = `delete failed: ${error.message}`;
      });
  }
</script>

<safe-area-view class="screen">
  <ScrollView
    testID="secure-store-scroll"
    class="screen"
    contentContainerStyle="scroll-content"
  >
    <view class={`line-tag line-tag-${lineInfo.line}`}>
      <text class="line-tag-text">
        {`${lineInfo.code} · ${lineInfo.label}`}
      </text>
    </view>
    <view class="hero-card">
      <view class="hero-badge" style={{ backgroundColor: lineColor }}>
        <text class="hero-badge-text">{lineInfo.code}</text>
      </view>
      <view class="hero-copy">
        <text class="hero-title">Secure Store</text>
        <text class="hero-body">
          @symbiote-native/secure-store — encrypted key/value storage in the iOS
          Keychain and the Android Keystore. Save a value, kill the app,
          relaunch, and read it back.
        </text>
      </view>
    </view>
    <view testID="secure-store-capability-card" class="secure-store-card">
      <text class="secure-store-card-title">Capabilities</text>
      <view testID="secure-store-available" class="secure-store-row">
        <text class="secure-store-row-label">Available</text>
        <view
          class={`secure-store-status-badge secure-store-status-badge-${isAvailable}`}
        >
          <text class="secure-store-status-text">
            {CAPABILITY_BADGE_TEXT[isAvailable]}
          </text>
        </view>
      </view>
      <view testID="secure-store-biometrics" class="secure-store-row">
        <text class="secure-store-row-label">Biometrics usable</text>
        <view
          class={`secure-store-status-badge secure-store-status-badge-${canUseBiometrics}`}
        >
          <text class="secure-store-status-text">
            {CAPABILITY_BADGE_TEXT[canUseBiometrics]}
          </text>
        </view>
      </view>
    </view>
    <view testID="secure-store-value-card" class="secure-store-card">
      <text class="secure-store-card-title">Stored value</text>
      <view class="secure-store-row">
        <text class="secure-store-row-label">{DEMO_KEY}</text>
        <text testID="secure-store-value" class="secure-store-value-text">
          {storedValue === null ? '(no entry)' : storedValue}
        </text>
      </view>
      <view class="secure-store-row">
        <text class="secure-store-row-label">Last result</text>
        <text testID="secure-store-result" class="secure-store-value-text">
          {lastResult}
        </text>
      </view>
    </view>
    <view testID="secure-store-write-card" class="secure-store-card">
      <text class="secure-store-card-title">Write, read, delete</text>
      <text-input
        testID="secure-store-input"
        value={inputText}
        onValueChange={next => (inputText = next)}
        placeholder="Value to store"
        placeholderTextColor={PLACEHOLDER_COLOR}
        class="text-input"
      ></text-input>
      <ActionButton
        testID="secure-store-save-button"
        title="Save"
        onPress={handleSave}
        color={lineColor}
      />
      <ActionButton
        testID="secure-store-save-auth-button"
        title="Save behind biometrics"
        onPress={handleSaveAuthenticated}
        color={lineColor}
      />
      <ActionButton
        testID="secure-store-read-button"
        title="Read"
        onPress={handleRead}
        color={lineColor}
      />
      <ActionButton
        testID="secure-store-delete-button"
        title="Delete"
        onPress={handleDelete}
        color={lineColor}
      />
    </view>
  </ScrollView>
</safe-area-view>
