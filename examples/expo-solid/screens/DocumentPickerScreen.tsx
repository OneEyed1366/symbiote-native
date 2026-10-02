import { For, createSignal } from 'solid-js';
import { getDocumentAsync } from '@symbiote-native/document-picker';
import type { IDocumentPickerAsset } from '@symbiote-native/document-picker';
import { ActionButton } from '../components/ActionButton';
import { Explorer, Scenario } from '../components/Scenario';
import {
  Card,
  ChoiceRow,
  Field,
  ResultRow,
  ScreenShell,
  ToggleRow,
  lineColorOf,
} from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const ROUTE = ROUTE_NAME.DocumentPicker;

const TYPE_PRESETS = [
  { label: 'any', value: '*/*' },
  { label: 'images', value: 'image/*' },
  { label: 'pdf', value: 'application/pdf' },
  { label: 'pdf+text', value: 'application/pdf,text/plain' },
] as const;

function AssetRow(props: { asset: IDocumentPickerAsset; index: number }) {
  return (
    <view testID={`document-picker-asset-${props.index}`}>
      <ResultRow
        testID={`document-picker-name-${props.index}`}
        label="name"
        value={props.asset.name}
      />
      <ResultRow
        testID={`document-picker-size-${props.index}`}
        label="size"
        value={props.asset.size === undefined ? 'unknown' : `${props.asset.size} bytes`}
      />
      <ResultRow
        testID={`document-picker-mime-${props.index}`}
        label="mimeType"
        value={props.asset.mimeType ?? 'unknown'}
      />
      <ResultRow
        testID={`document-picker-modified-${props.index}`}
        label="lastModified"
        value={new Date(props.asset.lastModified).toISOString()}
      />
      <ResultRow
        testID={`document-picker-uri-${props.index}`}
        label="uri"
        value={props.asset.uri}
      />
    </view>
  );
}

type IOptionsCardProps = {
  type: string;
  setType: (value: string) => void;
  copyToCacheDirectory: boolean;
  setCopy: (value: boolean) => void;
  multiple: boolean;
  setMultiple: (value: boolean) => void;
};

function OptionsCard(props: IOptionsCardProps) {
  const color = lineColorOf(ROUTE);
  return (
    <Card testID="document-picker-options-card" title="Options">
      <ChoiceRow
        testID="document-picker-type-preset"
        label="type presets"
        options={TYPE_PRESETS}
        value={props.type}
        onChange={props.setType}
        color={color}
      />
      <Field
        testID="document-picker-type-input"
        label="type (MIME types, comma separated)"
        value={props.type}
        onChange={props.setType}
      />
      <ToggleRow
        testID="document-picker-copy-switch"
        label="copyToCacheDirectory"
        value={props.copyToCacheDirectory}
        onChange={props.setCopy}
        color={color}
      />
      <ToggleRow
        testID="document-picker-multiple-switch"
        label="multiple"
        value={props.multiple}
        onChange={props.setMultiple}
        color={color}
      />
    </Card>
  );
}

export function DocumentPickerScreen() {
  const [type, setType] = createSignal('*/*');
  const [copyToCacheDirectory, setCopy] = createSignal(true);
  const [multiple, setMultiple] = createSignal(false);
  const [status, setStatus] = createSignal('idle');
  const [assets, setAssets] = createSignal<IDocumentPickerAsset[]>([]);

  const handlePick = () => {
    setStatus('picker open…');
    const types = type()
      .split(',')
      .map(item => item.trim())
      .filter(item => item.length > 0);
    getDocumentAsync({
      type: types.length === 1 ? types[0] : types,
      copyToCacheDirectory: copyToCacheDirectory(),
      multiple: multiple(),
    })
      .then(result => {
        setStatus(result.canceled ? 'canceled' : `picked ${result.assets.length}`);
        setAssets(result.canceled ? [] : result.assets);
      })
      .catch((error: Error) => setStatus(`failed: ${error.message}`));
  };

  return (
    <ScreenShell
      route={ROUTE}
      testID="document-picker-scroll"
      title="Document Picker"
      body="Let users attach files from anywhere: Files, iCloud Drive, Google Drive or local storage. Filter by type, allow several files and get a readable local copy."
    >
      <Scenario
        testID="document-picker-result-card"
        title="Attach a file from the user's storage"
        why="Upload a contract, import a backup or attach a PDF. The system picker shows every storage provider, so the app needs no storage permission."
        steps={['Press Pick a file', 'Choose any file (or several after enabling multiple in the explorer)', 'Cancel once to see that too']}
        expect="The status says picked N with each file's name, size and type. Cancelling says canceled and lists nothing."
      >
        <ActionButton
          testID="document-picker-pick-button"
          title="Pick a file"
          onPress={handlePick}
          color={lineColorOf(ROUTE)}
        />
        <ResultRow
          testID="document-picker-status"
          label="canceled / assets"
          value={status()}
        />
        <For each={assets()}>
          {(asset, index) => <AssetRow asset={asset} index={index()} />}
        </For>
      </Scenario>
      <Explorer testID="document-picker-explorer" color={lineColorOf(ROUTE)}>
        <OptionsCard
          type={type()}
          setType={setType}
          copyToCacheDirectory={copyToCacheDirectory()}
          setCopy={setCopy}
          multiple={multiple()}
          setMultiple={setMultiple}
        />
      </Explorer>
    </ScreenShell>
  );
}
