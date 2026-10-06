import {
  Platform,
  UnavailabilityError,
  requireNativeViewManager,
} from 'expo-modules-core';
import { el } from '@symbiote-native/components';
import type { IDescriptor } from '@symbiote-native/components';
import {
  defineExpoNativeView,
  getNativeTag,
  isDevBuild,
  isSymbioteNode,
} from '@symbiote-native/engine';
import type { ISymbioteEvent, ISymbioteNode } from '@symbiote-native/engine';
import { GL_MODULE_NAME, GL_PACKAGE_NAME } from './constants';
import { getGl, takeSnapshotAsync, unregisterGLContext } from './gl-context';
import { glNativeModule } from './native-module';
import type {
  IGLNodeOrTag,
  IGLObject,
  IGLSnapshotOptions,
  IGLViewHandle,
  IGLViewProps,
} from './types';

// Registered on render: a barrel side effect is lost in a release build
const glView = defineExpoNativeView(requireNativeViewManager, GL_MODULE_NAME);

export const glViewName = glView.name;

export const ensureGLViewRegistered = glView.ensureRegistered;

const DEFAULT_MSAA_SAMPLES = 4;

export type IGLView = {
  handle: IGLViewHandle;
  /** `null` means the view cannot register and the caller renders nothing */
  render(props: object): IDescriptor | null;
  /** Forgets the context of the surface, called when the view unmounts */
  dispose(): void;
};

type IGetNode = () => ISymbioteNode | null | undefined;

function isSurfaceCreated(value: unknown): value is { exglCtxId: number } {
  return typeof Reflect.get(Object(value), 'exglCtxId') === 'number';
}

function isContextCallback(
  value: unknown,
): value is IGLViewProps['onContextCreate'] {
  return typeof value === 'function';
}

// Adapters hand over the props they hold, a missing callback is a view nobody listens to
function toViewProps(props: object): IGLViewProps {
  const onContextCreate: unknown = Reflect.get(props, 'onContextCreate');
  return {
    ...props,
    onContextCreate: isContextCallback(onContextCreate)
      ? onContextCreate
      : () => undefined,
  };
}

function nativeTagOf(camera: IGLNodeOrTag): number {
  const tag = isSymbioteNode(camera) ? getNativeTag(camera) : camera;
  if (typeof tag !== 'number')
    throw new Error('The camera view has no native tag yet');
  return tag;
}

/** One per mounted view, `getNode` is kept for the shape the adapters share */
export function createGLView(_getNode: IGetNode): IGLView {
  let exglCtxId: number | undefined;
  let latestProps: IGLViewProps | undefined;
  let hasWorkletSupport: boolean | undefined;

  const onSurfaceCreate = (event: ISymbioteEvent): void => {
    if (!isSurfaceCreated(event.nativeEvent)) return;
    exglCtxId = event.nativeEvent.exglCtxId;
    latestProps?.onContextCreate(getGl(exglCtxId));
  };

  function warnOnWorkletChange(enabled: boolean): void {
    if (hasWorkletSupport !== undefined && hasWorkletSupport !== enabled) {
      console.warn(
        'Updating prop enableExperimentalWorkletSupport is not supported',
      );
    }
    hasWorkletSupport = enabled;
  }

  const handle: IGLViewHandle = {
    get exglCtxId() {
      return exglCtxId;
    },
    async createCameraTextureAsync(camera) {
      if (!glNativeModule.createCameraTextureAsync) {
        throw new UnavailabilityError(
          GL_PACKAGE_NAME,
          'createCameraTextureAsync',
        );
      }
      if (!exglCtxId) throw new Error("GLView's surface is not created yet!");
      const { exglObjId } = await glNativeModule.createCameraTextureAsync(
        exglCtxId,
        nativeTagOf(camera),
      );
      const texture: WebGLTexture = { id: exglObjId };
      return texture;
    },
    async destroyObjectAsync(glObject: IGLObject) {
      if (!glNativeModule.destroyObjectAsync) {
        throw new UnavailabilityError(GL_PACKAGE_NAME, 'destroyObjectAsync');
      }
      return glNativeModule.destroyObjectAsync(glObject.id);
    },
    takeSnapshotAsync: (options?: IGLSnapshotOptions) =>
      takeSnapshotAsync(exglCtxId, options),
  };

  return {
    handle,
    dispose: () => {
      if (exglCtxId) unregisterGLContext(exglCtxId);
    },
    render: props => {
      if (!ensureGLViewRegistered()) {
        if (isDevBuild()) console.warn("'GLView' is not available.");
        return null;
      }
      latestProps = toViewProps(props);
      const {
        onContextCreate,
        msaaSamples = DEFAULT_MSAA_SAMPLES,
        enableExperimentalWorkletSupport = false,
        ...viewProps
      } = latestProps;
      warnOnWorkletChange(enableExperimentalWorkletSupport);
      return el('view', viewProps, [
        el(glViewName(), {
          style: {
            flex: 1,
            ...Platform.select({
              ios: { backgroundColor: 'transparent' },
              default: {},
            }),
          },
          onSurfaceCreate,
          enableExperimentalWorkletSupport,
          msaaSamples: Platform.select({
            ios: msaaSamples,
            default: undefined,
          }),
        }),
      ]);
    },
  };
}
