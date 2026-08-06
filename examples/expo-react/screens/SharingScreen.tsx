import { useCallback, useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, Text, TextInput, View } from '@symbiote-native/react';
import { isAvailableAsync, shareAsync } from '@symbiote-native/sharing';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

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
  const text = status === 'checking' ? 'CHECKING…' : status === 'yes' ? 'YES' : 'NO';
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
 * @symbiote-native/sharing canary demo: an isAvailableAsync capability row, plus one shareAsync
 * round-trip against a file URI the user types in.
 *
 * The path is an input rather than a constant because shareAsync needs a real readable local
 * file and this app ships no file-system package to produce one. A wrong path surfaces as the
 * thrown message in the last-result row, which is itself the interesting half of the demo.
 */
export function SharingScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Sharing];
  const lineColor = LINE_COLOR[lineInfo.line];

  const [isAvailable, setIsAvailable] = useState<ICapabilityStatus>('checking');
  const [fileUri, setFileUri] = useState('');
  const [lastResult, setLastResult] = useState('idle');

  useEffect(() => {
    let isMounted = true;
    isAvailableAsync().then((available) => {
      if (isMounted) {
        setIsAvailable(toCapabilityStatus(available));
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleShare = useCallback(() => {
    setLastResult('sheet open…');
    // A resolved promise only means the sheet closed — neither platform reports which app the
    // user picked, or whether they picked one at all.
    shareAsync(fileUri, { dialogTitle: 'Share from the Symbiote canary' })
      .then(() => setLastResult('sheet dismissed'))
      .catch((error: Error) => setLastResult(`share failed: ${error.message}`));
  }, [fileUri]);

  return (
    <SafeAreaView className="screen">
      <ScrollView testID="sharing-scroll" className="screen" contentContainerStyle="scroll-content">
        <View className={`line-tag line-tag-${lineInfo.line}`}>
          <Text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
        </View>
        <View className="hero-card">
          <View className="hero-badge" style={{ backgroundColor: lineColor }}>
            <Text className="hero-badge-text">{lineInfo.code}</Text>
          </View>
          <View className="hero-copy">
            <Text className="hero-title">Sharing</Text>
            <Text className="hero-body">
              @symbiote-native/sharing — hands a local file to the platform share sheet
              (UIActivityViewController on iOS, the Android chooser).
            </Text>
          </View>
        </View>

        <View testID="sharing-capability-card" className="feature-card">
          <View className="feature-card-header">
            <Text className="feature-card-title">Capabilities</Text>
          </View>
          <CapabilityRow testID="sharing-available" label="Available" status={isAvailable} />
        </View>

        <View testID="sharing-share-card" className="feature-card">
          <View className="feature-card-header">
            <Text className="feature-card-title">Share a file</Text>
          </View>
          <Text className="info-text">
            A real, readable local file URI is required — a file:// path, not a http(s) URL, which
            is not downloaded first. This app has no file-system package, so supply a path that
            already exists on the device.
          </Text>
          <TextInput
            testID="sharing-uri-input"
            value={fileUri}
            onValueChange={setFileUri}
            placeholder="file:///path/to/file.pdf"
            placeholderTextColor="#41506a"
            autoCapitalize="none"
            className="text-input"
          />
          <ActionButton
            testID="sharing-share-button"
            title="Share"
            onPress={handleShare}
            color={lineColor}
          />
          <View className="capability-row">
            <Text className="capability-label">Last result</Text>
            <Text testID="sharing-result" className="value-text">
              {lastResult}
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
