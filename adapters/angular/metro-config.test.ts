// Unit-tests withSymbioteAngularMetroConfig's resolveRequest against fake Metro contexts — no
// real ngc/Metro build involved. Guards `require('./assets/logo.png')` under buildRoot, which
// 404'd when the redirect matched only style extensions.
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { withSymbioteAngularMetroConfig } from './metro-config.cjs';

const PROJECT_ROOT = '/app';
const BUILD_ROOT = path.join(PROJECT_ROOT, 'build', 'angular');

function contextIn(compiledFile: string) {
  const calls: Array<{ originModulePath: string; moduleName: string }> = [];
  const context = {
    originModulePath: compiledFile,
    resolveRequest: (ctx: { originModulePath: string }, moduleName: string) => {
      calls.push({ originModulePath: ctx.originModulePath, moduleName });
      return {
        type: 'sourceFile',
        filePath: path.resolve(path.dirname(ctx.originModulePath), moduleName),
      };
    },
  };
  return { context, calls };
}

describe('withSymbioteAngularMetroConfig — resolveRequest', () => {
  const { resolver } = withSymbioteAngularMetroConfig(
    { resolver: { sourceExts: ['ts', 'js'] } },
    PROJECT_ROOT,
  );

  it('redirects a relative style import from buildRoot back to the real source directory', () => {
    const { context, calls } = contextIn(
      path.join(BUILD_ROOT, 'src', 'App.js'),
    );
    resolver.resolveRequest(context, './App.css', 'ios');

    expect(calls).toHaveLength(1);
    expect(calls[0].originModulePath).toBe(
      path.join(PROJECT_ROOT, 'src', 'App.js'),
    );
  });

  // The real bug: only .css/.scss/.sass/.less/.styl were redirected, so a bundled image
  // require() 404'd looking for a file ngc never copied into buildRoot.
  it('redirects a relative image require() from buildRoot back to the real source directory', () => {
    const { context, calls } = contextIn(
      path.join(BUILD_ROOT, 'src', 'MenuScreen.js'),
    );
    resolver.resolveRequest(context, './assets/react-native-logo.png', 'ios');

    expect(calls).toHaveLength(1);
    expect(calls[0].originModulePath).toBe(
      path.join(PROJECT_ROOT, 'src', 'MenuScreen.js'),
    );
  });

  it('leaves a real compiled module reference (no extension) resolving inside buildRoot', () => {
    const { context, calls } = contextIn(
      path.join(BUILD_ROOT, 'src', 'App.js'),
    );
    resolver.resolveRequest(context, './MenuScreen', 'ios');

    expect(calls).toHaveLength(1);
    expect(calls[0].originModulePath).toBe(
      path.join(BUILD_ROOT, 'src', 'App.js'),
    );
  });

  it('leaves a non-relative (bare package) specifier alone regardless of extension', () => {
    const { context, calls } = contextIn(
      path.join(BUILD_ROOT, 'src', 'App.js'),
    );
    resolver.resolveRequest(context, '@symbiote-native/angular', 'ios');

    expect(calls).toHaveLength(1);
    expect(calls[0].originModulePath).toBe(
      path.join(BUILD_ROOT, 'src', 'App.js'),
    );
  });

  it('leaves resolution alone for an origin outside buildRoot entirely', () => {
    const { context, calls } = contextIn(
      path.join(PROJECT_ROOT, 'src', 'App.js'),
    );
    resolver.resolveRequest(context, './assets/logo.png', 'ios');

    expect(calls).toHaveLength(1);
    expect(calls[0].originModulePath).toBe(
      path.join(PROJECT_ROOT, 'src', 'App.js'),
    );
  });
});
