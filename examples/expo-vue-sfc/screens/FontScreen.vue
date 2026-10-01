<script setup lang="ts">
import { ref } from 'vue';
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
} from '@symbiote-native/font/vue';
import type { FontSource, IRenderToImageResult } from '@symbiote-native/font/vue';
import ActionButton from '../components/ActionButton.vue';
import CallConsole from '../components/CallConsole.vue';
import Card from '../components/Card.vue';
import ChoiceRow from '../components/ChoiceRow.vue';
import Explorer from '../components/Explorer.vue';
import Field from '../components/Field.vue';
import ResultRow from '../components/ResultRow.vue';
import Scenario from '../components/Scenario.vue';
import ScreenShell from '../components/ScreenShell.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import FontHookProbe from './FontHookProbe.vue';

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

const family = ref('Pacifico');
const uri = ref(SAMPLE_URI);
const mode = ref<ISourceMode>(SOURCE_MODE.string);
const display = ref<FontDisplay>(FontDisplay.AUTO);
const testString = ref('');
const preview = ref('');
const isHookMounted = ref(false);
const glyphs = ref('Aa Bb 123');
const size = ref('48');
const textColor = ref('#ffffff');
const lineHeight = ref('');
const image = ref<IRenderToImageResult | null>(null);
const status = ref('idle');

function toSource(): FontSource {
  switch (mode.value) {
    case SOURCE_MODE.string:
      return uri.value;
    case SOURCE_MODE.number:
      return BUNDLED_FONT_MODULE;
    case SOURCE_MODE.fontResource:
      return {
        uri: uri.value,
        display: display.value,
        testString: testString.value === '' ? undefined : testString.value,
      };
    case SOURCE_MODE.asset:
      return Asset.fromURI(uri.value);
  }
}

function render(): void {
  status.value = 'rendering…';
  renderToImageAsync(glyphs.value, {
    fontFamily: family.value,
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
}

const loadCalls = [
  {
    label: 'loadAsync(family, source)',
    run: async () => {
      await loadAsync(family.value, toSource());
      preview.value = family.value;
      return `loaded ${family.value}`;
    },
  },
  {
    label: 'loadAsync({ map })',
    run: async () => {
      await loadAsync({ [family.value]: toSource() });
      preview.value = family.value;
      return `loaded ${family.value} via a font map`;
    },
  },
  { label: 'isLoaded', run: async () => isLoaded(family.value) },
  { label: 'isLoading', run: async () => isLoading(family.value) },
  { label: 'getLoadedFonts', run: async () => getLoadedFonts() },
  {
    label: 'unloadAsync(family)',
    run: () => unloadAsync(family.value, { display: display.value }),
  },
  { label: 'unloadAllAsync', run: () => unloadAllAsync() },
];
</script>

<template>
  <ScreenShell
    :route="ROUTE"
    testID="font-scroll"
    title="Font"
    body="Bring your own typefaces: load custom fonts at runtime from a URL, a bundled file or an Asset, use them by family name and render glyphs to an image."
  >
    <Scenario
      testID="font-load-scenario"
      title="Use a brand font without bundling it into the native project"
      why="Load a custom typeface at runtime from a URL, a bundled file or an Asset, then use its family name in any text style. No native font files or Info.plist entries to maintain."
      :steps="[
        'Press loadAsync(family, source) (Pacifico from a URL is preset)',
        'Look at the preview text below',
      ]"
      expect="The preview text switches to Pacifico and isLoaded reports true. Switch the source form to number (require) in the explorer to load the bundled file instead."
    >
      <CallConsole
        isBare
        prefix="font-load"
        title="Load and inspect"
        :color="color"
        hint="unloadAsync and unloadAllAsync always throw UnavailabilityError on native, ExpoFontLoader has no unload method there."
        :calls="loadCalls"
      />
      <view testID="font-preview-card" class="console-bare">
        <text
          testID="font-preview"
          :style="{
            fontFamily: preview === '' ? undefined : preview,
            fontSize: 28,
            color: '#ffffff',
          }"
        >
          {{ SAMPLE_TEXT }}
        </text>
      </view>
    </Scenario>

    <Scenario
      testID="font-hook-card"
      title="Load fonts when a screen mounts"
      why="Declare the fonts a screen needs with one hook and get a loaded flag and an error, instead of wiring promises by hand."
      :steps="['Turn the switch on', 'Watch the result row']"
      expect="The row reads true with no error once the font is ready, or false with the failure message."
    >
      <ToggleRow
        testID="font-hook-switch"
        label="mount a component calling useFonts(map)"
        :value="isHookMounted"
        :onChange="next => (isHookMounted = next)"
        :color="color"
      />
      <FontHookProbe v-if="isHookMounted" :family="family" :uri="uri" />
    </Scenario>

    <Scenario
      testID="font-render-card"
      title="Render text with a font into a picture"
      why="Produce a bitmap of a word or a few glyphs, for share cards, watermarks or icon-font previews, without laying it out on screen first."
      :steps="[
        'Press renderToImageAsync with the sample glyphs',
        'Change the glyphs, size or color and press again',
      ]"
      expect="An image of the glyphs appears with its width, height and scale. Loading the font first makes it use that typeface."
    >
      <Field testID="font-glyphs-input" label="glyphs" :value="glyphs" :onChange="next => (glyphs = next)" />
      <Field testID="font-size-input" label="size" :value="size" :onChange="next => (size = next)" />
      <Field
        testID="font-color-input"
        label="color"
        :value="textColor"
        :onChange="next => (textColor = next)"
      />
      <Field
        testID="font-line-height-input"
        label="lineHeight"
        :value="lineHeight"
        :onChange="next => (lineHeight = next)"
      />
      <ActionButton
        testID="font-render-button"
        title="renderToImageAsync"
        :onPress="render"
        :color="color"
      />
      <ResultRow testID="font-render-status" label="Status" :value="status" />
      <template v-if="image">
        <ResultRow
          testID="font-render-size"
          label="width × height @scale"
          :value="`${image.width} × ${image.height} @${image.scale}x`"
        />
        <image
          testID="font-render-image"
          :source="{ uri: image.uri }"
          :style="{ width: image.width, height: image.height, backgroundColor: '#1e293b' }"
        ></image>
      </template>
    </Scenario>

    <Explorer testID="font-explorer" :color="color">
      <Card testID="font-source-card" title="Font source">
        <Field
          testID="font-family-input"
          label="fontFamily"
          :value="family"
          :onChange="next => (family = next)"
        />
        <Field
          testID="font-uri-input"
          label="uri (remote .ttf / .otf)"
          :value="uri"
          :onChange="next => (uri = next)"
        />
        <ChoiceRow
          testID="font-mode"
          label="source form"
          :options="MODES"
          :value="mode"
          :onChange="next => (mode = next)"
          :color="color"
        />
        <ChoiceRow
          testID="font-display"
          label="FontResource.display"
          :options="DISPLAYS"
          :value="display"
          :onChange="next => (display = next)"
          :color="color"
        />
        <Field
          testID="font-test-string-input"
          label="FontResource.testString (web only)"
          :value="testString"
          :onChange="next => (testString = next)"
        />
      </Card>
    </Explorer>
  </ScreenShell>
</template>
