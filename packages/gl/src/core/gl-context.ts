import { CodedError } from 'expo-modules-core';
import { GL_CONTEXTS_GLOBAL } from './constants';
import { configureLogging } from './gl-utils';
import { glNativeModule } from './native-module';
import type {
  IExpoWebGLRenderingContext,
  IGLSnapshot,
  IGLSnapshotOptions,
} from './types';
import { createWorkletContextManager } from './worklet-context-manager';

const workletContextManager = createWorkletContextManager();

function isContext(value: unknown): value is IExpoWebGLRenderingContext {
  return typeof value === 'object' && value !== null;
}

/** The context of a worklet, `exgl` has to be created with worklet support */
export function getWorkletContext(
  contextId: number,
): IExpoWebGLRenderingContext | undefined {
  'worklet';
  return workletContextManager.getContext(contextId);
}

export function unregisterGLContext(exglCtxId: number): void {
  const contexts: unknown = Reflect.get(globalThis, GL_CONTEXTS_GLOBAL);
  if (contexts) Reflect.deleteProperty(Object(contexts), String(exglCtxId));
  workletContextManager.unregister?.(exglCtxId);
}

/** The GL interface of a context id the native side created */
export function getGl(exglCtxId: number): IExpoWebGLRenderingContext {
  const contexts: unknown = Reflect.get(globalThis, GL_CONTEXTS_GLOBAL);
  if (!contexts) {
    throw new CodedError(
      'ERR_GL_NOT_AVAILABLE',
      'GL is currently not available. (Have you enabled remote debugging? GL is not available while debugging remotely.)',
    );
  }
  const gl: unknown = Reflect.get(Object(contexts), String(exglCtxId));
  if (!isContext(gl))
    throw new Error(`There is no EXGLContext with id ${exglCtxId}`);
  configureLogging(gl);
  return gl;
}

export function getContextId(
  exgl?: IExpoWebGLRenderingContext | number,
): number {
  const exglCtxId = exgl && typeof exgl === 'object' ? exgl.contextId : exgl;
  if (!exglCtxId || typeof exglCtxId !== 'number') {
    throw new Error(`Invalid EXGLContext id: ${String(exglCtxId)}`);
  }
  return exglCtxId;
}

/** A context with no view, which does not present its framebuffer, take a snapshot to see it */
export async function createContextAsync(): Promise<IExpoWebGLRenderingContext> {
  const { exglCtxId } = await glNativeModule.createContextAsync();
  return getGl(exglCtxId);
}

/** For a headless context made by `createContextAsync` */
export async function destroyContextAsync(
  exgl?: IExpoWebGLRenderingContext | number,
): Promise<boolean> {
  const exglCtxId = getContextId(exgl);
  unregisterGLContext(exglCtxId);
  return glNativeModule.destroyContextAsync(exglCtxId);
}

/** Saves the framebuffer as a file in the cache directory of the app */
export async function takeSnapshotAsync(
  exgl?: IExpoWebGLRenderingContext | number,
  options: IGLSnapshotOptions = {},
): Promise<IGLSnapshot> {
  return glNativeModule.takeSnapshotAsync(getContextId(exgl), options);
}
