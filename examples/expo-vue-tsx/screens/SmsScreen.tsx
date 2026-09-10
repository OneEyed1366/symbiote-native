import { defineComponent, onMounted, onUnmounted, ref } from 'vue';
import type { Ref } from 'vue';
import {} from '@symbiote-native/vue';
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
    <view testID={props.testID} class="sms-row">
      <text class="sms-row-label">{props.label}</text>
      <view class={`sms-status-badge sms-status-badge-${props.status}`}>
        <text class="sms-status-text">{text}</text>
      </view>
    </view>
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
      <safe-area-view class="screen">
        <scroll-view
          testID="sms-scroll"
          class="screen"
          contentContainerStyle="scroll-content"
        >
          <view class={`line-tag line-tag-${lineInfo.line}`}>
            <text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
          </view>
          <view class="hero-card">
            <view class="hero-badge" style={{ backgroundColor: lineColor }}>
              <text class="hero-badge-text">{lineInfo.code}</text>
            </view>
            <view class="hero-copy">
              <text class="hero-title">SMS</text>
              <text class="hero-body">
                @symbiote-native/sms — opens the system SMS composer prefilled
                with recipients and a message. The user does the sending, so no
                permission is requested.
              </text>
            </view>
          </view>

          <view testID="sms-capability-card" class="sms-card">
            <text class="sms-card-title">Capabilities</text>
            <CapabilityRow
              testID="sms-available"
              label="Available"
              status={isAvailable.value}
            />
            <text class="sms-note">
              NO on the iOS simulator, which ships no Messages app, and on
              Android devices without telephony hardware. Send needs a real
              device.
            </text>
          </view>

          <view testID="sms-compose-card" class="sms-card">
            <text class="sms-card-title">Compose</text>
            <text-input
              testID="sms-recipients-input"
              value={recipients.value}
              onValueChange={(text: string) => {
                recipients.value = text;
              }}
              placeholder="Recipients, comma-separated"
              placeholderTextColor="#41506a"
              class="text-input"
            />
            <text-input
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
          </view>

          <view testID="sms-result-card" class="sms-card">
            <text class="sms-card-title">Last result</text>
            <view class="sms-row">
              <text class="sms-row-label">Outcome</text>
              <text testID="sms-result" class="sms-value-text">
                {lastResult.value}
              </text>
            </view>
            <text class="sms-note">
              Android always reports unknown — reading the real outcome would
              need READ_SMS, which Google restricts to default-SMS-app
              publishers. Treat it as "the composer closed". iOS distinguishes
              sent from cancelled.
            </text>
          </view>
        </scroll-view>
      </safe-area-view>
    );
  },
  { name: 'SmsScreen' },
);
