import { useCallback, useState } from 'react';
import {
  Orientation,
  printAsync,
  printToFileAsync,
  selectPrinterAsync,
} from '@symbiote-native/print';
import type { IPrinter } from '@symbiote-native/print';
import { ActionButton } from '../components/ActionButton';
import { Explorer, Scenario } from '../components/Scenario';
import {
  Card,
  Field,
  ResultRow,
  ScreenShell,
  ToggleRow,
  lineColorOf,
} from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const ROUTE = ROUTE_NAME.Print;
const SAMPLE_HTML =
  '<h1>Symbiote canary</h1><p>Printed from @symbiote-native/print</p>';

type IForm = {
  html: string;
  uri: string;
  width: string;
  height: string;
  margin: string;
};
type ISetField = (key: keyof IForm, value: string) => void;

function parseNumber(text: string): number | undefined {
  const value = Number(text);
  return text.trim() === '' || Number.isNaN(value) ? undefined : value;
}

function marginsOf(form: IForm) {
  const value = parseNumber(form.margin);
  return value === undefined
    ? undefined
    : { top: value, right: value, bottom: value, left: value };
}

function DocumentCard({ form, setField }: { form: IForm; setField: ISetField }) {
  return (
    <Card testID="print-source-card" title="Document">
      <Field
        testID="print-html-input"
        label="html"
        value={form.html}
        onChange={text => setField('html', text)}
      />
      <Field
        testID="print-uri-input"
        label="uri (PDF or image, overrides html when set)"
        value={form.uri}
        onChange={text => setField('uri', text)}
        placeholder="file:///…/doc.pdf"
      />
      <Field
        testID="print-width-input"
        label="width (points)"
        value={form.width}
        onChange={text => setField('width', text)}
        placeholder="612"
      />
      <Field
        testID="print-height-input"
        label="height (points)"
        value={form.height}
        onChange={text => setField('height', text)}
        placeholder="792"
      />
      <Field
        testID="print-margins-input"
        label="margins (same value on every side)"
        value={form.margin}
        onChange={text => setField('margin', text)}
        placeholder="24"
      />
    </Card>
  );
}

function PrintCard({ form }: { form: IForm }) {
  const color = lineColorOf(ROUTE);
  const [isLandscape, setIsLandscape] = useState(false);
  const [printer, setPrinter] = useState<IPrinter | null>(null);
  const [result, setResult] = useState('idle');

  const handleSelectPrinter = useCallback(() => {
    selectPrinterAsync()
      .then(selected => {
        setPrinter(selected);
        setResult(`printer: ${selected.name}`);
      })
      .catch((error: Error) => setResult(`select failed: ${error.message}`));
  }, []);

  const handlePrint = useCallback(() => {
    setResult('printing…');
    printAsync({
      ...(form.uri.trim() === ''
        ? { html: form.html }
        : { uri: form.uri.trim() }),
      width: parseNumber(form.width),
      height: parseNumber(form.height),
      printerUrl: printer?.url,
      orientation: isLandscape ? Orientation.landscape : Orientation.portrait,
      margins: marginsOf(form),
    })
      .then(() => setResult('print dialog finished'))
      .catch((error: Error) => setResult(`print failed: ${error.message}`));
  }, [form, printer, isLandscape]);

  return (
    <Scenario
      testID="print-print-card"
      title="Print a receipt or ticket"
      why="The app hands over HTML or a PDF and the system shows its own print dialog, so AirPrint and Android printers work without any printing code in the app."
      steps={['Optionally pick a printer (iOS)', 'Press Print', 'Print or cancel in the system dialog']}
      expect="The print dialog opens with the sample page. Last result says print dialog finished, or the error if another dialog is already open."
    >
      <ToggleRow
        testID="print-orientation-switch"
        label="orientation: landscape"
        value={isLandscape}
        onChange={setIsLandscape}
        color={color}
      />
      <ActionButton
        testID="print-select-printer-button"
        title="Select printer (iOS)"
        onPress={handleSelectPrinter}
        color={color}
      />
      <ResultRow
        testID="print-printer-url"
        label="printerUrl"
        value={printer === null ? 'none' : printer.url}
      />
      <ActionButton
        testID="print-print-button"
        title="Print"
        onPress={handlePrint}
        color={color}
      />
      <ResultRow testID="print-result" label="Last result" value={result} />
    </Scenario>
  );
}

function FileCard({ form }: { form: IForm }) {
  const color = lineColorOf(ROUTE);
  const [textZoom, setTextZoom] = useState('');
  const [wantsBase64, setWantsBase64] = useState(false);
  const [result, setResult] = useState('idle');

  const handleRender = useCallback(() => {
    setResult('rendering…');
    printToFileAsync({
      html: form.html,
      width: parseNumber(form.width),
      height: parseNumber(form.height),
      margins: marginsOf(form),
      base64: wantsBase64,
      textZoom: parseNumber(textZoom),
    })
      .then(file => {
        const base64Note =
          file.base64 === undefined
            ? ''
            : `, base64 ${file.base64.length} chars`;
        setResult(`${file.numberOfPages} page(s), ${file.uri}${base64Note}`);
      })
      .catch((error: Error) => setResult(`render failed: ${error.message}`));
  }, [form, wantsBase64, textZoom]);

  return (
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
        onChange={setTextZoom}
        placeholder="100"
      />
      <ToggleRow
        testID="print-base64-switch"
        label="base64"
        value={wantsBase64}
        onChange={setWantsBase64}
        color={color}
      />
      <ActionButton
        testID="print-file-button"
        title="Render to PDF"
        onPress={handleRender}
        color={color}
      />
      <ResultRow testID="print-file-result" label="Last result" value={result} />
    </Scenario>
  );
}

export function PrintScreen() {
  const [form, setForm] = useState<IForm>({
    html: SAMPLE_HTML,
    uri: '',
    width: '',
    height: '',
    margin: '',
  });
  const setField: ISetField = (key, value) =>
    setForm(previous => ({ ...previous, [key]: value }));

  return (
    <ScreenShell
      route={ROUTE}
      testID="print-scroll"
      title="Print"
      body="Print HTML or a PDF through AirPrint and the Android print framework, or render HTML to a PDF file. The sample receipt below works as is, and the document settings are in the explorer."
    >
      <PrintCard form={form} />
      <FileCard form={form} />
      <Explorer testID="print-explorer" color={lineColorOf(ROUTE)}>
        <DocumentCard form={form} setField={setField} />
      </Explorer>
    </ScreenShell>
  );
}
