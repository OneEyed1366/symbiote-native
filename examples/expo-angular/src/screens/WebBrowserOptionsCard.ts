import { Component, model } from '@angular/core';
import { WebBrowserPresentationStyle } from '@symbiote-native/web-browser';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Field } from '../components/Field';
import { ToggleRow } from '../components/ToggleRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { choices } from './web-browser-options';
import type { IOptionsForm } from './web-browser-options';

type IFormKey<TValue> = {
  [K in keyof IOptionsForm]: IOptionsForm[K] extends TValue ? K : never;
}[keyof IOptionsForm];

const TEXT_FIELDS: readonly {
  testID: string;
  label: string;
  key: IFormKey<string>;
}[] = [
  {
    testID: 'web-browser-toolbar-input',
    label: 'toolbarColor',
    key: 'toolbarColor',
  },
  {
    testID: 'web-browser-secondary-input',
    label: 'secondaryToolbarColor (Android)',
    key: 'secondaryToolbarColor',
  },
  {
    testID: 'web-browser-controls-input',
    label: 'controlsColor (iOS)',
    key: 'controlsColor',
  },
  {
    testID: 'web-browser-package-input',
    label: 'browserPackage (Android)',
    key: 'browserPackage',
  },
];

const TOGGLES: readonly {
  testID: string;
  label: string;
  key: IFormKey<boolean>;
}[] = [
  {
    testID: 'web-browser-collapse-switch',
    label: 'enableBarCollapsing',
    key: 'enableBarCollapsing',
  },
  {
    testID: 'web-browser-title-switch',
    label: 'showTitle (Android)',
    key: 'showTitle',
  },
  {
    testID: 'web-browser-share-switch',
    label: 'enableDefaultShareMenuItem (Android)',
    key: 'enableDefaultShareMenuItem',
  },
  {
    testID: 'web-browser-recents-switch',
    label: 'showInRecents (Android)',
    key: 'showInRecents',
  },
  {
    testID: 'web-browser-task-switch',
    label: 'createTask (Android)',
    key: 'createTask',
  },
  {
    testID: 'web-browser-proxy-switch',
    label: 'useProxyActivity (Android)',
    key: 'useProxyActivity',
  },
  {
    testID: 'web-browser-reader-switch',
    label: 'readerMode (iOS)',
    key: 'readerMode',
  },
];

@Component({
  selector: 'WebBrowserOptionsCard',
  standalone: true,
  imports: [Card, ChoiceRow, Field, ToggleRow],
  template: `
    <Card testID="web-browser-options-card" title="Browser options">
      @for (item of textFields; track item.key) {
        <Field
          [testID]="item.testID"
          [label]="item.label"
          [value]="form()[item.key]"
          (valueChange)="patchText(item.key, $event)"
        />
      }
      @for (item of toggles; track item.key) {
        <ToggleRow
          [testID]="item.testID"
          [label]="item.label"
          [value]="form()[item.key]"
          (valueChange)="patchToggle(item.key, $event)"
          [color]="color"
        />
      }
      <ChoiceRow
        testID="web-browser-dismiss-style"
        label="dismissButtonStyle (iOS)"
        [options]="dismissStyles"
        [value]="form().dismissButtonStyle"
        (valueChange)="patch({ dismissButtonStyle: $event })"
        [color]="color"
      />
      <ChoiceRow
        testID="web-browser-presentation"
        label="presentationStyle (iOS)"
        [options]="presentationStyles"
        [value]="form().presentationStyle"
        (valueChange)="patch({ presentationStyle: $event })"
        [color]="color"
      />
    </Card>
  `,
})
export class WebBrowserOptionsCard {
  readonly form = model.required<IOptionsForm>();
  readonly color = lineColorOf(ROUTE_NAME.WebBrowser);
  readonly textFields = TEXT_FIELDS;
  readonly toggles = TOGGLES;
  readonly dismissStyles = choices(['done', 'close', 'cancel']);
  readonly presentationStyles = choices(
    Object.values(WebBrowserPresentationStyle),
  );

  patch(change: Partial<IOptionsForm>): void {
    this.form.update(current => ({ ...current, ...change }));
  }

  patchText(key: IFormKey<string>, value: string): void {
    this.patch({ [key]: value });
  }

  patchToggle(key: IFormKey<boolean>, value: boolean): void {
    this.patch({ [key]: value });
  }
}
