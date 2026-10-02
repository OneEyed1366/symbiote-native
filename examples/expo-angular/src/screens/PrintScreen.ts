import { Component, signal } from '@angular/core';
import {
  Orientation,
  printAsync,
  printToFileAsync,
  selectPrinterAsync,
} from '@symbiote-native/print';
import type { IPrinter } from '@symbiote-native/print';
import { ActionButton } from '../components/ActionButton';
import { Card } from '../components/Card';
import { Explorer } from '../components/Explorer';
import { Field } from '../components/Field';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { ScreenShell } from '../components/ScreenShell';
import { ToggleRow } from '../components/ToggleRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const SAMPLE_HTML =
  '<h1>Symbiote canary</h1><p>Printed from @symbiote-native/print</p>';

function parseNumber(text: string): number | undefined {
  const value = Number(text);
  return text.trim() === '' || Number.isNaN(value) ? undefined : value;
}

@Component({
  selector: 'PrintScreen',
  standalone: true,
  imports: [
    ActionButton,
    Card,
    Explorer,
    Field,
    ResultRow,
    Scenario,
    ScreenShell,
    ToggleRow,
  ],
  template: `
    <ScreenShell
      [route]="route"
      testID="print-scroll"
      title="Print"
      body="Print HTML or a PDF through AirPrint and the Android print framework, or render HTML to a PDF file. The sample receipt below works as is, and the document settings are in the explorer."
    >
      <Scenario
        testID="print-print-card"
        title="Print a receipt or ticket"
        why="The app hands over HTML or a PDF and the system shows its own print dialog, so AirPrint and Android printers work without any printing code in the app."
        [steps]="printSteps"
        expect="The print dialog opens with the sample page. Last result says print dialog finished, or the error if another dialog is already open."
      >
        <ToggleRow
          testID="print-orientation-switch"
          label="orientation: landscape"
          [(value)]="isLandscape"
          [color]="color"
        />
        <ActionButton
          testID="print-select-printer-button"
          title="Select printer (iOS)"
          [color]="color"
          (press)="selectPrinter()"
        />
        <ResultRow
          testID="print-printer-url"
          label="printerUrl"
          [value]="printer()?.url ?? 'none'"
        />
        <ActionButton
          testID="print-print-button"
          title="Print"
          [color]="color"
          (press)="print()"
        />
        <ResultRow
          testID="print-result"
          label="Last result"
          [value]="printResult()"
        />
      </Scenario>

      <Scenario
        testID="print-file-card"
        title="Turn a page into a PDF to keep or share"
        why="Render HTML to a PDF file with no dialog, for invoices, tickets or reports the user wants to store or send."
        [steps]="fileSteps"
        expect="Last result shows the page count and a file URI. That URI can go straight to Sharing or Mail Composer as an attachment."
      >
        <Field
          testID="print-text-zoom-input"
          label="textZoom (Android, percent)"
          [(value)]="textZoom"
          placeholder="100"
        />
        <ToggleRow
          testID="print-base64-switch"
          label="base64"
          [(value)]="wantsBase64"
          [color]="color"
        />
        <ActionButton
          testID="print-file-button"
          title="Render to PDF"
          [color]="color"
          (press)="render()"
        />
        <ResultRow
          testID="print-file-result"
          label="Last result"
          [value]="fileResult()"
        />
      </Scenario>

      <Explorer testID="print-explorer" [color]="color">
        <ng-template>
          <Card testID="print-source-card" title="Document">
            <Field testID="print-html-input" label="html" [(value)]="html" />
            <Field
              testID="print-uri-input"
              label="uri (PDF or image, overrides html when set)"
              [(value)]="uri"
              placeholder="file:///…/doc.pdf"
            />
            <Field
              testID="print-width-input"
              label="width (points)"
              [(value)]="width"
              placeholder="612"
            />
            <Field
              testID="print-height-input"
              label="height (points)"
              [(value)]="height"
              placeholder="792"
            />
            <Field
              testID="print-margins-input"
              label="margins (same value on every side)"
              [(value)]="margin"
              placeholder="24"
            />
          </Card>
        </ng-template>
      </Explorer>
    </ScreenShell>
  `,
})
export class PrintScreen {
  readonly route = ROUTE_NAME.Print;
  readonly color = lineColorOf(ROUTE_NAME.Print);
  readonly printSteps = [
    'Optionally pick a printer (iOS)',
    'Press Print',
    'Print or cancel in the system dialog',
  ];
  readonly fileSteps = ['Press Render to PDF'];

  readonly html = signal(SAMPLE_HTML);
  readonly uri = signal('');
  readonly width = signal('');
  readonly height = signal('');
  readonly margin = signal('');
  readonly isLandscape = signal(false);
  readonly printer = signal<IPrinter | null>(null);
  readonly printResult = signal('idle');
  readonly textZoom = signal('');
  readonly wantsBase64 = signal(false);
  readonly fileResult = signal('idle');

  private marginsOf() {
    const value = parseNumber(this.margin());
    return value === undefined
      ? undefined
      : { top: value, right: value, bottom: value, left: value };
  }

  selectPrinter(): void {
    selectPrinterAsync()
      .then(selected => {
        this.printer.set(selected);
        this.printResult.set(`printer: ${selected.name}`);
      })
      .catch((error: Error) =>
        this.printResult.set(`select failed: ${error.message}`),
      );
  }

  print(): void {
    this.printResult.set('printing…');
    const uri = this.uri().trim();
    printAsync({
      ...(uri === '' ? { html: this.html() } : { uri }),
      width: parseNumber(this.width()),
      height: parseNumber(this.height()),
      printerUrl: this.printer()?.url,
      orientation: this.isLandscape()
        ? Orientation.landscape
        : Orientation.portrait,
      margins: this.marginsOf(),
    })
      .then(() => this.printResult.set('print dialog finished'))
      .catch((error: Error) =>
        this.printResult.set(`print failed: ${error.message}`),
      );
  }

  render(): void {
    this.fileResult.set('rendering…');
    printToFileAsync({
      html: this.html(),
      width: parseNumber(this.width()),
      height: parseNumber(this.height()),
      margins: this.marginsOf(),
      base64: this.wantsBase64(),
      textZoom: parseNumber(this.textZoom()),
    })
      .then(file => {
        const base64Note =
          file.base64 === undefined
            ? ''
            : `, base64 ${file.base64.length} chars`;
        this.fileResult.set(
          `${file.numberOfPages} page(s), ${file.uri}${base64Note}`,
        );
      })
      .catch((error: Error) =>
        this.fileResult.set(`render failed: ${error.message}`),
      );
  }
}
