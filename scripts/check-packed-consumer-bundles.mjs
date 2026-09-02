// A publish artifact is only useful if a standalone npm consumer can install and bundle it.
// This matrix copies each framework example to a disposable directory, rewrites every direct
// @symbiote-native/* dependency to a freshly packed tarball from THIS checkout, runs the example's
// real type/AOT check, then creates production Metro bundles for both platforms. The sourcemaps are
// inspected for foreign-framework package files, and the installed adapter must itself appear in
// the graph — so a registry adapter can never make the check falsely green.
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { publishablePackageEntries } from './lib/publishable-packages.mjs';

export const INTERNAL_PREFIX = '@symbiote-native/';
export const KNOWN_FRAMEWORKS = ['react', 'vue', 'svelte', 'angular', 'solid'];
export const PLATFORMS = ['ios', 'android'];
export const FRAMEWORK_EXAMPLES = {
  react: {
    dir: 'examples/react',
    adapter: '@symbiote-native/react',
    verify: ['npm', ['exec', '--', 'tsc', '--noEmit']],
  },
  vue: {
    dir: 'examples/vue-sfc',
    adapter: '@symbiote-native/vue',
    verify: ['npm', ['run', 'typecheck']],
  },
  svelte: {
    dir: 'examples/svelte',
    adapter: '@symbiote-native/svelte',
    verify: ['npm', ['run', 'typecheck']],
  },
  angular: {
    dir: 'examples/angular',
    adapter: '@symbiote-native/angular',
    verify: ['npm', ['run', 'ng:build']],
  },
  solid: {
    dir: 'examples/solid',
    adapter: '@symbiote-native/solid',
    verify: ['npm', ['run', 'typecheck']],
  },
};

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
];

function normalizedPath(value) {
  return value.split(sep).join('/');
}

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      cwd: options.cwd,
      env: options.env,
      encoding: options.encoding ?? 'utf8',
      stdio: options.stdio ?? 'pipe',
    });
  } catch (error) {
    const stdout = typeof error.stdout === 'string' ? error.stdout : '';
    const stderr = typeof error.stderr === 'string' ? error.stderr : '';
    throw new Error(
      [
        `${command} ${args.join(' ')} failed in ${options.cwd ?? process.cwd()}`,
        stdout,
        stderr,
      ]
        .filter(Boolean)
        .join('\n'),
      { cause: error },
    );
  }
}

export function directInternalDependencies(manifest) {
  const names = new Set();
  for (const field of DEPENDENCY_FIELDS) {
    for (const name of Object.keys(manifest[field] ?? {})) {
      if (name.startsWith(INTERNAL_PREFIX)) names.add(name);
    }
  }
  return [...names].sort();
}

export function rewriteInternalDependencies(manifest, tarballs) {
  const rewritten = structuredClone(manifest);
  const missing = [];
  for (const field of DEPENDENCY_FIELDS) {
    const dependencies = rewritten[field];
    if (dependencies === undefined) continue;
    for (const name of Object.keys(dependencies)) {
      if (!name.startsWith(INTERNAL_PREFIX)) continue;
      const tarball = tarballs.get(name);
      if (tarball === undefined) {
        missing.push(name);
        continue;
      }
      dependencies[name] = `file:${tarball}`;
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `No fresh tarball for: ${[...new Set(missing)].sort().join(', ')}`,
    );
  }
  return rewritten;
}

export function findForeignFrameworkLeaks(
  sources,
  multiFrameworkPackages,
  ownFramework,
) {
  const leaks = [];
  for (const rawSource of sources) {
    const source = normalizedPath(rawSource);
    for (const pkg of multiFrameworkPackages) {
      const pkgRoot = `/@symbiote-native/${pkg.name}/`;
      if (!source.includes(pkgRoot)) continue;
      for (const foreignFramework of pkg.frameworks) {
        if (foreignFramework === ownFramework) continue;
        const foreign = ['src', 'build', 'build-ngc'].some(buildDir =>
          source.includes(`${pkgRoot}${buildDir}/${foreignFramework}/`),
        );
        if (foreign) {
          leaks.push({
            package: pkg.name,
            foreignFramework,
            source: rawSource,
          });
        }
      }
    }
  }
  return leaks;
}

export function adapterReachedBundle(sources, adapterName) {
  const packagePath = `/node_modules/${adapterName}/`;
  return sources.some(source => normalizedPath(source).includes(packagePath));
}

function selectedValues(envName, allowed) {
  const raw = process.env[envName]?.trim();
  if (!raw) return allowed;
  const requested = raw
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const unknown = requested.filter(value => !allowed.includes(value));
  if (unknown.length > 0) {
    throw new Error(
      `${envName} contains unsupported values: ${unknown.join(', ')}`,
    );
  }
  return requested;
}

function copyTrackedExample(exampleDir, destination) {
  const output = run('git', ['ls-files', '-z', '--', exampleDir], {
    cwd: REPO_ROOT,
    encoding: 'buffer',
  });
  const files = output.toString().split('\0').filter(Boolean);
  if (files.length === 0) throw new Error(`${exampleDir} has no tracked files`);
  for (const file of files) {
    const target = join(destination, relative(exampleDir, file));
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(REPO_ROOT, file), target);
  }
}

function packPackages(names, packDirectory) {
  const entries = new Map(
    publishablePackageEntries().map(entry => [entry.name, entry]),
  );
  const tarballs = new Map();
  for (const name of names) {
    const entry = entries.get(name);
    if (entry === undefined)
      throw new Error(`${name} is not publishable from this checkout`);
    const output = run('pnpm', ['pack', '--pack-destination', packDirectory], {
      cwd: join(REPO_ROOT, entry.dir),
    });
    const finalLine = output.trim().split('\n').at(-1)?.trim();
    if (!finalLine)
      throw new Error(`pnpm pack returned no tarball path for ${name}`);
    const tarball = resolve(join(REPO_ROOT, entry.dir), finalLine);
    if (!existsSync(tarball))
      throw new Error(`pnpm pack did not create ${tarball}`);
    tarballs.set(name, tarball);
  }
  return tarballs;
}

function discoverMultiFrameworkPackages() {
  const packages = [];
  for (const entry of publishablePackageEntries()) {
    if (!entry.dir.startsWith('packages/')) continue;
    const manifest = JSON.parse(
      readFileSync(join(REPO_ROOT, entry.dir, 'package.json'), 'utf8'),
    );
    const exportKeys = Object.keys(manifest.exports ?? {});
    const frameworks = KNOWN_FRAMEWORKS.filter(framework =>
      exportKeys.includes(`./${framework}`),
    );
    if (frameworks.length >= 2) {
      packages.push({
        name: manifest.name.replace(INTERNAL_PREFIX, ''),
        frameworks,
      });
    }
  }
  return packages;
}

function verifyInstalledTarballs(exampleRoot, names, tarballs) {
  for (const name of names) {
    const installedPath = join(
      exampleRoot,
      'node_modules',
      ...name.split('/'),
      'package.json',
    );
    if (!existsSync(installedPath))
      throw new Error(`${name} was not installed in ${exampleRoot}`);
    const installed = JSON.parse(readFileSync(installedPath, 'utf8'));
    const packed = JSON.parse(
      run('tar', ['-xOf', tarballs.get(name), 'package/package.json']),
    );
    if (JSON.stringify(installed) !== JSON.stringify(packed)) {
      throw new Error(
        `${name} in ${exampleRoot} is not the freshly packed manifest`,
      );
    }
  }
  const duplicateEngines = run(
    'find',
    [
      'node_modules',
      '-path',
      '*/@symbiote-native/engine/package.json',
      '-print',
    ],
    { cwd: exampleRoot },
  )
    .trim()
    .split('\n')
    .filter(Boolean);
  if (duplicateEngines.length !== 1) {
    throw new Error(
      `${exampleRoot} installed ${duplicateEngines.length} engine copies:\n` +
        duplicateEngines.join('\n'),
    );
  }
}

function bundleSources(exampleRoot, platform) {
  const outputDir = mkdtempSync(join(tmpdir(), 'symbiote-consumer-bundle-'));
  const bundle = join(outputDir, `${platform}.js`);
  const sourcemap = join(outputDir, `${platform}.map`);
  try {
    run(
      join(exampleRoot, 'node_modules/.bin/react-native'),
      [
        'bundle',
        '--entry-file',
        'index.js',
        '--platform',
        platform,
        '--dev',
        'false',
        '--bundle-output',
        bundle,
        '--sourcemap-output',
        sourcemap,
        '--reset-cache',
      ],
      { cwd: exampleRoot },
    );
    return JSON.parse(readFileSync(sourcemap, 'utf8')).sources;
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
}

function main() {
  const frameworks = selectedValues(
    'SYMBIOTE_CONSUMER_FRAMEWORKS',
    Object.keys(FRAMEWORK_EXAMPLES),
  );
  const platforms = selectedValues('SYMBIOTE_CONSUMER_PLATFORMS', PLATFORMS);
  const matrixRoot = mkdtempSync(join(tmpdir(), 'symbiote-consumer-matrix-'));
  const packDirectory = join(matrixRoot, 'tarballs');
  const npmCache = join(matrixRoot, 'npm-cache');
  mkdirSync(packDirectory);
  mkdirSync(npmCache);
  const npmEnvironment = { ...process.env, npm_config_cache: npmCache };
  // pnpm injects its own setting into child processes; npm does not recognize it and warns on
  // every install/run. It has no bearing on the standalone consumer, so do not forward it.
  delete npmEnvironment.npm_config_manage_package_manager_versions;

  try {
    const selectedExamples = frameworks.map(framework => [
      framework,
      FRAMEWORK_EXAMPLES[framework],
    ]);
    const manifests = new Map(
      selectedExamples.map(([framework, example]) => [
        framework,
        JSON.parse(
          readFileSync(join(REPO_ROOT, example.dir, 'package.json'), 'utf8'),
        ),
      ]),
    );
    const packageNames = [
      ...new Set(
        [...manifests.values()].flatMap(manifest =>
          directInternalDependencies(manifest),
        ),
      ),
    ].sort();

    console.log(
      `Packing ${packageNames.length} direct consumer package(s): ${packageNames.join(', ')}`,
    );
    const tarballs = packPackages(packageNames, packDirectory);
    const multiFrameworkPackages = discoverMultiFrameworkPackages();

    for (const [framework, example] of selectedExamples) {
      const exampleRoot = join(matrixRoot, framework);
      copyTrackedExample(example.dir, exampleRoot);
      const manifest = manifests.get(framework);
      const directPackages = directInternalDependencies(manifest);
      const rewritten = rewriteInternalDependencies(manifest, tarballs);
      writeFileSync(
        join(exampleRoot, 'package.json'),
        `${JSON.stringify(rewritten, null, 2)}\n`,
      );
      rmSync(join(exampleRoot, 'package-lock.json'), { force: true });

      console.log(`\n${framework}: installing fresh tarball consumer ...`);
      run(
        'npm',
        [
          'install',
          '--package-lock=false',
          '--no-audit',
          '--no-fund',
          '--prefer-offline',
        ],
        {
          cwd: exampleRoot,
          env: npmEnvironment,
          stdio: 'inherit',
        },
      );
      verifyInstalledTarballs(exampleRoot, directPackages, tarballs);

      const [verifyCommand, verifyArgs] = example.verify;
      console.log(
        `${framework}: running ${verifyCommand} ${verifyArgs.join(' ')} ...`,
      );
      run(verifyCommand, verifyArgs, {
        cwd: exampleRoot,
        env: verifyCommand === 'npm' ? npmEnvironment : process.env,
        stdio: 'inherit',
      });

      for (const platform of platforms) {
        process.stdout.write(`${framework}/${platform}: bundling ... `);
        const sources = bundleSources(exampleRoot, platform);
        if (!adapterReachedBundle(sources, example.adapter)) {
          throw new Error(
            `${framework}/${platform} did not bundle ${example.adapter}; ` +
              'the matrix may be validating registry or dead code instead of this adapter',
          );
        }
        const leaks = findForeignFrameworkLeaks(
          sources,
          multiFrameworkPackages,
          framework,
        );
        if (leaks.length > 0) {
          const details = leaks
            .map(
              leak =>
                `${leak.package}: ${leak.foreignFramework} file reached ${framework}/${platform}\n` +
                `  ${leak.source}`,
            )
            .join('\n');
          throw new Error(details);
        }
        console.log(
          `ok (${sources.length} modules, current adapter, no foreign framework)`,
        );
      }
    }

    console.log('\nAll packed consumer bundles passed.');
  } finally {
    if (process.env.SYMBIOTE_KEEP_CONSUMER_MATRIX === '1') {
      console.log(`Keeping consumer matrix at ${matrixRoot}`);
    } else {
      rmSync(matrixRoot, { recursive: true, force: true });
    }
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
