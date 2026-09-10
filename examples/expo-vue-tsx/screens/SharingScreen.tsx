import { defineComponent, onMounted, onUnmounted, ref } from 'vue';
import type { Ref } from 'vue';
import { ScrollView } from '@symbiote-native/vue';
import { isAvailableAsync, shareAsync } from '@symbiote-native/sharing/vue';
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
    <view testID={props.testID} class="sharing-row">
      <text class="sharing-row-label">{props.label}</text>
      <view class={`sharing-status-badge sharing-status-badge-${props.status}`}>
        <text class="sharing-status-text">{text}</text>
      </view>
    </view>
  );
}

/**
 * Sharing demo: @symbiote-native/sharing — the platform share sheet over a local file. The path
 * is typed in by hand because this canary ships no file-system package to produce one, and the
 * native call needs a file it can actually read.
 */
export const SharingScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Sharing];
    const lineColor = LINE_COLOR[lineInfo.line];

    const isAvailable: Ref<ICapabilityStatus> = ref('checking');
    const fileUri = ref('');
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

    function handleShare() {
      lastResult.value = 'sharing…';
      shareAsync(fileUri.value, {
        dialogTitle: 'Share from the Symbiote canary',
      })
        .then(() => {
          lastResult.value = 'share sheet dismissed';
        })
        .catch((error: Error) => {
          lastResult.value = `share failed: ${error.message}`;
        });
    }

    return () => (
      <safe-area-view class="screen">
        <ScrollView
          testID="sharing-scroll"
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
              <text class="hero-title">Sharing</text>
              <text class="hero-body">
                @symbiote-native/sharing — opens the platform share sheet for a
                local file. Type a file URI below, then hand it to the sheet.
              </text>
            </view>
          </view>

          <view testID="sharing-capability-card" class="sharing-card">
            <text class="sharing-card-title">Capabilities</text>
            <CapabilityRow
              testID="sharing-available"
              label="Available"
              status={isAvailable.value}
            />
            <text class="sharing-note">
              Reports on the native module, not on any device capability — it is
              true on both platforms once the module is linked.
            </text>
          </view>

          <view testID="sharing-share-card" class="sharing-card">
            <text class="sharing-card-title">Share a file</text>
            <text class="sharing-note">
              A real local file URI is required — the share sheet reads the file
              itself, so a path that does not exist raises an error rather than
              opening. This app ships no file-system package to produce one, so
              supply a path from the device.
            </text>
            <text-input
              testID="sharing-uri-input"
              value={fileUri.value}
              onValueChange={(text: string) => {
                fileUri.value = text;
              }}
              placeholder="file:///path/to/a/readable/file"
              placeholderTextColor="#41506a"
              class="text-input"
            />
            <ActionButton
              testID="sharing-share-button"
              title="Share"
              onPress={handleShare}
              color={lineColor}
            />
          </view>

          <view testID="sharing-result-card" class="sharing-card">
            <text class="sharing-card-title">Last result</text>
            <view class="sharing-row">
              <text class="sharing-row-label">Outcome</text>
              <text testID="sharing-result" class="sharing-value-text">
                {lastResult.value}
              </text>
            </view>
            <text class="sharing-note">
              The sheet does not report which app the user picked, or whether
              they cancelled — it resolves once dismissed either way.
            </text>
          </view>
        </ScrollView>
      </safe-area-view>
    );
  },
  { name: 'SharingScreen' },
);
