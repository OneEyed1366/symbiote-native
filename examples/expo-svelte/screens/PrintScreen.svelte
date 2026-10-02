<script lang="ts">
  import {
    Orientation,
    printAsync,
    printToFileAsync,
    selectPrinterAsync,
  } from '@symbiote-native/print';
  import type { IPrinter } from '@symbiote-native/print';
  import ActionButton from '../components/ActionButton.svelte';
  import Card from '../components/Card.svelte';
  import Explorer from '../components/Explorer.svelte';
  import Field from '../components/Field.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import Scenario from '../components/Scenario.svelte';
  import ScreenShell from '../components/ScreenShell.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';

  const ROUTE = ROUTE_NAME.Print;
  const color = lineColorOf(ROUTE);
  const SAMPLE_HTML =
    '<h1>Symbiote canary</h1><p>Printed from @symbiote-native/print</p>';

  let html = $state(SAMPLE_HTML);
  let uri = $state('');
  let width = $state('');
  let height = $state('');
  let margin = $state('');
  let isLandscape = $state(false);
  let printer = $state<IPrinter | null>(null);
  let printResult = $state('idle');
  let textZoom = $state('');
  let wantsBase64 = $state(false);
  let fileResult = $state('idle');

  function parseNumber(text: string): number | undefined {
    const value = Number(text);
    return text.trim() === '' || Number.isNaN(value) ? undefined : value;
  }

  function marginsOf() {
    const value = parseNumber(margin);
    return value === undefined
      ? undefined
      : { top: value, right: value, bottom: value, left: value };
  }

  function handleSelectPrinter(): void {
    selectPrinterAsync()
      .then(selected => {
        printer = selected;
        printResult = `printer: ${selected.name}`;
      })
      .catch((error: Error) => {
        printResult = `select failed: ${error.message}`;
      });
  }

  function handlePrint(): void {
    printResult = 'printing…';
    printAsync({
      ...(uri.trim() === '' ? { html } : { uri: uri.trim() }),
      width: parseNumber(width),
      height: parseNumber(height),
      printerUrl: printer?.url,
      orientation: isLandscape ? Orientation.landscape : Orientation.portrait,
      margins: marginsOf(),
    })
      .then(() => {
        printResult = 'print dialog finished';
      })
      .catch((error: Error) => {
        printResult = `print failed: ${error.message}`;
      });
  }

  function handleRender(): void {
    fileResult = 'rendering…';
    printToFileAsync({
      html,
      width: parseNumber(width),
      height: parseNumber(height),
      margins: marginsOf(),
      base64: wantsBase64,
      textZoom: parseNumber(textZoom),
    })
      .then(file => {
        const base64Note =
          file.base64 === undefined
            ? ''
            : `, base64 ${file.base64.length} chars`;
        fileResult = `${file.numberOfPages} page(s), ${file.uri}${base64Note}`;
      })
      .catch((error: Error) => {
        fileResult = `render failed: ${error.message}`;
      });
  }
</script>

<ScreenShell
  route={ROUTE}
  testID="print-scroll"
  title="Print"
  body="Print HTML or a PDF through AirPrint and the Android print framework, or render HTML to a PDF file. The sample receipt below works as is, and the document settings are in the explorer."
>
  <Scenario
    testID="print-print-card"
    title="Print a receipt or ticket"
    why="The app hands over HTML or a PDF and the system shows its own print dialog, so AirPrint and Android printers work without any printing code in the app."
    steps={[
      'Optionally pick a printer (iOS)',
      'Press Print',
      'Print or cancel in the system dialog',
    ]}
    expect="The print dialog opens with the sample page. Last result says print dialog finished, or the error if another dialog is already open."
  >
    <ToggleRow
      testID="print-orientation-switch"
      label="orientation: landscape"
      value={isLandscape}
      onChange={next => {
        isLandscape = next;
      }}
      {color}
    />
    <ActionButton
      testID="print-select-printer-button"
      title="Select printer (iOS)"
      onPress={handleSelectPrinter}
      {color}
    />
    <ResultRow
      testID="print-printer-url"
      label="printerUrl"
      value={printer?.url ?? 'none'}
    />
    <ActionButton
      testID="print-print-button"
      title="Print"
      onPress={handlePrint}
      {color}
    />
    <ResultRow testID="print-result" label="Last result" value={printResult} />
  </Scenario>

  <Scenario
    testID="print-file-card"
    title="Turn a page into a PDF to keep or share"
    why="Render HTML to a PDF file with no dialog, for invoices, tickets or reports the user wants to store or send."
    steps={['Press Render to PDF']}
    expect="Last result shows the page count and a file URI. That URI can go straight to Sharing or Mail Composer as an attachment."
  >
    <Field
      testID="print-text-zoom-input"
      label="textZoom (Android, percent)"
      value={textZoom}
      onChange={next => {
        textZoom = next;
      }}
      placeholder="100"
    />
    <ToggleRow
      testID="print-base64-switch"
      label="base64"
      value={wantsBase64}
      onChange={next => {
        wantsBase64 = next;
      }}
      {color}
    />
    <ActionButton
      testID="print-file-button"
      title="Render to PDF"
      onPress={handleRender}
      {color}
    />
    <ResultRow testID="print-file-result" label="Last result" value={fileResult} />
  </Scenario>

  <Explorer testID="print-explorer" {color}>
    <Card testID="print-source-card" title="Document">
      <Field
        testID="print-html-input"
        label="html"
        value={html}
        onChange={next => {
          html = next;
        }}
      />
      <Field
        testID="print-uri-input"
        label="uri (PDF or image, overrides html when set)"
        value={uri}
        onChange={next => {
          uri = next;
        }}
        placeholder="file:///…/doc.pdf"
      />
      <Field
        testID="print-width-input"
        label="width (points)"
        value={width}
        onChange={next => {
          width = next;
        }}
        placeholder="612"
      />
      <Field
        testID="print-height-input"
        label="height (points)"
        value={height}
        onChange={next => {
          height = next;
        }}
        placeholder="792"
      />
      <Field
        testID="print-margins-input"
        label="margins (same value on every side)"
        value={margin}
        onChange={next => {
          margin = next;
        }}
        placeholder="24"
      />
    </Card>
  </Explorer>
</ScreenShell>
