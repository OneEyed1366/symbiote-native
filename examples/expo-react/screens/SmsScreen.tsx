import { useCallback, useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, Text, TextInput, View } from '@symbiote-native/react';
import { isAvailableAsync, sendSMSAsync } from '@symbiote-native/sms';
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
 * @symbiote-native/sms canary demo: an isAvailableAsync capability row, recipient + message
 * inputs, and one sendSMSAsync round-trip whose 'sent' | 'cancelled' | 'unknown' result is
 * rendered back.
 *
 * Recipients are split on commas so the string | string[] overload of sendSMSAsync is exercised
 * from a single input.
 */
export function SmsScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Sms];
  const lineColor = LINE_COLOR[lineInfo.line];

  const [isAvailable, setIsAvailable] = useState<ICapabilityStatus>('checking');
  const [recipients, setRecipients] = useState('');
  const [message, setMessage] = useState('Sent from the Symbiote canary');
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

  const handleSend = useCallback(() => {
    const addresses = recipients
      .split(',')
      .map((address) => address.trim())
      .filter((address) => address.length > 0);
    if (addresses.length === 0) {
      setLastResult('no recipients');
      return;
    }
    setLastResult('composer open…');
    sendSMSAsync(addresses, message)
      .then((response) => setLastResult(`result: ${response.result}`))
      .catch((error: Error) => setLastResult(`send failed: ${error.message}`));
  }, [recipients, message]);

  return (
    <SafeAreaView className="screen">
      <ScrollView testID="sms-scroll" className="screen" contentContainerStyle="scroll-content">
        <View className={`line-tag line-tag-${lineInfo.line}`}>
          <Text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
        </View>
        <View className="hero-card">
          <View className="hero-badge" style={{ backgroundColor: lineColor }}>
            <Text className="hero-badge-text">{lineInfo.code}</Text>
          </View>
          <View className="hero-copy">
            <Text className="hero-title">SMS</Text>
            <Text className="hero-body">
              @symbiote-native/sms — opens the system SMS composer prefilled with recipients and a
              message. It never sends anything by itself; the user does.
            </Text>
          </View>
        </View>

        <View testID="sms-capability-card" className="feature-card">
          <View className="feature-card-header">
            <Text className="feature-card-title">Capabilities</Text>
          </View>
          <CapabilityRow testID="sms-available" label="Available" status={isAvailable} />
          <Text className="info-text">
            NO is expected on the iOS simulator, which has no Messages app, and on Android devices
            without telephony hardware. Only a real phone reports YES.
          </Text>
        </View>

        <View testID="sms-compose-card" className="feature-card">
          <View className="feature-card-header">
            <Text className="feature-card-title">Compose</Text>
          </View>
          <TextInput
            testID="sms-recipients-input"
            value={recipients}
            onValueChange={setRecipients}
            placeholder="0123456789, 9876543210"
            placeholderTextColor="#41506a"
            autoCapitalize="none"
            className="text-input"
          />
          <TextInput
            testID="sms-message-input"
            value={message}
            onValueChange={setMessage}
            placeholder="Message"
            placeholderTextColor="#41506a"
            className="text-input"
          />
          <ActionButton
            testID="sms-send-button"
            title="Open composer"
            onPress={handleSend}
            color={lineColor}
          />
          <View className="capability-row">
            <Text className="capability-label">Last result</Text>
            <Text testID="sms-result" className="value-text">
              {lastResult}
            </Text>
          </View>
          <Text className="info-text">
            Android always reports unknown — reading the real outcome needs READ_SMS, which Google
            restricts to default-SMS-app publishers. Treat it as the composer closed, not as a
            failure. iOS reports sent or cancelled.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
