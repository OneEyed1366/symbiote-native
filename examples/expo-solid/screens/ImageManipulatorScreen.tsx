import { Show, createSignal } from 'solid-js';
import {
  FlipType,
  SaveFormat,
  manipulate,
  manipulateAsync,
  useImageManipulator,
} from '@symbiote-native/image-manipulator/solid';
import type {
  IAction,
  IImageManipulatorContext,
  IImageResult,
  ISaveOptions,
} from '@symbiote-native/image-manipulator/solid';
import { launchImageLibraryAsync } from '@symbiote-native/image-picker/solid';
import { ActionButton } from '../components/ActionButton';
import { Explorer, Scenario } from '../components/Scenario';
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

const ROUTE = ROUTE_NAME.ImageManipulator;
const color = lineColorOf(ROUTE);
const NO_FLIP = 'no flip';

type IOps = {
  resizeWidth: string;
  resizeHeight: string;
  rotate: string;
  flip: FlipType | typeof NO_FLIP;
  cropX: string;
  cropY: string;
  cropWidth: string;
  cropHeight: string;
  format: SaveFormat;
  compress: string;
  base64: boolean;
};
type ISetOps = (patch: Partial<IOps>) => void;

const INITIAL_OPS: IOps = {
  resizeWidth: '300',
  resizeHeight: '',
  rotate: '90',
  flip: NO_FLIP,
  cropX: '',
  cropY: '',
  cropWidth: '',
  cropHeight: '',
  format: SaveFormat.JPEG,
  compress: '1',
  base64: false,
};

const FLIP_CHOICES = [
  { label: NO_FLIP, value: NO_FLIP },
  { label: 'vertical', value: FlipType.Vertical },
  { label: 'horizontal', value: FlipType.Horizontal },
] as const;

const FORMAT_CHOICES = [
  { label: 'jpeg', value: SaveFormat.JPEG },
  { label: 'png', value: SaveFormat.PNG },
  { label: 'webp', value: SaveFormat.WEBP },
] as const;

function num(text: string): number | undefined {
  const value = Number(text);
  return text.trim() === '' || Number.isNaN(value) ? undefined : value;
}

function toActions(ops: IOps): IAction[] {
  const actions: IAction[] = [];
  const width = num(ops.resizeWidth);
  const height = num(ops.resizeHeight);
  if (width !== undefined || height !== undefined) {
    actions.push({ resize: { width, height } });
  }
  const rotate = num(ops.rotate);
  if (rotate !== undefined) {
    actions.push({ rotate });
  }
  if (ops.flip !== NO_FLIP) {
    actions.push({ flip: ops.flip });
  }
  const originX = num(ops.cropX);
  const originY = num(ops.cropY);
  const cropWidth = num(ops.cropWidth);
  const cropHeight = num(ops.cropHeight);
  if (
    originX !== undefined &&
    originY !== undefined &&
    cropWidth !== undefined &&
    cropHeight !== undefined
  ) {
    actions.push({
      crop: { originX, originY, width: cropWidth, height: cropHeight },
    });
  }
  return actions;
}

function toSaveOptions(ops: IOps): ISaveOptions {
  return {
    format: ops.format,
    compress: num(ops.compress),
    base64: ops.base64,
  };
}

function applyActions(
  context: IImageManipulatorContext,
  actions: IAction[],
): IImageManipulatorContext {
  return actions.reduce((current, action) => {
    if ('resize' in action) {
      return current.resize(action.resize);
    }
    if ('rotate' in action) {
      return current.rotate(action.rotate);
    }
    if ('flip' in action) {
      return current.flip(action.flip);
    }
    return current.crop(action.crop);
  }, context);
}

function OpsCard(props: { ops: IOps; setOps: ISetOps }) {
  return (
    <Card testID="image-manipulator-ops-card" title="Actions">
      <Field
        testID="image-manipulator-resize-width-input"
        label="resize.width"
        value={props.ops.resizeWidth}
        onChange={resizeWidth => props.setOps({ resizeWidth })}
      />
      <Field
        testID="image-manipulator-resize-height-input"
        label="resize.height"
        value={props.ops.resizeHeight}
        onChange={resizeHeight => props.setOps({ resizeHeight })}
      />
      <Field
        testID="image-manipulator-rotate-input"
        label="rotate (degrees)"
        value={props.ops.rotate}
        onChange={rotate => props.setOps({ rotate })}
      />
      <ChoiceRow
        testID="image-manipulator-flip"
        label="flip"
        options={FLIP_CHOICES}
        value={props.ops.flip}
        onChange={flip => props.setOps({ flip })}
        color={color}
      />
      <Field
        testID="image-manipulator-crop-x-input"
        label="crop.originX"
        value={props.ops.cropX}
        onChange={cropX => props.setOps({ cropX })}
      />
      <Field
        testID="image-manipulator-crop-y-input"
        label="crop.originY"
        value={props.ops.cropY}
        onChange={cropY => props.setOps({ cropY })}
      />
      <Field
        testID="image-manipulator-crop-width-input"
        label="crop.width"
        value={props.ops.cropWidth}
        onChange={cropWidth => props.setOps({ cropWidth })}
      />
      <Field
        testID="image-manipulator-crop-height-input"
        label="crop.height"
        value={props.ops.cropHeight}
        onChange={cropHeight => props.setOps({ cropHeight })}
      />
    </Card>
  );
}

function SaveCard(props: { ops: IOps; setOps: ISetOps }) {
  return (
    <Card testID="image-manipulator-save-card" title="Save options">
      <ChoiceRow
        testID="image-manipulator-format"
        label="format"
        options={FORMAT_CHOICES}
        value={props.ops.format}
        onChange={format => props.setOps({ format })}
        color={color}
      />
      <Field
        testID="image-manipulator-compress-input"
        label="compress (0 - 1)"
        value={props.ops.compress}
        onChange={compress => props.setOps({ compress })}
      />
      <ToggleRow
        testID="image-manipulator-base64-switch"
        label="base64"
        value={props.ops.base64}
        onChange={base64 => props.setOps({ base64 })}
        color={color}
      />
    </Card>
  );
}

function HookRunner(props: {
  source: string;
  run: (context: IImageManipulatorContext) => void;
}) {
  const context = useImageManipulator(() => props.source);
  return (
    <view class="button-row">
      <ActionButton
        testID="image-manipulator-hook-button"
        title="useImageManipulator context"
        onPress={() => props.run(context())}
        color={color}
      />
      <ActionButton
        testID="image-manipulator-reset-button"
        title="context.reset()"
        onPress={() => context().reset()}
        color={color}
      />
    </view>
  );
}

function ResultView(props: { result: IImageResult }) {
  return (
    <>
      <ResultRow
        testID="image-manipulator-size"
        label="width × height"
        value={`${props.result.width} × ${props.result.height}`}
      />
      <ResultRow testID="image-manipulator-uri" label="uri" value={props.result.uri} />
      <ResultRow
        testID="image-manipulator-base64"
        label="base64"
        value={props.result.base64 ? `${props.result.base64.length} chars` : 'not requested'}
      />
      <image
        testID="image-manipulator-image"
        source={{ uri: props.result.uri }}
        style={{ width: '100%', height: 220 }}
        resizeMode="contain"
      />
    </>
  );
}

export function ImageManipulatorScreen() {
  const [source, setSource] = createSignal('');
  const [ops, setOpsState] = createSignal<IOps>(INITIAL_OPS);
  const [status, setStatus] = createSignal('pick a source image first');
  const [result, setResult] = createSignal<IImageResult | null>(null);
  const setOps: ISetOps = patch =>
    setOpsState(previous => ({ ...previous, ...patch }));

  const fail = (error: Error) => setStatus(`failed: ${error.message}`);
  const done = (label: string) => (saved: IImageResult) => {
    setResult(saved);
    setStatus(label);
  };

  const pickSource = () => {
    launchImageLibraryAsync({ mediaTypes: ['images'] })
      .then(picked => {
        if (!picked.canceled) {
          setSource(picked.assets[0].uri);
          setStatus('source ready');
        }
      })
      .catch(fail);
  };

  const runChain = () => {
    setStatus('manipulate()…');
    applyActions(manipulate(source()), toActions(ops()))
      .renderAsync()
      .then(image => image.saveAsync(toSaveOptions(ops())))
      .then(done('manipulate().renderAsync().saveAsync()'))
      .catch(fail);
  };

  const runLegacy = () => {
    setStatus('manipulateAsync()…');
    manipulateAsync(source(), toActions(ops()), toSaveOptions(ops()))
      .then(done('manipulateAsync()'))
      .catch(fail);
  };

  const runHook = (context: IImageManipulatorContext) => {
    setStatus('hook context…');
    applyActions(context, toActions(ops()))
      .renderAsync()
      .then(image => image.saveAsync(toSaveOptions(ops())))
      .then(done('useImageManipulator().renderAsync().saveAsync()'))
      .catch(fail);
  };

  return (
    <ScreenShell
      route={ROUTE}
      testID="image-manipulator-scroll"
      title="Image Manipulator"
      body="Edit a photo on the device before it goes anywhere: resize, rotate, flip, crop and re-compress as JPEG, PNG or WEBP. Smaller uploads, no server round trip."
    >
      <Scenario
        testID="image-manipulator-source-card"
        title="Shrink and straighten a photo before upload"
        why="Phone photos are huge. Resize to 300 px wide and rotate a quarter turn on the device, so the upload is small and upright."
        steps={['Press Pick image and choose a photo', 'Press manipulate() chain', 'Compare the result size with the original']}
        expect="The result below is 300 px wide and rotated 90 degrees, with its new file URI. The deprecated manipulateAsync gives the same picture."
      >
        <ActionButton
          testID="image-manipulator-pick-button"
          title="Pick image (image-picker)"
          onPress={pickSource}
          color={color}
        />
        <Field
          testID="image-manipulator-source-input"
          label="source uri"
          value={source()}
          onChange={setSource}
          placeholder="file:///…"
        />
        <ActionButton
          testID="image-manipulator-chain-button"
          title="manipulate() chain"
          onPress={runChain}
          color={color}
        />
        <ActionButton
          testID="image-manipulator-legacy-button"
          title="manipulateAsync() (deprecated)"
          onPress={runLegacy}
          color={color}
        />
        <Show when={source() !== ''}>
          <HookRunner source={source()} run={runHook} />
        </Show>
        <ResultRow
          testID="image-manipulator-status"
          label="Status"
          value={status()}
        />
        <Show when={result()}>
          {(saved: () => IImageResult) => <ResultView result={saved()} />}
        </Show>
      </Scenario>
      <Explorer testID="image-manipulator-explorer" color={color}>
        <OpsCard ops={ops()} setOps={setOps} />
        <SaveCard ops={ops()} setOps={setOps} />
      </Explorer>
    </ScreenShell>
  );
}
