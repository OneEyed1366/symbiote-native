import { defineComponent, ref } from 'vue';
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

function DocumentCard(props: { form: IForm; setField: ISetField }) {
  return (
    <Card testID="print-source-card" title="Document">
      <Field
        testID="print-html-input"
        label="html"
        value={props.form.html}
        onChange={text => props.setField('html', text)}
      />
      <Field
        testID="print-uri-input"
        label="uri (PDF or image, overrides html when set)"
        value={props.form.uri}
        onChange={text => props.setField('uri', text)}
        placeholder="file:///…/doc.pdf"
      />
      <Field
        testID="print-width-input"
        label="width (points)"
        value={props.form.width}
        onChange={text => props.setField('width', text)}
        placeholder="612"
      />
      <Field
        testID="print-height-input"
        label="height (points)"
        value={props.form.height}
        onChange={text => props.setField('height', text)}
        placeholder="792"
      />
      <Field
        testID="print-margins-input"
        label="margins (same value on every side)"
        value={props.form.margin}
        onChange={text => props.setField('margin', text)}
        placeholder="24"
      />
    </Card>
  );
}

const PrintCard = defineComponent<{ form: IForm }>(
  props => {
    const color = lineColorOf(ROUTE);
    const isLandscape = ref(false);
    const printer = ref<IPrinter | null>(null);
    const result = ref('idle');

    const handleSelectPrinter = () => {
      selectPrinterAsync()
        .then(selected => {
          printer.value = selected;
          result.value = `printer: ${selected.name}`;
        })
        .catch((error: Error) => {
          result.value = `select failed: ${error.message}`;
        });
    };

    const handlePrint = () => {
      result.value = 'printing…';
      printAsync({
        ...(props.form.uri.trim() === ''
          ? { html: props.form.html }
          : { uri: props.form.uri.trim() }),
        width: parseNumber(props.form.width),
        height: parseNumber(props.form.height),
        printerUrl: printer.value?.url,
        orientation: isLandscape.value
          ? Orientation.landscape
          : Orientation.portrait,
        margins: marginsOf(props.form),
      })
        .then(() => {
          result.value = 'print dialog finished';
        })
        .catch((error: Error) => {
          result.value = `print failed: ${error.message}`;
        });
    };

    return () => (
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
          value={isLandscape.value}
          onChange={next => {
            isLandscape.value = next;
          }}
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
          value={printer.value === null ? 'none' : (printer.value.url ?? 'none')}
        />
        <ActionButton
          testID="print-print-button"
          title="Print"
          onPress={handlePrint}
          color={color}
        />
        <ResultRow testID="print-result" label="Last result" value={result.value} />
      </Scenario>
    );
  },
  { name: 'PrintCard', props: ['form'] },
);

const FileCard = defineComponent<{ form: IForm }>(
  props => {
    const color = lineColorOf(ROUTE);
    const textZoom = ref('');
    const wantsBase64 = ref(false);
    const result = ref('idle');

    const handleRender = () => {
      result.value = 'rendering…';
      printToFileAsync({
        html: props.form.html,
        width: parseNumber(props.form.width),
        height: parseNumber(props.form.height),
        margins: marginsOf(props.form),
        base64: wantsBase64.value,
        textZoom: parseNumber(textZoom.value),
      })
        .then(file => {
          const base64Note =
            file.base64 === undefined
              ? ''
              : `, base64 ${file.base64.length} chars`;
          result.value = `${file.numberOfPages} page(s), ${file.uri}${base64Note}`;
        })
        .catch((error: Error) => {
          result.value = `render failed: ${error.message}`;
        });
    };

    return () => (
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
          value={textZoom.value}
          onChange={text => {
            textZoom.value = text;
          }}
          placeholder="100"
        />
        <ToggleRow
          testID="print-base64-switch"
          label="base64"
          value={wantsBase64.value}
          onChange={next => {
            wantsBase64.value = next;
          }}
          color={color}
        />
        <ActionButton
          testID="print-file-button"
          title="Render to PDF"
          onPress={handleRender}
          color={color}
        />
        <ResultRow testID="print-file-result" label="Last result" value={result.value} />
      </Scenario>
    );
  },
  { name: 'FileCard', props: ['form'] },
);

export const PrintScreen = defineComponent(
  () => {
    const form = ref<IForm>({
      html: SAMPLE_HTML,
      uri: '',
      width: '',
      height: '',
      margin: '',
    });
    const setField: ISetField = (key, value) => {
      form.value = { ...form.value, [key]: value };
    };

    return () => (
      <ScreenShell
        route={ROUTE}
        testID="print-scroll"
        title="Print"
        body="Print HTML or a PDF through AirPrint and the Android print framework, or render HTML to a PDF file. The sample receipt below works as is, and the document settings are in the explorer."
      >
        <PrintCard form={form.value} />
        <FileCard form={form.value} />
        <Explorer testID="print-explorer" color={lineColorOf(ROUTE)}>
          <DocumentCard form={form.value} setField={setField} />
        </Explorer>
      </ScreenShell>
    );
  },
  { name: 'PrintScreen' },
);
