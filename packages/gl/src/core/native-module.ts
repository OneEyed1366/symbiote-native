import { requireNativeModule } from 'expo-modules-core';
import { GL_MODULE_NAME } from './constants';
import type { IGLSnapshot, IGLSnapshotOptions } from './types';

export type INativeGLModule = {
  createContextAsync(): Promise<{ exglCtxId: number }>;
  destroyContextAsync(exglCtxId: number): Promise<boolean>;
  takeSnapshotAsync(
    exglCtxId: number,
    options: IGLSnapshotOptions,
  ): Promise<IGLSnapshot>;
  /** Absent where there is no camera texture support */
  createCameraTextureAsync?(
    exglCtxId: number,
    cameraTag: number,
  ): Promise<{ exglObjId: number }>;
  /** Absent where objects cannot be destroyed one by one */
  destroyObjectAsync?(exglObjId: number): Promise<boolean>;
};

export const glNativeModule =
  requireNativeModule<INativeGLModule>(GL_MODULE_NAME);
