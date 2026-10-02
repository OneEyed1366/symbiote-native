import { For, Show, createSignal } from 'solid-js';
import { File, Paths } from '@symbiote-native/file-system/solid';
import {
  clearSharedPayloads,
  getResolvedSharedPayloadsAsync,
  getSharedPayloads,
  shareAsync,
} from '@symbiote-native/sharing';
import type { IResolvedSharePayload } from '@symbiote-native/sharing';
import { useIncomingShare } from '@symbiote-native/sharing/solid';
import { ActionButton } from '../components/ActionButton';
import { CallConsole } from '../components/CallConsole';
import { Explorer, Scenario } from '../components/Scenario';
import { Field, ResultRow, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.Sharing);

function optionalNumber(text: string): number | undefined {
  const value = Number(text);
  return text.trim() === '' || Number.isNaN(value) ? undefined : value;
}

function optional(text: string): string | undefined {
  return text.trim() === '' ? undefined : text.trim();
}

export function ShareCard() {
  const [fileUri, setFileUri] = createSignal('');
  const [mimeType, setMimeType] = createSignal('');
  const [uti, setUti] = createSignal('');
  const [dialogTitle, setDialogTitle] = createSignal('Share from the Symbiote canary');
  const [anchorX, setAnchorX] = createSignal('');
  const [anchorY, setAnchorY] = createSignal('');
  const [anchorWidth, setAnchorWidth] = createSignal('');
  const [anchorHeight, setAnchorHeight] = createSignal('');
  const [lastResult, setLastResult] = createSignal('idle');

  const createSample = () => {
    const sample = new File(Paths.cache, 'symbiote-share-sample.txt');
    try {
      if (!sample.exists) {
        sample.create();
      }
      sample.write('Shared from the Symbiote canary');
      setFileUri(sample.uri);
      setMimeType('text/plain');
      setLastResult('sample file created');
    } catch (error) {
      setLastResult(`sample failed at ${sample.uri}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const share = () => {
    setLastResult('sheet open…');
    shareAsync(fileUri(), {
      mimeType: optional(mimeType()),
      UTI: optional(uti()),
      dialogTitle: optional(dialogTitle()),
      anchor: {
        x: optionalNumber(anchorX()),
        y: optionalNumber(anchorY()),
        width: optionalNumber(anchorWidth()),
        height: optionalNumber(anchorHeight()),
      },
    })
      .then(() => setLastResult('sheet dismissed'))
      .catch((error: Error) => setLastResult(`share failed: ${error.message}`));
  };

  return (
    <Scenario
      testID="sharing-share-card"
      title="Let users send a file to another app"
      why="Export a report, a photo or a backup through the system share sheet, so the user picks Messages, Mail, AirDrop or any installed app. The file must be a local file:// path."
      steps={['Press Create a sample file', 'Press Share', 'Pick a target in the share sheet, or dismiss it']}
      expect="The share sheet opens with the sample file. Last result says sheet dismissed after you pick a target or cancel."
    >
      <ActionButton testID="sharing-sample-button" title="Create a sample file" onPress={createSample} color={color} />
      <Field testID="sharing-uri-input" label="file uri" value={fileUri()} onChange={setFileUri} placeholder="file:///path/to/file.pdf" />
      <ActionButton testID="sharing-share-button" title="Share" onPress={share} color={color} />
      <ResultRow testID="sharing-result" label="Last result" value={lastResult()} />
      <Explorer testID="sharing-options-explorer" color={color}>
        <Field testID="sharing-mime-input" label="mimeType (Android)" value={mimeType()} onChange={setMimeType} />
        <Field testID="sharing-uti-input" label="UTI (iOS)" value={uti()} onChange={setUti} />
        <Field testID="sharing-title-input" label="dialogTitle" value={dialogTitle()} onChange={setDialogTitle} />
        <Field testID="sharing-anchor-x-input" label="anchor.x (iPad popover)" value={anchorX()} onChange={setAnchorX} />
        <Field testID="sharing-anchor-y-input" label="anchor.y" value={anchorY()} onChange={setAnchorY} />
        <Field testID="sharing-anchor-width-input" label="anchor.width" value={anchorWidth()} onChange={setAnchorWidth} />
        <Field testID="sharing-anchor-height-input" label="anchor.height" value={anchorHeight()} onChange={setAnchorHeight} />
      </Explorer>
    </Scenario>
  );
}

function PayloadRows(props: { payload: IResolvedSharePayload; index: number }) {
  const rows = (): [string, string][] => [
    ['shareType', props.payload.shareType],
    ['value', props.payload.value],
    ['contentUri', String(props.payload.contentUri)],
    ['contentType', String(props.payload.contentType)],
    ['contentMimeType', String(props.payload.contentMimeType)],
    ['originalName', String(props.payload.originalName)],
    ['contentSize', String(props.payload.contentSize)],
  ];
  return (
    <For each={rows()}>
      {([label, value]) => (
        <ResultRow testID={`sharing-payload-${props.index}-${label}`} label={label} value={value} />
      )}
    </For>
  );
}

function probeIncomingShare(): string | null {
  try {
    getSharedPayloads();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

// iOS throws without an App Group and a Share Extension, so probe before mounting the hook
export function IncomingShareSection() {
  const [problem] = createSignal(probeIncomingShare());
  return (
    <Show
      when={problem() === null}
      fallback={
        <Scenario
          testID="sharing-incoming-card"
          title="Receive what other apps share into yours (needs native setup)"
          why="Appear in the share sheet so users can send a link, text or image straight into the app. This needs an iOS App Group with a Share Extension, or an Android intent filter, which the example app does not ship."
          steps={['Add a Share Extension and an App Group to the iOS project, or an intent filter on Android', 'Rebuild the app and share something into it']}
          expect={`Right now the native side reports: ${problem()}`}
        />
      }
    >
      <IncomingShareCards />
    </Show>
  );
}

function IncomingShareCards() {
  const incoming = useIncomingShare();
  return (
    <>
      <Scenario
        testID="sharing-incoming-card"
        title="Receive what other apps share into yours"
        why="Appear in the share sheet so users can send a link, text or image straight into the app. The host app needs a share target (iOS Share Extension, Android intent filter), which this package does not generate."
        steps={['In another app, share some text or an image to this app', 'Come back to this screen']}
        expect="The shared payload count goes up and each item is listed with its type and value. Clear empties the list."
      >
        <ResultRow testID="sharing-incoming-count" label="sharedPayloads" value={String(incoming().sharedPayloads.length)} />
        <ResultRow testID="sharing-incoming-resolving" label="isResolving" value={String(incoming().isResolving)} />
        <ResultRow testID="sharing-incoming-error" label="error" value={incoming().error?.message ?? 'none'} />
        <ResultRow testID="sharing-incoming-resolved" label="resolvedSharedPayloads" value={String(incoming().resolvedSharedPayloads.length)} />
        <For each={incoming().resolvedSharedPayloads}>
          {(payload, index) => <PayloadRows payload={payload} index={index()} />}
        </For>
        <ActionButton testID="sharing-incoming-refresh" title="refreshSharePayloads" onPress={() => incoming().refreshSharePayloads()} color={color} />
        <ActionButton testID="sharing-incoming-clear" title="clearSharedPayloads (hook)" onPress={() => incoming().clearSharedPayloads()} color={color} />
      </Scenario>
      <CallConsole
        prefix="sharing-incoming-calls"
        title="Imperative incoming share calls"
        color={color}
        calls={[
          { label: 'getSharedPayloads', run: async () => getSharedPayloads() },
          { label: 'getResolvedSharedPayloadsAsync', run: () => getResolvedSharedPayloadsAsync() },
          { label: 'clearSharedPayloads', run: async () => clearSharedPayloads() },
        ]}
      />
    </>
  );
}
