import { useCallback, useState } from 'react';
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

function AssetRow({ asset, index }: { asset: IDocumentPickerAsset; index: number }) {
  return (
    <view testID={`document-picker-asset-${index}`}>
      <ResultRow
        testID={`document-picker-name-${index}`}
        label="name"
        value={asset.name}
      />
      <ResultRow
        testID={`document-picker-size-${index}`}
        label="size"
        value={asset.size === undefined ? 'unknown' : `${asset.size} bytes`}
      />
      <ResultRow
        testID={`document-picker-mime-${index}`}
        label="mimeType"
        value={asset.mimeType ?? 'unknown'}
      />
      <ResultRow
        testID={`document-picker-modified-${index}`}
        label="lastModified"
        value={new Date(asset.lastModified).toISOString()}
      />
      <ResultRow
        testID={`document-picker-uri-${index}`}
        label="uri"
        value={asset.uri}
      />
    </view>
  );
}

function OptionsCard({
  type,
  setType,
  copyToCacheDirectory,
  setCopy,
  multiple,
  setMultiple,
}: {
  type: string;
  setType: (value: string) => void;
  copyToCacheDirectory: boolean;
  setCopy: (value: boolean) => void;
  multiple: boolean;
  setMultiple: (value: boolean) => void;
}) {
  const color = lineColorOf(ROUTE);
  return (
    <Card testID="document-picker-options-card" title="Options">
      <ChoiceRow
        testID="document-picker-type-preset"
        label="type presets"
        options={TYPE_PRESETS}
        value={type}
        onChange={setType}
        color={color}
      />
      <Field
        testID="document-picker-type-input"
        label="type (MIME types, comma separated)"
        value={type}
        onChange={setType}
      />
      <ToggleRow
        testID="document-picker-copy-switch"
        label="copyToCacheDirectory"
        value={copyToCacheDirectory}
        onChange={setCopy}
        color={color}
      />
      <ToggleRow
        testID="document-picker-multiple-switch"
        label="multiple"
        value={multiple}
        onChange={setMultiple}
        color={color}
      />
    </Card>
  );
}

export function DocumentPickerScreen() {
  const [type, setType] = useState('*/*');
  const [copyToCacheDirectory, setCopy] = useState(true);
  const [multiple, setMultiple] = useState(false);
  const [status, setStatus] = useState('idle');
  const [assets, setAssets] = useState<IDocumentPickerAsset[]>([]);

  const handlePick = useCallback(() => {
    setStatus('picker open…');
    const types = type
      .split(',')
      .map(item => item.trim())
      .filter(item => item.length > 0);
    getDocumentAsync({
      type: types.length === 1 ? types[0] : types,
      copyToCacheDirectory,
      multiple,
    })
      .then(result => {
        setStatus(result.canceled ? 'canceled' : `picked ${result.assets.length}`);
        setAssets(result.canceled ? [] : result.assets);
      })
      .catch((error: Error) => setStatus(`failed: ${error.message}`));
  }, [type, copyToCacheDirectory, multiple]);

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
          value={status}
        />
        {assets.map((asset, index) => (
          <AssetRow key={asset.uri} asset={asset} index={index} />
        ))}
      </Scenario>
      <Explorer testID="document-picker-explorer" color={lineColorOf(ROUTE)}>
        <OptionsCard
          type={type}
          setType={setType}
          copyToCacheDirectory={copyToCacheDirectory}
          setCopy={setCopy}
          multiple={multiple}
          setMultiple={setMultiple}
        />
      </Explorer>
    </ScreenShell>
  );
}
