import { useCallback, useState } from 'react';
import {
  FlipType,
  SaveFormat,
  manipulate,
  manipulateAsync,
} from '@symbiote-native/image-manipulator';
import type {
  IAction,
  IImageManipulatorContext,
  IImageResult,
  ISaveOptions,
} from '@symbiote-native/image-manipulator';
import { useImageManipulator } from '@symbiote-native/image-manipulator/react';
import { launchImageLibraryAsync } from '@symbiote-native/image-picker';
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

function OpsCard({ ops, setOps }: { ops: IOps; setOps: ISetOps }) {
  return (
    <Card testID="image-manipulator-ops-card" title="Actions">
      <Field
        testID="image-manipulator-resize-width-input"
        label="resize.width"
        value={ops.resizeWidth}
        onChange={resizeWidth => setOps({ resizeWidth })}
      />
      <Field
        testID="image-manipulator-resize-height-input"
        label="resize.height"
        value={ops.resizeHeight}
        onChange={resizeHeight => setOps({ resizeHeight })}
      />
      <Field
        testID="image-manipulator-rotate-input"
        label="rotate (degrees)"
        value={ops.rotate}
        onChange={rotate => setOps({ rotate })}
      />
      <ChoiceRow
        testID="image-manipulator-flip"
        label="flip"
        options={FLIP_CHOICES}
        value={ops.flip}
        onChange={flip => setOps({ flip })}
        color={color}
      />
      <Field
        testID="image-manipulator-crop-x-input"
        label="crop.originX"
        value={ops.cropX}
        onChange={cropX => setOps({ cropX })}
      />
      <Field
        testID="image-manipulator-crop-y-input"
        label="crop.originY"
        value={ops.cropY}
        onChange={cropY => setOps({ cropY })}
      />
      <Field
        testID="image-manipulator-crop-width-input"
        label="crop.width"
        value={ops.cropWidth}
        onChange={cropWidth => setOps({ cropWidth })}
      />
      <Field
        testID="image-manipulator-crop-height-input"
        label="crop.height"
        value={ops.cropHeight}
        onChange={cropHeight => setOps({ cropHeight })}
      />
    </Card>
  );
}

function SaveCard({ ops, setOps }: { ops: IOps; setOps: ISetOps }) {
  return (
    <Card testID="image-manipulator-save-card" title="Save options">
      <ChoiceRow
        testID="image-manipulator-format"
        label="format"
        options={FORMAT_CHOICES}
        value={ops.format}
        onChange={format => setOps({ format })}
        color={color}
      />
      <Field
        testID="image-manipulator-compress-input"
        label="compress (0 - 1)"
        value={ops.compress}
        onChange={compress => setOps({ compress })}
      />
      <ToggleRow
        testID="image-manipulator-base64-switch"
        label="base64"
        value={ops.base64}
        onChange={base64 => setOps({ base64 })}
        color={color}
      />
    </Card>
  );
}

function HookRunner({
  source,
  run,
}: {
  source: string;
  run: (context: IImageManipulatorContext) => void;
}) {
  const context = useImageManipulator(source);
  return (
    <view className="button-row">
      <ActionButton
        testID="image-manipulator-hook-button"
        title="useImageManipulator context"
        onPress={() => run(context)}
        color={color}
      />
      <ActionButton
        testID="image-manipulator-reset-button"
        title="context.reset()"
        onPress={() => context.reset()}
        color={color}
      />
    </view>
  );
}

function ResultView({ result }: { result: IImageResult | null }) {
  if (result === null) {
    return null;
  }
  return (
    <>
      <ResultRow
        testID="image-manipulator-size"
        label="width × height"
        value={`${result.width} × ${result.height}`}
      />
      <ResultRow testID="image-manipulator-uri" label="uri" value={result.uri} />
      <ResultRow
        testID="image-manipulator-base64"
        label="base64"
        value={result.base64 ? `${result.base64.length} chars` : 'not requested'}
      />
      <image
        testID="image-manipulator-image"
        source={{ uri: result.uri }}
        style={{ width: '100%', height: 220 }}
        resizeMode="contain"
      />
    </>
  );
}

export function ImageManipulatorScreen() {
  const [source, setSource] = useState('');
  const [ops, setOpsState] = useState<IOps>(INITIAL_OPS);
  const [status, setStatus] = useState('pick a source image first');
  const [result, setResult] = useState<IImageResult | null>(null);
  const setOps: ISetOps = patch =>
    setOpsState(previous => ({ ...previous, ...patch }));

  const fail = (error: Error) => setStatus(`failed: ${error.message}`);
  const done = (label: string) => (saved: IImageResult) => {
    setResult(saved);
    setStatus(label);
  };

  const pickSource = useCallback(() => {
    launchImageLibraryAsync({ mediaTypes: ['images'] })
      .then(picked => {
        if (!picked.canceled) {
          setSource(picked.assets[0].uri);
          setStatus('source ready');
        }
      })
      .catch(fail);
  }, []);

  const runChain = useCallback(() => {
    setStatus('manipulate()…');
    applyActions(manipulate(source), toActions(ops))
      .renderAsync()
      .then(image => image.saveAsync(toSaveOptions(ops)))
      .then(done('manipulate().renderAsync().saveAsync()'))
      .catch(fail);
  }, [source, ops]);

  const runLegacy = useCallback(() => {
    setStatus('manipulateAsync()…');
    manipulateAsync(source, toActions(ops), toSaveOptions(ops))
      .then(done('manipulateAsync()'))
      .catch(fail);
  }, [source, ops]);

  const runHook = useCallback(
    (context: IImageManipulatorContext) => {
      setStatus('hook context…');
      applyActions(context, toActions(ops))
        .renderAsync()
        .then(image => image.saveAsync(toSaveOptions(ops)))
        .then(done('useImageManipulator().renderAsync().saveAsync()'))
        .catch(fail);
    },
    [ops],
  );

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
          value={source}
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
        {source !== '' && <HookRunner source={source} run={runHook} />}
        <ResultRow
          testID="image-manipulator-status"
          label="Status"
          value={status}
        />
        <ResultView result={result} />
      </Scenario>
      <Explorer testID="image-manipulator-explorer" color={color}>
        <OpsCard ops={ops} setOps={setOps} />
        <SaveCard ops={ops} setOps={setOps} />
      </Explorer>
    </ScreenShell>
  );
}
