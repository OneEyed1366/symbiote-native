import type { IIntentLauncherParams, IIntentLauncherResult } from '../types';

export type INativeIntentLauncherModule = {
  startActivity(
    activityAction: string,
    params: IIntentLauncherParams,
  ): Promise<IIntentLauncherResult>;
  openApplication(packageName: string): void;
  getApplicationIcon(packageName: string): Promise<string>;
};
