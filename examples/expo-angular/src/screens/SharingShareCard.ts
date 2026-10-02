import { Component, signal } from '@angular/core';
import { File, Paths } from '@symbiote-native/file-system/angular';
import { shareAsync } from '@symbiote-native/sharing/angular';
import { ActionButton } from '../components/ActionButton';
import { Explorer } from '../components/Explorer';
import { Field } from '../components/Field';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

function optionalNumber(text: string): number | undefined {
  const value = Number(text);
  return text.trim() === '' || Number.isNaN(value) ? undefined : value;
}

function optional(text: string): string | undefined {
  return text.trim() === '' ? undefined : text.trim();
}

@Component({
  selector: 'SharingShareCard',
  standalone: true,
  imports: [ActionButton, Explorer, Field, ResultRow, Scenario],
  template: `
    <Scenario
      testID="sharing-share-card"
      title="Let users send a file to another app"
      why="Export a report, a photo or a backup through the system share sheet, so the user picks Messages, Mail, AirDrop or any installed app. The file must be a local file:// path."
      [steps]="steps"
      expect="The share sheet opens with the sample file. Last result says sheet dismissed after you pick a target or cancel."
    >
      <ActionButton
        testID="sharing-sample-button"
        title="Create a sample file"
        [color]="color"
        (press)="createSample()"
      />
      <Field
        testID="sharing-uri-input"
        label="file uri"
        [(value)]="fileUri"
        placeholder="file:///path/to/file.pdf"
      />
      <ActionButton
        testID="sharing-share-button"
        title="Share"
        [color]="color"
        (press)="share()"
      />
      <ResultRow
        testID="sharing-result"
        label="Last result"
        [value]="lastResult()"
      />
      <Explorer testID="sharing-options-explorer" [color]="color">
        <ng-template>
          <Field
            testID="sharing-mime-input"
            label="mimeType (Android)"
            [(value)]="mimeType"
          />
          <Field testID="sharing-uti-input" label="UTI (iOS)" [(value)]="uti" />
          <Field
            testID="sharing-title-input"
            label="dialogTitle"
            [(value)]="dialogTitle"
          />
          <Field
            testID="sharing-anchor-x-input"
            label="anchor.x (iPad popover)"
            [(value)]="anchorX"
          />
          <Field
            testID="sharing-anchor-y-input"
            label="anchor.y"
            [(value)]="anchorY"
          />
          <Field
            testID="sharing-anchor-width-input"
            label="anchor.width"
            [(value)]="anchorWidth"
          />
          <Field
            testID="sharing-anchor-height-input"
            label="anchor.height"
            [(value)]="anchorHeight"
          />
        </ng-template>
      </Explorer>
    </Scenario>
  `,
})
export class SharingShareCard {
  readonly color = lineColorOf(ROUTE_NAME.Sharing);
  readonly steps = [
    'Press Create a sample file',
    'Press Share',
    'Pick a target in the share sheet, or dismiss it',
  ];

  readonly fileUri = signal('');
  readonly mimeType = signal('');
  readonly uti = signal('');
  readonly dialogTitle = signal('Share from the Symbiote canary');
  readonly anchorX = signal('');
  readonly anchorY = signal('');
  readonly anchorWidth = signal('');
  readonly anchorHeight = signal('');
  readonly lastResult = signal('idle');

  createSample(): void {
    const sample = new File(Paths.cache, 'symbiote-share-sample.txt');
    try {
      if (!sample.exists) {
        sample.create();
      }
      sample.write('Shared from the Symbiote canary');
      this.fileUri.set(sample.uri);
      this.mimeType.set('text/plain');
      this.lastResult.set('sample file created');
    } catch (error) {
      this.lastResult.set(
        `sample failed at ${sample.uri}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  share(): void {
    this.lastResult.set('sheet open…');
    shareAsync(this.fileUri(), {
      mimeType: optional(this.mimeType()),
      UTI: optional(this.uti()),
      dialogTitle: optional(this.dialogTitle()),
      anchor: {
        x: optionalNumber(this.anchorX()),
        y: optionalNumber(this.anchorY()),
        width: optionalNumber(this.anchorWidth()),
        height: optionalNumber(this.anchorHeight()),
      },
    })
      .then(() => this.lastResult.set('sheet dismissed'))
      .catch((error: Error) =>
        this.lastResult.set(`share failed: ${error.message}`),
      );
  }
}
