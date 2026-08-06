import { defineComponent, onMounted, onUnmounted, ref } from 'vue';
import type { Ref } from 'vue';
import { SafeAreaView, ScrollView, Text, TextInput, View } from '@symbiote-native/vue';
import {
  canUseBiometricAuthentication,
  deleteItemAsync,
  getItemAsync,
  isAvailableAsync,
  setItemAsync,
} from '@symbiote-native/secure-store/vue';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const DEMO_KEY = 'canary.secure-store.demo';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

function CapabilityRow(props: { testID: string; label: string; status: ICapabilityStatus }) {
  const text =
    props.status === 'checking' ? 'CHECKING…' : props.status === 'yes' ? 'YES' : 'NO';
  return (
    <View testID={props.testID} class="secure-store-row">
      <Text class="secure-store-row-label">{props.label}</Text>
      <View class={`secure-store-status-badge secure-store-status-badge-${props.status}`}>
        <Text class="secure-store-status-text">{text}</Text>
      </View>
    </View>
  );
}

/**
 * Secure Store demo: @symbiote-native/secure-store — encrypted key/value storage in the iOS
 * Keychain and the Android Keystore. Kill and relaunch the app to prove the value survives
 * outside the JS heap. The authenticated variant only prompts on a real device.
 */
export const SecureStoreScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.SecureStore];
    const lineColor = LINE_COLOR[lineInfo.line];

    const isAvailable: Ref<ICapabilityStatus> = ref('checking');
    const canUseBiometrics: Ref<ICapabilityStatus> = ref('checking');
    const inputText = ref('');
    const storedValue: Ref<string | null> = ref(null);
    const lastResult = ref('idle');

    let isMounted = true;
    onUnmounted(() => {
      isMounted = false;
    });

    onMounted(() => {
      isAvailableAsync().then(available => {
        if (!isMounted) return;
        isAvailable.value = toCapabilityStatus(available);
        // canUseBiometricAuthentication throws when the native module is missing entirely, so it
        // only runs once availability has come back positive.
        canUseBiometrics.value = available
          ? toCapabilityStatus(canUseBiometricAuthentication())
          : 'no';
      });
    });

    async function readBack(label: string) {
      const value = await getItemAsync(DEMO_KEY);
      storedValue.value = value;
      lastResult.value = value === null ? `${label}: no entry` : `${label}: ok`;
    }

    function handleRead() {
      readBack('read').catch((error: Error) => {
        lastResult.value = `read failed: ${error.message}`;
      });
    }

    function handleSave() {
      setItemAsync(DEMO_KEY, inputText.value)
        .then(() => readBack('saved'))
        .catch((error: Error) => {
          lastResult.value = `save failed: ${error.message}`;
        });
    }

    // Android prompts on every operation, iOS only when reading or updating an entry that already
    // exists — so the write below may pass silently and the read after it raise the prompt.
    function handleSaveAuthenticated() {
      setItemAsync(DEMO_KEY, inputText.value, {
        requireAuthentication: true,
        authenticationPrompt: 'Unlock to store the demo value',
      })
        .then(() => readBack('saved (authenticated)'))
        .catch((error: Error) => {
          lastResult.value = `authenticated save failed: ${error.message}`;
        });
    }

    function handleDelete() {
      deleteItemAsync(DEMO_KEY)
        .then(() => {
          storedValue.value = null;
          lastResult.value = 'deleted';
        })
        .catch((error: Error) => {
          lastResult.value = `delete failed: ${error.message}`;
        });
    }

    return () => (
      <SafeAreaView class="screen">
        <ScrollView testID="secure-store-scroll" class="screen" contentContainerStyle="scroll-content">
          <View class={`line-tag line-tag-${lineInfo.line}`}>
            <Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
          </View>
          <View class="hero-card">
            <View class="hero-badge" style={{ backgroundColor: lineColor }}>
              <Text class="hero-badge-text">{lineInfo.code}</Text>
            </View>
            <View class="hero-copy">
              <Text class="hero-title">Secure Store</Text>
              <Text class="hero-body">
                @symbiote-native/secure-store — encrypted key/value storage in the iOS Keychain and
                the Android Keystore. Save a value, kill the app, relaunch, and read it back.
              </Text>
            </View>
          </View>

          <View testID="secure-store-capability-card" class="secure-store-card">
            <Text class="secure-store-card-title">Capabilities</Text>
            <CapabilityRow
              testID="secure-store-available"
              label="Available"
              status={isAvailable.value}
            />
            <CapabilityRow
              testID="secure-store-biometrics"
              label="Biometrics usable"
              status={canUseBiometrics.value}
            />
          </View>

          <View testID="secure-store-value-card" class="secure-store-card">
            <Text class="secure-store-card-title">Stored value</Text>
            <View class="secure-store-row">
              <Text class="secure-store-row-label">{DEMO_KEY}</Text>
              <Text testID="secure-store-value" class="secure-store-value-text">
                {storedValue.value === null ? '(no entry)' : storedValue.value}
              </Text>
            </View>
            <View class="secure-store-row">
              <Text class="secure-store-row-label">Last result</Text>
              <Text testID="secure-store-result" class="secure-store-value-text">
                {lastResult.value}
              </Text>
            </View>
          </View>

          <View testID="secure-store-write-card" class="secure-store-card">
            <Text class="secure-store-card-title">Write, read, delete</Text>
            <TextInput
              testID="secure-store-input"
              value={inputText.value}
              onValueChange={(text: string) => {
                inputText.value = text;
              }}
              placeholder="Value to store"
              placeholderTextColor="#41506a"
              class="text-input"
            />
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
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  },
  { name: 'SecureStoreScreen' },
);
