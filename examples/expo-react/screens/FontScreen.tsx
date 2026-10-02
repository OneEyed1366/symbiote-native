import { useState } from 'react';
import { Asset } from '@symbiote-native/asset';
import {
  FontDisplay,
  getLoadedFonts,
  isLoaded,
  isLoading,
  loadAsync,
  renderToImageAsync,
  unloadAllAsync,
  unloadAsync,
} from '@symbiote-native/font';
import type {
  FontSource,
  IRenderToImageResult,
} from '@symbiote-native/font';
import { useFonts } from '@symbiote-native/font/react';
import { ActionButton } from '../components/ActionButton';
import { Explorer, Scenario } from '../components/Scenario';
import { CallConsole } from '../components/CallConsole';
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

const ROUTE = ROUTE_NAME.Font;
const color = lineColorOf(ROUTE);
const SAMPLE_URI =
  'https://raw.githubusercontent.com/google/fonts/main/ofl/pacifico/Pacifico-Regular.ttf';
const SAMPLE_TEXT = 'Symbiote 0123 The quick brown fox';

const BUNDLED_FONT_MODULE = require('../assets/Pacifico-Regular.ttf');

type ISourceMode = 'string' | 'number' | 'FontResource' | 'Asset';
const MODES: readonly { label: string; value: ISourceMode }[] = [
  { label: 'string uri', value: 'string' },
  { label: 'number (require)', value: 'number' },
  { label: 'FontResource', value: 'FontResource' },
  { label: 'Asset instance', value: 'Asset' },
];
const DISPLAYS = Object.values(FontDisplay).map(value => ({
  label: value,
  value,
}));

type IForm = {
  family: string;
  uri: string;
  mode: ISourceMode;
  display: FontDisplay;
  testString: string;
};
type ISetForm = (patch: Partial<IForm>) => void;

function toSource(form: IForm): FontSource {
  switch (form.mode) {
    case 'string':
      return form.uri;
    case 'number':
      return BUNDLED_FONT_MODULE;
    case 'FontResource':
      return {
        uri: form.uri,
        display: form.display,
        testString: form.testString === '' ? undefined : form.testString,
      };
    case 'Asset':
      return Asset.fromURI(form.uri);
  }
}

function SourceCard({ form, setForm }: { form: IForm; setForm: ISetForm }) {
  return (
    <Card testID="font-source-card" title="Font source">
      <Field
        testID="font-family-input"
        label="fontFamily"
        value={form.family}
        onChange={family => setForm({ family })}
      />
      <Field
        testID="font-uri-input"
        label="uri (remote .ttf / .otf)"
        value={form.uri}
        onChange={uri => setForm({ uri })}
      />
      <ChoiceRow
        testID="font-mode"
        label="source form"
        options={MODES}
        value={form.mode}
        onChange={mode => setForm({ mode })}
        color={color}
      />
      <ChoiceRow
        testID="font-display"
        label="FontResource.display"
        options={DISPLAYS}
        value={form.display}
        onChange={display => setForm({ display })}
        color={color}
      />
      <Field
        testID="font-test-string-input"
        label="FontResource.testString (web only)"
        value={form.testString}
        onChange={testString => setForm({ testString })}
      />
    </Card>
  );
}

function LoadCalls({ form }: { form: IForm }) {
  const [preview, setPreview] = useState('');
  return (
    <Scenario
      testID="font-load-scenario"
      title="Use a brand font without bundling it into the native project"
      why="Load a custom typeface at runtime from a URL, a bundled file or an Asset, then use its family name in any text style. No native font files or Info.plist entries to maintain."
      steps={['Press loadAsync(family, source) (Pacifico from a URL is preset)', 'Look at the preview text below']}
      expect="The preview text switches to Pacifico and isLoaded reports true. Switch the source form to number (require) in the explorer to load the bundled file instead."
    >
      <CallConsole
        isBare
        prefix="font-load"
        title="Load and inspect"
        color={color}
        hint="unloadAsync and unloadAllAsync always throw UnavailabilityError on native, ExpoFontLoader has no unload method there."
        calls={[
          {
            label: 'loadAsync(family, source)',
            run: async () => {
              await loadAsync(form.family, toSource(form));
              setPreview(form.family);
              return `loaded ${form.family}`;
            },
          },
          {
            label: 'loadAsync({ map })',
            run: async () => {
              await loadAsync({ [form.family]: toSource(form) });
              setPreview(form.family);
              return `loaded ${form.family} via a font map`;
            },
          },
          { label: 'isLoaded', run: async () => isLoaded(form.family) },
          { label: 'isLoading', run: async () => isLoading(form.family) },
          { label: 'getLoadedFonts', run: async () => getLoadedFonts() },
          {
            label: 'unloadAsync(family)',
            run: () => unloadAsync(form.family, { display: form.display }),
          },
          { label: 'unloadAllAsync', run: () => unloadAllAsync() },
        ]}
      />
      <view testID="font-preview-card" className="console-bare">
        <text
          testID="font-preview"
          style={{
            fontFamily: preview === '' ? undefined : preview,
            fontSize: 28,
            color: '#ffffff',
          }}
        >
          {SAMPLE_TEXT}
        </text>
      </view>
    </Scenario>
  );
}

function HookProbe({ family, uri }: { family: string; uri: string }) {
  const [loaded, error] = useFonts({ [family]: uri });
  return (
    <ResultRow
      testID="font-hook-result"
      label="useFonts [loaded, error]"
      value={`${loaded}, ${error === null ? 'no error' : error.message}`}
    />
  );
}

function HookCard({ form }: { form: IForm }) {
  const [isMounted, setIsMounted] = useState(false);
  return (
    <Scenario
      testID="font-hook-card"
      title="Load fonts when a screen mounts"
      why="Declare the fonts a screen needs with one hook and get a loaded flag and an error, instead of wiring promises by hand."
      steps={['Turn the switch on', 'Watch the result row']}
      expect="The row reads true with no error once the font is ready, or false with the failure message."
    >
      <ToggleRow
        testID="font-hook-switch"
        label="mount a component calling useFonts(map)"
        value={isMounted}
        onChange={setIsMounted}
        color={color}
      />
      {isMounted && <HookProbe family={form.family} uri={form.uri} />}
    </Scenario>
  );
}

function RenderCard({ form }: { form: IForm }) {
  const [glyphs, setGlyphs] = useState('Aa Bb 123');
  const [size, setSize] = useState('48');
  const [textColor, setTextColor] = useState('#ffffff');
  const [lineHeight, setLineHeight] = useState('');
  const [image, setImage] = useState<IRenderToImageResult | null>(null);
  const [status, setStatus] = useState('idle');

  const render = () => {
    setStatus('rendering…');
    renderToImageAsync(glyphs, {
      fontFamily: form.family,
      size: Number(size),
      color: textColor,
      lineHeight: lineHeight === '' ? undefined : Number(lineHeight),
    })
      .then(result => {
        setImage(result);
        setStatus('done');
      })
      .catch((error: Error) => setStatus(`failed: ${error.message}`));
  };

  return (
    <Scenario
      testID="font-render-card"
      title="Render text with a font into a picture"
      why="Produce a bitmap of a word or a few glyphs, for share cards, watermarks or icon-font previews, without laying it out on screen first."
      steps={['Press renderToImageAsync with the sample glyphs', 'Change the glyphs, size or color and press again']}
      expect="An image of the glyphs appears with its width, height and scale. Loading the font first makes it use that typeface."
    >
      <Field testID="font-glyphs-input" label="glyphs" value={glyphs} onChange={setGlyphs} />
      <Field testID="font-size-input" label="size" value={size} onChange={setSize} />
      <Field testID="font-color-input" label="color" value={textColor} onChange={setTextColor} />
      <Field testID="font-line-height-input" label="lineHeight" value={lineHeight} onChange={setLineHeight} />
      <ActionButton
        testID="font-render-button"
        title="renderToImageAsync"
        onPress={render}
        color={color}
      />
      <ResultRow testID="font-render-status" label="Status" value={status} />
      {image !== null && (
        <>
          <ResultRow
            testID="font-render-size"
            label="width × height @scale"
            value={`${image.width} × ${image.height} @${image.scale}x`}
          />
          <image
            testID="font-render-image"
            source={{ uri: image.uri }}
            style={{ width: image.width, height: image.height, backgroundColor: '#1e293b' }}
          />
        </>
      )}
    </Scenario>
  );
}

export function FontScreen() {
  const [form, setFormState] = useState<IForm>({
    family: 'Pacifico',
    uri: SAMPLE_URI,
    mode: 'string',
    display: FontDisplay.AUTO,
    testString: '',
  });
  const setForm: ISetForm = patch =>
    setFormState(previous => ({ ...previous, ...patch }));

  return (
    <ScreenShell
      route={ROUTE}
      testID="font-scroll"
      title="Font"
      body="Bring your own typefaces: load custom fonts at runtime from a URL, a bundled file or an Asset, use them by family name and render glyphs to an image."
    >
      <LoadCalls form={form} />
      <HookCard form={form} />
      <RenderCard form={form} />
      <Explorer testID="font-explorer" color={color}>
        <SourceCard form={form} setForm={setForm} />
      </Explorer>
    </ScreenShell>
  );
}
