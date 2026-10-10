// What the native host hands a runnable when it mounts a surface

import type { IRootTag } from '../fabric';

export type IAppParameters = {
  rootTag: IRootTag;
  initialProps?: object;
};
