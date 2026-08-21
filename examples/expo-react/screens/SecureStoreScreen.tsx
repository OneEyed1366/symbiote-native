import { useCallback, useEffect, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from '@symbiote-native/react';
import {
  canUseBiometricAuthentication,
  deleteItemAsync,
  getItemAsync,
  isAvailableAsync,
  setItemAsync,
} from '@symbiote-native/secure-store';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const DEMO_KEY = 'canary.secure-store.demo';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

function CapabilityRow({
  testID,
  label,
  status,
}: {
  testID: string;
  label: string;
  status: ICapabilityStatus;
}) {
  const text =
    status === 'checking' ? 'CHECKING…' : status === 'yes' ? 'YES' : 'NO';
  return (
    <View testID={testID} className="capability-row">
      <Text className="capability-label">{label}</Text>
      <View className={`status-badge status-badge-${status}`}>
        <Text className="status-badge-text">{text}</Text>
      </View>
    </View>
  );
}

/**
 * @symbiote-native/secure-store canary demo: a capability card (isAvailableAsync,
 * canUseBiometricAuthentication), a write/read/delete round-trip against one demo key, and the
 * same round-trip with `requireAuthentication` so the device's own biometric prompt is exercised.
 *
 * Kill and relaunch the app to prove the value really survives outside the JS heap. The
 * authenticated variant only prompts on a real device — simulators and emulators skip it.
 */
export function SecureStoreScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.SecureStore];
  const lineColor = LINE_COLOR[lineInfo.line];

  const [isAvailable, setIsAvailable] = useState<ICapabilityStatus>('checking');
  const [canUseBiometrics, setCanUseBiometrics] =
    useState<ICapabilityStatus>('checking');
  const [inputText, setInputText] = useState('');
  const [storedValue, setStoredValue] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState('idle');

  useEffect(() => {
    let isMounted = true;
    isAvailableAsync().then(available => {
      if (!isMounted) {
        return;
      }
      setIsAvailable(toCapabilityStatus(available));
      // canUseBiometricAuthentication throws when the native module is missing entirely, so it
      // only runs once availability has come back positive.
      setCanUseBiometrics(
        available ? toCapabilityStatus(canUseBiometricAuthentication()) : 'no',
      );
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const readBack = useCallback(async (label: string) => {
    const value = await getItemAsync(DEMO_KEY);
    setStoredValue(value);
    setLastResult(value === null ? `${label}: no entry` : `${label}: ok`);
  }, []);

  const handleRead = useCallback(() => {
    readBack('read').catch((error: Error) =>
      setLastResult(`read failed: ${error.message}`),
    );
  }, [readBack]);

  const handleSave = useCallback(() => {
    setItemAsync(DEMO_KEY, inputText)
      .then(() => readBack('saved'))
      .catch((error: Error) => setLastResult(`save failed: ${error.message}`));
  }, [inputText, readBack]);

  // Android prompts on every operation, iOS only when reading or updating an entry that already
  // exists — so the write below may pass silently and the read after it raise the prompt.
  const handleSaveAuthenticated = useCallback(() => {
    setItemAsync(DEMO_KEY, inputText, {
      requireAuthentication: true,
      authenticationPrompt: 'Unlock to store the demo value',
    })
      .then(() => readBack('saved (authenticated)'))
      .catch((error: Error) =>
        setLastResult(`authenticated save failed: ${error.message}`),
      );
  }, [inputText, readBack]);

  const handleDelete = useCallback(() => {
    deleteItemAsync(DEMO_KEY)
      .then(() => {
        setStoredValue(null);
        setLastResult('deleted');
      })
      .catch((error: Error) =>
        setLastResult(`delete failed: ${error.message}`),
      );
  }, []);

  return (
    <SafeAreaView className="screen">
      <ScrollView
        testID="secure-store-scroll"
        className="screen"
        contentContainerStyle="scroll-content"
      >
        <View className={`line-tag line-tag-${lineInfo.line}`}>
          <Text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
        </View>
        <View className="hero-card">
          <View className="hero-badge" style={{ backgroundColor: lineColor }}>
            <Text className="hero-badge-text">{lineInfo.code}</Text>
          </View>
          <View className="hero-copy">
            <Text className="hero-title">Secure Store</Text>
            <Text className="hero-body">
              @symbiote-native/secure-store — encrypted key/value storage in the
              iOS Keychain and the Android Keystore. Save a value, kill the app,
              relaunch, and read it back.
            </Text>
          </View>
        </View>

        <View testID="secure-store-capability-card" className="feature-card">
          <View className="feature-card-header">
            <Text className="feature-card-title">Capabilities</Text>
          </View>
          <CapabilityRow
            testID="secure-store-available"
            label="Available"
            status={isAvailable}
          />
          <CapabilityRow
            testID="secure-store-biometrics"
            label="Biometrics usable"
            status={canUseBiometrics}
          />
        </View>

        <View testID="secure-store-value-card" className="feature-card">
          <View className="feature-card-header">
            <Text className="feature-card-title">Stored value</Text>
          </View>
          <View className="capability-row">
            <Text className="capability-label">{DEMO_KEY}</Text>
            <Text testID="secure-store-value" className="value-text">
              {storedValue === null ? '(no entry)' : storedValue}
            </Text>
          </View>
          <View className="capability-row">
            <Text className="capability-label">Last result</Text>
            <Text testID="secure-store-result" className="value-text">
              {lastResult}
            </Text>
          </View>
        </View>

        <View testID="secure-store-write-card" className="feature-card">
          <View className="feature-card-header">
            <Text className="feature-card-title">Write, read, delete</Text>
          </View>
          <TextInput
            testID="secure-store-input"
            value={inputText}
            onValueChange={setInputText}
            placeholder="Value to store"
            placeholderTextColor="#41506a"
            className="text-input"
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
}
