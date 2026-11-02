import type { App, Ref } from 'vue';
import { DIRECT_PROVIDE_KEY } from '../../components/playground/provide-keys';
import { appendLimited } from './log';

const LOG_LIMIT = 6;

type IGlobalApiLogs = {
  mixinMounts: Ref<string[]>;
  appHandlers: Ref<string[]>;
};

// `app.mixin()` adds a mixin on every call, so a screen remount would stack copies and fire
// "mounted" once per copy, the module-level flag makes the install happen once per app
let isInstalled = false;

function textOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function installGlobalApi(app: App, logs: IGlobalApiLogs): void {
  if (isInstalled) return;
  isInstalled = true;
  app.config.globalProperties.$playgroundGreeting =
    'hi from app.config.globalProperties';
  app.mixin({
    mounted() {
      appendLimited(
        logs.mixinMounts,
        `app.mixin: "${this.$options.name ?? 'anonymous'}" mounted`,
        LOG_LIMIT,
      );
    },
  });
  app.provide(DIRECT_PROVIDE_KEY, 'value-from-direct-app.provide()');
  app.config.errorHandler = error =>
    appendLimited(
      logs.appHandlers,
      `app.config.errorHandler: ${textOf(error)}`,
      LOG_LIMIT,
    );
  app.config.warnHandler = message =>
    appendLimited(
      logs.appHandlers,
      `app.config.warnHandler: ${message}`,
      LOG_LIMIT,
    );
}
