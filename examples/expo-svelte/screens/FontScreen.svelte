<script lang="ts">
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
  } from '@symbiote-native/font/svelte';
  import type {
    FontSource,
    IRenderToImageResult,
  } from '@symbiote-native/font/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import ChoiceRow from '../components/ChoiceRow.svelte';
  import Explorer from '../components/Explorer.svelte';
  import Field from '../components/Field.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import Scenario from '../components/Scenario.svelte';
  import ScreenShell from '../components/ScreenShell.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import FontHookProbe from './FontHookProbe.svelte';

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

  let family = $state('Pacifico');
  let uri = $state(SAMPLE_URI);
  let mode = $state<ISourceMode>(SOURCE_MODE.string);
  let display = $state<FontDisplay>(FontDisplay.AUTO);
  let testString = $state('');
  let preview = $state('');
  let isHookMounted = $state(false);
  let glyphs = $state('Aa Bb 123');
  let size = $state('48');
  let textColor = $state('#ffffff');
  let lineHeight = $state('');
  let image = $state<IRenderToImageResult | null>(null);
  let status = $state('idle');

  function toSource(): FontSource {
    switch (mode) {
      case SOURCE_MODE.string:
        return uri;
      case SOURCE_MODE.number:
        return BUNDLED_FONT_MODULE;
      case SOURCE_MODE.fontResource:
        return {
          uri,
          display,
          testString: testString === '' ? undefined : testString,
        };
      case SOURCE_MODE.asset:
        return Asset.fromURI(uri);
    }
  }

  function render(): void {
    status = 'rendering…';
    renderToImageAsync(glyphs, {
      fontFamily: family,
      size: Number(size),
      color: textColor,
      lineHeight: lineHeight === '' ? undefined : Number(lineHeight),
    })
      .then(result => {
        image = result;
        status = 'done';
      })
      .catch((error: Error) => {
        status = `failed: ${error.message}`;
      });
  }
</script>

<ScreenShell
  route={ROUTE}
  testID="font-scroll"
  title="Font"
  body="Bring your own typefaces: load custom fonts at runtime from a URL, a bundled file or an Asset, use them by family name and render glyphs to an image."
>
  <Scenario
    testID="font-load-scenario"
    title="Use a brand font without bundling it into the native project"
    why="Load a custom typeface at runtime from a URL, a bundled file or an Asset, then use its family name in any text style. No native font files or Info.plist entries to maintain."
    steps={[
      'Press loadAsync(family, source) (Pacifico from a URL is preset)',
      'Look at the preview text below',
    ]}
    expect="The preview text switches to Pacifico and isLoaded reports true. Switch the source form to number (require) in the explorer to load the bundled file instead."
  >
    <CallConsole
      isBare
      prefix="font-load"
      title="Load and inspect"
      {color}
      hint="unloadAsync and unloadAllAsync always throw UnavailabilityError on native, ExpoFontLoader has no unload method there."
      calls={[
        {
          label: 'loadAsync(family, source)',
          run: async () => {
            await loadAsync(family, toSource());
            preview = family;
            return `loaded ${family}`;
          },
        },
        {
          label: 'loadAsync({ map })',
          run: async () => {
            await loadAsync({ [family]: toSource() });
            preview = family;
            return `loaded ${family} via a font map`;
          },
        },
        { label: 'isLoaded', run: async () => isLoaded(family) },
        { label: 'isLoading', run: async () => isLoading(family) },
        { label: 'getLoadedFonts', run: async () => getLoadedFonts() },
        {
          label: 'unloadAsync(family)',
          run: () => unloadAsync(family, { display }),
        },
        { label: 'unloadAllAsync', run: () => unloadAllAsync() },
      ]}
    />
    <view testID="font-preview-card" class="console-bare">
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
      value={isHookMounted}
      onChange={next => {
        isHookMounted = next;
      }}
      {color}
    />
    {#if isHookMounted}
      <FontHookProbe {family} {uri} />
    {/if}
  </Scenario>

  <Scenario
    testID="font-render-card"
    title="Render text with a font into a picture"
    why="Produce a bitmap of a word or a few glyphs, for share cards, watermarks or icon-font previews, without laying it out on screen first."
    steps={[
      'Press renderToImageAsync with the sample glyphs',
      'Change the glyphs, size or color and press again',
    ]}
    expect="An image of the glyphs appears with its width, height and scale. Loading the font first makes it use that typeface."
  >
    <Field testID="font-glyphs-input" label="glyphs" value={glyphs} onChange={next => { glyphs = next; }} />
    <Field testID="font-size-input" label="size" value={size} onChange={next => { size = next; }} />
    <Field testID="font-color-input" label="color" value={textColor} onChange={next => { textColor = next; }} />
    <Field testID="font-line-height-input" label="lineHeight" value={lineHeight} onChange={next => { lineHeight = next; }} />
    <ActionButton testID="font-render-button" title="renderToImageAsync" onPress={render} {color} />
    <ResultRow testID="font-render-status" label="Status" value={status} />
    {#if image}
      <ResultRow
        testID="font-render-size"
        label="width × height @scale"
        value={`${image.width} × ${image.height} @${image.scale}x`}
      />
      <image
        testID="font-render-image"
        source={{ uri: image.uri }}
        style={{ width: image.width, height: image.height, backgroundColor: '#1e293b' }}
      ></image>
    {/if}
  </Scenario>

  <Explorer testID="font-explorer" {color}>
    <Card testID="font-source-card" title="Font source">
      <Field testID="font-family-input" label="fontFamily" value={family} onChange={next => { family = next; }} />
      <Field testID="font-uri-input" label="uri (remote .ttf / .otf)" value={uri} onChange={next => { uri = next; }} />
      <ChoiceRow
        testID="font-mode"
        label="source form"
        options={MODES}
        value={mode}
        onChange={next => {
          mode = next;
        }}
        {color}
      />
      <ChoiceRow
        testID="font-display"
        label="FontResource.display"
        options={DISPLAYS}
        value={display}
        onChange={next => {
          display = next;
        }}
        {color}
      />
      <Field
        testID="font-test-string-input"
        label="FontResource.testString (web only)"
        value={testString}
        onChange={next => {
          testString = next;
        }}
      />
    </Card>
  </Explorer>
</ScreenShell>
