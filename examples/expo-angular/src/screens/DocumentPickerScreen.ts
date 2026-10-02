import { Component, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { getDocumentAsync } from '@symbiote-native/document-picker';
import type { IDocumentPickerAsset } from '@symbiote-native/document-picker';
import { ActionButton } from '../components/ActionButton';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Explorer } from '../components/Explorer';
import { Field } from '../components/Field';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { ScreenShell } from '../components/ScreenShell';
import { ToggleRow } from '../components/ToggleRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const TYPE_PRESETS = [
  { label: 'any', value: '*/*' },
  { label: 'images', value: 'image/*' },
  { label: 'pdf', value: 'application/pdf' },
  { label: 'pdf+text', value: 'application/pdf,text/plain' },
] as const;

@Component({
  selector: 'DocumentPickerScreen',
  standalone: true,
  imports: [
    ActionButton,
    Card,
    ChoiceRow,
    Explorer,
    Field,
    ResultRow,
    Scenario,
    ScreenShell,
    SYMBIOTE_ELEMENTS,
    ToggleRow,
  ],
  template: `
    <ScreenShell
      [route]="route"
      testID="document-picker-scroll"
      title="Document Picker"
      body="Let users attach files from anywhere: Files, iCloud Drive, Google Drive or local storage. Filter by type, allow several files and get a readable local copy."
    >
      <Scenario
        testID="document-picker-result-card"
        title="Attach a file from the user's storage"
        why="Upload a contract, import a backup or attach a PDF. The system picker shows every storage provider, so the app needs no storage permission."
        [steps]="resultSteps"
        expect="The status says picked N with each file's name, size and type. Cancelling says canceled and lists nothing."
      >
        <ActionButton
          testID="document-picker-pick-button"
          title="Pick a file"
          [color]="color"
          (press)="pick()"
        />
        <ResultRow
          testID="document-picker-status"
          label="canceled / assets"
          [value]="status()"
        />
        @for (asset of assets(); track asset.uri; let index = $index) {
          <view [testID]="'document-picker-asset-' + index">
            <ResultRow
              [testID]="'document-picker-name-' + index"
              label="name"
              [value]="asset.name"
            />
            <ResultRow
              [testID]="'document-picker-size-' + index"
              label="size"
              [value]="
                asset.size === undefined ? 'unknown' : asset.size + ' bytes'
              "
            />
            <ResultRow
              [testID]="'document-picker-mime-' + index"
              label="mimeType"
              [value]="asset.mimeType ?? 'unknown'"
            />
            <ResultRow
              [testID]="'document-picker-modified-' + index"
              label="lastModified"
              [value]="modifiedAt(asset)"
            />
            <ResultRow
              [testID]="'document-picker-uri-' + index"
              label="uri"
              [value]="asset.uri"
            />
          </view>
        }
      </Scenario>
      <Explorer testID="document-picker-explorer" [color]="color">
        <ng-template>
          <Card testID="document-picker-options-card" title="Options">
            <ChoiceRow
              testID="document-picker-type-preset"
              label="type presets"
              [options]="typePresets"
              [(value)]="type"
              [color]="color"
            />
            <Field
              testID="document-picker-type-input"
              label="type (MIME types, comma separated)"
              [(value)]="type"
            />
            <ToggleRow
              testID="document-picker-copy-switch"
              label="copyToCacheDirectory"
              [(value)]="copyToCacheDirectory"
              [color]="color"
            />
            <ToggleRow
              testID="document-picker-multiple-switch"
              label="multiple"
              [(value)]="multiple"
              [color]="color"
            />
          </Card>
        </ng-template>
      </Explorer>
    </ScreenShell>
  `,
})
export class DocumentPickerScreen {
  readonly route = ROUTE_NAME.DocumentPicker;
  readonly color = lineColorOf(ROUTE_NAME.DocumentPicker);
  readonly typePresets = TYPE_PRESETS;
  readonly resultSteps = [
    'Press Pick a file',
    'Choose any file (or several after enabling multiple in the explorer)',
    'Cancel once to see that too',
  ];

  readonly type = signal<string>('*/*');
  readonly copyToCacheDirectory = signal(true);
  readonly multiple = signal(false);
  readonly status = signal('idle');
  readonly assets = signal<IDocumentPickerAsset[]>([]);

  modifiedAt(asset: IDocumentPickerAsset): string {
    return new Date(asset.lastModified).toISOString();
  }

  pick(): void {
    this.status.set('picker open…');
    const types = this.type()
      .split(',')
      .map(item => item.trim())
      .filter(item => item.length > 0);
    getDocumentAsync({
      type: types.length === 1 ? types[0] : types,
      copyToCacheDirectory: this.copyToCacheDirectory(),
      multiple: this.multiple(),
    })
      .then(result => {
        this.status.set(
          result.canceled ? 'canceled' : `picked ${result.assets.length}`,
        );
        this.assets.set(result.canceled ? [] : result.assets);
      })
      .catch((error: Error) => this.status.set(`failed: ${error.message}`));
  }
}
