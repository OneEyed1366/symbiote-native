import { defineComponent, ref } from 'vue';
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
  useFonts,
} from '@symbiote-native/font/vue';
import type {
  FontSource,
  IRenderToImageResult,
} from '@symbiote-native/font/vue';
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

const SOURCE_MODE = {
  string: 'string',
  number: 'number',
  fontResource: 'FontResource',
  asset: 'Asset',
} as const;
type ISourceMode = (typeof SOURCE_MODE)[keyof typeof SOURCE_MODE];
const MODES: readonly { label: string; value: ISourceMode }[] = [
  { label: 'string uri', value: SOURCE_MODE.string },
  { label: 'number (require)', value: SOURCE_MODE.number },
  { label: 'FontResource', value: SOURCE_MODE.fontResource },
  { label: 'Asset instance', value: SOURCE_MODE.asset },
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
    case SOURCE_MODE.string:
      return form.uri;
    case SOURCE_MODE.number:
      return BUNDLED_FONT_MODULE;
    case SOURCE_MODE.fontResource:
      return {
        uri: form.uri,
        display: form.display,
        testString: form.testString === '' ? undefined : form.testString,
      };
    case SOURCE_MODE.asset:
      return Asset.fromURI(form.uri);
  }
}

function SourceCard(props: { form: IForm; setForm: ISetForm }) {
  return (
    <Card testID="font-source-card" title="Font source">
      <Field
        testID="font-family-input"
        label="fontFamily"
        value={props.form.family}
        onChange={family => props.setForm({ family })}
      />
      <Field
        testID="font-uri-input"
        label="uri (remote .ttf / .otf)"
        value={props.form.uri}
        onChange={uri => props.setForm({ uri })}
      />
      <ChoiceRow
        testID="font-mode"
        label="source form"
        options={MODES}
        value={props.form.mode}
        onChange={mode => props.setForm({ mode })}
        color={color}
      />
      <ChoiceRow
        testID="font-display"
        label="FontResource.display"
        options={DISPLAYS}
        value={props.form.display}
        onChange={display => props.setForm({ display })}
        color={color}
      />
      <Field
        testID="font-test-string-input"
        label="FontResource.testString (web only)"
        value={props.form.testString}
        onChange={testString => props.setForm({ testString })}
      />
    </Card>
  );
}

const LoadCalls = defineComponent<{ form: IForm }>(
  props => {
    const preview = ref('');
    return () => (
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
                await loadAsync(props.form.family, toSource(props.form));
                preview.value = props.form.family;
                return `loaded ${props.form.family}`;
              },
            },
            {
              label: 'loadAsync({ map })',
              run: async () => {
                await loadAsync({ [props.form.family]: toSource(props.form) });
                preview.value = props.form.family;
                return `loaded ${props.form.family} via a font map`;
              },
            },
            { label: 'isLoaded', run: async () => isLoaded(props.form.family) },
            { label: 'isLoading', run: async () => isLoading(props.form.family) },
            { label: 'getLoadedFonts', run: async () => getLoadedFonts() },
            {
              label: 'unloadAsync(family)',
              run: () => unloadAsync(props.form.family, { display: props.form.display }),
            },
            { label: 'unloadAllAsync', run: () => unloadAllAsync() },
          ]}
        />
        <view testID="font-preview-card" class="console-bare">
          <text
            testID="font-preview"
            style={{
              fontFamily: preview.value === '' ? undefined : preview.value,
              fontSize: 28,
              color: '#ffffff',
            }}
          >
            {SAMPLE_TEXT}
          </text>
        </view>
      </Scenario>
    );
  },
  { name: 'LoadCalls', props: ['form'] },
);

const HookProbe = defineComponent<{ family: string; uri: string }>(
  props => {
    const fonts = useFonts({ [props.family]: props.uri });
    return () => (
      <ResultRow
        testID="font-hook-result"
        label="useFonts [loaded, error]"
        value={`${fonts.loaded.value}, ${fonts.error.value === null ? 'no error' : fonts.error.value.message}`}
      />
    );
  },
  { name: 'HookProbe', props: ['family', 'uri'] },
);

const HookCard = defineComponent<{ form: IForm }>(
  props => {
    const isMounted = ref(false);
    return () => (
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
          value={isMounted.value}
          onChange={next => {
            isMounted.value = next;
          }}
          color={color}
        />
        {isMounted.value && (
          <HookProbe family={props.form.family} uri={props.form.uri} />
        )}
      </Scenario>
    );
  },
  { name: 'HookCard', props: ['form'] },
);

function RenderedImage(props: { rendered: IRenderToImageResult }) {
  return (
    <>
      <ResultRow
        testID="font-render-size"
        label="width × height @scale"
        value={`${props.rendered.width} × ${props.rendered.height} @${props.rendered.scale}x`}
      />
      <image
        testID="font-render-image"
        source={{ uri: props.rendered.uri }}
        style={{ width: props.rendered.width, height: props.rendered.height, backgroundColor: '#1e293b' }}
      />
    </>
  );
}

const RenderCard = defineComponent<{ form: IForm }>(
  props => {
    const glyphs = ref('Aa Bb 123');
    const size = ref('48');
    const textColor = ref('#ffffff');
    const lineHeight = ref('');
    const image = ref<IRenderToImageResult | null>(null);
    const status = ref('idle');

    const render = () => {
      status.value = 'rendering…';
      renderToImageAsync(glyphs.value, {
        fontFamily: props.form.family,
        size: Number(size.value),
        color: textColor.value,
        lineHeight: lineHeight.value === '' ? undefined : Number(lineHeight.value),
      })
        .then(result => {
          image.value = result;
          status.value = 'done';
        })
        .catch((error: Error) => {
          status.value = `failed: ${error.message}`;
        });
    };

    return () => (
      <Scenario
        testID="font-render-card"
        title="Render text with a font into a picture"
        why="Produce a bitmap of a word or a few glyphs, for share cards, watermarks or icon-font previews, without laying it out on screen first."
        steps={['Press renderToImageAsync with the sample glyphs', 'Change the glyphs, size or color and press again']}
        expect="An image of the glyphs appears with its width, height and scale. Loading the font first makes it use that typeface."
      >
        <Field testID="font-glyphs-input" label="glyphs" value={glyphs.value} onChange={text => { glyphs.value = text; }} />
        <Field testID="font-size-input" label="size" value={size.value} onChange={text => { size.value = text; }} />
        <Field testID="font-color-input" label="color" value={textColor.value} onChange={text => { textColor.value = text; }} />
        <Field testID="font-line-height-input" label="lineHeight" value={lineHeight.value} onChange={text => { lineHeight.value = text; }} />
        <ActionButton
          testID="font-render-button"
          title="renderToImageAsync"
          onPress={render}
          color={color}
        />
        <ResultRow testID="font-render-status" label="Status" value={status.value} />
        {image.value !== null && <RenderedImage rendered={image.value} />}
      </Scenario>
    );
  },
  { name: 'RenderCard', props: ['form'] },
);

export const FontScreen = defineComponent(
  () => {
    const form = ref<IForm>({
      family: 'Pacifico',
      uri: SAMPLE_URI,
      mode: SOURCE_MODE.string,
      display: FontDisplay.AUTO,
      testString: '',
    });
    const setForm: ISetForm = patch => {
      form.value = { ...form.value, ...patch };
    };

    return () => (
      <ScreenShell
        route={ROUTE}
        testID="font-scroll"
        title="Font"
        body="Bring your own typefaces: load custom fonts at runtime from a URL, a bundled file or an Asset, use them by family name and render glyphs to an image."
      >
        <LoadCalls form={form.value} />
        <HookCard form={form.value} />
        <RenderCard form={form.value} />
        <Explorer testID="font-explorer" color={color}>
          <SourceCard form={form.value} setForm={setForm} />
        </Explorer>
      </ScreenShell>
    );
  },
  { name: 'FontScreen' },
);
