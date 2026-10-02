import { Component, signal } from '@angular/core';
import { Directory, File } from '@symbiote-native/file-system';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { Field } from '../components/Field';
import { ToggleRow } from '../components/ToggleRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

function picked(files: File | File[] | null): string[] {
  if (files === null) {
    return [];
  }
  return (Array.isArray(files) ? files : [files]).map(item => item.uri);
}

@Component({
  selector: 'FileSystemPicker',
  standalone: true,
  imports: [CallConsole, Card, Field, ToggleRow],
  template: `
    <Card testID="file-system-picker-card" title="System pickers">
      <Field
        testID="file-system-mime-input"
        label="mimeTypes (comma separated)"
        [(value)]="mimeTypes"
      />
      <Field
        testID="file-system-initial-input"
        label="initialUri"
        [(value)]="initialUri"
      />
      <ToggleRow
        testID="file-system-multiple-switch"
        label="multipleFiles"
        [(value)]="isMultiple"
        [color]="color"
      />
    </Card>
    <CallConsole
      prefix="file-system-pickers"
      title="Picker calls"
      [color]="color"
      [calls]="calls"
    />
  `,
})
export class FileSystemPicker {
  readonly color = lineColorOf(ROUTE_NAME.FileSystem);

  readonly mimeTypes = signal('');
  readonly initialUri = signal('');
  readonly isMultiple = signal(false);

  readonly calls = [
    {
      label: 'File.pickFileAsync',
      run: async () => {
        const types = this.mimeTypes()
          .split(',')
          .map(item => item.trim())
          .filter(item => item !== '');
        const common = {
          initialUri: this.initialUri() === '' ? undefined : this.initialUri(),
          mimeTypes: types.length === 0 ? undefined : types,
        };
        const outcome = this.isMultiple()
          ? await File.pickFileAsync({ ...common, multipleFiles: true })
          : await File.pickFileAsync({ ...common, multipleFiles: false });
        return outcome.canceled ? 'canceled' : picked(outcome.result);
      },
    },
    {
      label: 'Directory.pickDirectoryAsync',
      run: async () =>
        (
          await Directory.pickDirectoryAsync(
            this.initialUri() === '' ? undefined : this.initialUri(),
          )
        ).uri,
    },
  ];
}
