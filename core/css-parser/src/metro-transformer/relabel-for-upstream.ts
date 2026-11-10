// Transformers relabel `Home.vue` as `Home.vue.tsx` so the preset strips TypeScript
// The worklets plugin reads its input by that name for a source map, and no such file is on disk
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { isRecord } from '../lightning/value-readers.ts';
import type { IMetroTransformParams } from './index.ts';

const WORKLETS_PLUGIN = 'react-native-worklets/plugin';

type IPluginEntry = [string, Record<string, unknown>];

type IBabelCore = {
  loadPartialConfigSync: (options: Record<string, unknown>) => {
    options: { plugins?: unknown[] };
  } | null;
};

// `@babel/core` is not our dependency, it is the one RN's own transformer loads
function babelCore(): IBabelCore {
  const own = createRequire(import.meta.url);
  return createRequire(own.resolve('@react-native/metro-babel-transformer'))(
    '@babel/core',
  );
}

function resolveFrom(projectRoot: string, request: string): string | undefined {
  try {
    return createRequire(join(projectRoot, 'noop.js')).resolve(request);
  } catch {
    return undefined;
  }
}

// The entry as the app configured it, so the options it gave survive
function workletsEntry(
  projectRoot: string,
  filename: string,
  dev: boolean,
): IPluginEntry | undefined {
  const resolved = resolveFrom(projectRoot, WORKLETS_PLUGIN);
  if (resolved === undefined) return undefined;
  const loaded = babelCore().loadPartialConfigSync({
    cwd: projectRoot,
    filename,
    envName: dev ? 'development' : process.env.BABEL_ENV || 'production',
    caller: { name: 'metro', bundler: 'metro' },
  });
  const configured = loaded?.options.plugins?.find(
    item =>
      isRecord(item) && isRecord(item.file) && item.file.resolved === resolved,
  );
  if (!isRecord(configured)) return undefined;
  const own = isRecord(configured.options) ? configured.options : {};
  return [resolved, { ...own, disableSourceMaps: true }];
}

export function relabelForUpstream(
  params: IMetroTransformParams,
  src: string,
  extension: string,
): IMetroTransformParams {
  const filename = `${params.filename}${extension}`;
  const relabeled = { ...params, src, filename };
  const { options } = params;
  if (!isRecord(options) || typeof options.projectRoot !== 'string')
    return relabeled;
  const entry = workletsEntry(
    options.projectRoot,
    filename,
    options.dev === true,
  );
  if (entry === undefined) return relabeled;
  const plugins = Array.isArray(params.plugins) ? params.plugins : [];
  return { ...relabeled, plugins: [...plugins, entry] };
}
