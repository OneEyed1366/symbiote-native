// Boots a Metro dev bundle as a Worklets UI runtime in Bundle Mode, as `ScriptLoader.h` does
// Usage, dev bundles only: node scripts/check-worklet-boot.cjs <bundle> <installed worklets dir>
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WORKLETS_ENTRY_ID = -2;
const UI_RUNTIME_KIND = 2;
const DECORATOR =
  'Common/cpp/worklets/WorkletRuntime/WorkletRuntimeDecorator.cpp';

const [bundlePath, workletsDir] = process.argv.slice(2);
const source = fs.readFileSync(bundlePath, 'utf8');
const print = line => process.stdout.write(`${line}\n`);

// The globals the native decorator sets before the bundle runs, with every host function a noop
function createRuntime() {
  const noop = () => undefined;
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    performance: { now: () => Date.now() },
    __RUNTIME_KIND: UI_RUNTIME_KIND,
    _WORKLET: true,
    _WORKLET_RUNTIME_NAME: 'UI',
    __workletsModuleProxy: new Proxy({}, { get: () => noop }),
  };
  sandbox.globalThis = sandbox;
  sandbox.global = sandbox;
  const decorator = fs.readFileSync(path.join(workletsDir, DECORATOR), 'utf8');
  for (const [, name] of decorator.matchAll(
    /installJsiFunction\(\s*rt,\s*"(\w+)"/g,
  )) {
    sandbox[name] = noop;
  }
  return sandbox;
}

// `__r` stays a noop while the bundle runs, so no app entry point starts
function loadBundle(sandbox) {
  let metroRequire;
  Object.defineProperty(sandbox, '__r', {
    configurable: true,
    get: () => () => undefined,
    set: value => {
      metroRequire = value;
    },
  });
  vm.runInContext(source, vm.createContext(sandbox), { filename: 'bundle.js' });
  return metroRequire;
}

const metroRequire = loadBundle(createRuntime());

function failureOf(id) {
  try {
    metroRequire(id);
    return undefined;
  } catch (error) {
    return String(error?.message).split('\n')[0];
  }
}

const entryFailure = failureOf(WORKLETS_ENTRY_ID);
const workletIds = [
  ...source.matchAll(
    /"node_modules\/react-native-worklets\/\.worklets\/(\d+)\.js"/g,
  ),
].map(match => Number(match[1]));
const failures = workletIds
  .map(failureOf)
  .filter(message => message !== undefined);

print(`worklets entry: ${entryFailure ?? 'loaded'}`);
print(`worklet modules: ${workletIds.length}, failed: ${failures.length}`);
for (const message of new Set(failures)) print(`  ${message}`);

const isClean =
  entryFailure === undefined && workletIds.length > 0 && failures.length === 0;
process.exit(isClean ? 0 : 1);
