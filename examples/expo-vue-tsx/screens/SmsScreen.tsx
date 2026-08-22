import { defineComponent, onMounted, onUnmounted, ref } from 'vue';
import type { Ref } from 'vue';
import {
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from '@symbiote-native/vue';
import { isAvailableAsync, sendSMSAsync } from '@symbiote-native/sms/vue';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

function CapabilityRow(props: {
  testID: string;
  label: string;
  status: ICapabilityStatus;
}) {
  const text =
    props.status === 'checking'
      ? 'CHECKING…'
      : props.status === 'yes'
        ? 'YES'
        : 'NO';
  return (
    <View testID={props.testID} class="sms-row">
      <Text class="sms-row-label">{props.label}</Text>
      <View class={`sms-status-badge sms-status-badge-${props.status}`}>
        <Text class="sms-status-text">{text}</Text>
      </View>
    </View>
  );
}

function toRecipientList(raw: string): string[] {
  return raw
    .split(',')
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0);
}

/**
 * SMS demo: @symbiote-native/sms — opens the system composer prefilled with recipients and a
 * message. Nothing is sent by the app itself; the user presses send inside the composer, which is
 * why neither platform asks for a permission.
 */
export const SmsScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Sms];
    const lineColor = LINE_COLOR[lineInfo.line];

    const isAvailable: Ref<ICapabilityStatus> = ref('checking');
    const recipients = ref('');
    const message = ref('Sent from the Symbiote canary');
    const lastResult = ref('idle');

    let isMounted = true;
    onUnmounted(() => {
      isMounted = false;
    });

    onMounted(() => {
      isAvailableAsync().then(available => {
        if (!isMounted) return;
        isAvailable.value = toCapabilityStatus(available);
      });
    });

    function handleSend() {
      lastResult.value = 'opening composer…';
      sendSMSAsync(toRecipientList(recipients.value), message.value)
        .then(response => {
          if (!isMounted) return;
          lastResult.value = `result: ${response.result}`;
        })
        .catch((error: Error) => {
          if (!isMounted) return;
          lastResult.value = `send failed: ${error.message}`;
        });
    }

    return () => (
      <SafeAreaView class="screen">
        <ScrollView
          testID="sms-scroll"
          class="screen"
          contentContainerStyle="scroll-content"
        >
          <View class={`line-tag line-tag-${lineInfo.line}`}>
            <Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
          </View>
          <View class="hero-card">
            <View class="hero-badge" style={{ backgroundColor: lineColor }}>
              <Text class="hero-badge-text">{lineInfo.code}</Text>
            </View>
            <View class="hero-copy">
              <Text class="hero-title">SMS</Text>
              <Text class="hero-body">
                @symbiote-native/sms — opens the system SMS composer prefilled
                with recipients and a message. The user does the sending, so no
                permission is requested.
              </Text>
            </View>
          </View>

          <View testID="sms-capability-card" class="sms-card">
            <Text class="sms-card-title">Capabilities</Text>
            <CapabilityRow
              testID="sms-available"
              label="Available"
              status={isAvailable.value}
            />
            <Text class="sms-note">
              NO on the iOS simulator, which ships no Messages app, and on
              Android devices without telephony hardware. Send needs a real
              device.
            </Text>
          </View>

          <View testID="sms-compose-card" class="sms-card">
            <Text class="sms-card-title">Compose</Text>
            <TextInput
              testID="sms-recipients-input"
              value={recipients.value}
              onValueChange={(text: string) => {
                recipients.value = text;
              }}
              placeholder="Recipients, comma-separated"
              placeholderTextColor="#41506a"
              class="text-input"
            />
            <TextInput
              testID="sms-message-input"
              value={message.value}
              onValueChange={(text: string) => {
                message.value = text;
              }}
              placeholder="Message"
              placeholderTextColor="#41506a"
              class="text-input"
            />
            <ActionButton
              testID="sms-send-button"
              title="Open composer"
              onPress={handleSend}
              color={lineColor}
            />
          </View>

          <View testID="sms-result-card" class="sms-card">
            <Text class="sms-card-title">Last result</Text>
            <View class="sms-row">
              <Text class="sms-row-label">Outcome</Text>
              <Text testID="sms-result" class="sms-value-text">
                {lastResult.value}
              </Text>
            </View>
            <Text class="sms-note">
              Android always reports unknown — reading the real outcome would
              need READ_SMS, which Google restricts to default-SMS-app
              publishers. Treat it as "the composer closed". iOS distinguishes
              sent from cancelled.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  },
  { name: 'SmsScreen' },
);
