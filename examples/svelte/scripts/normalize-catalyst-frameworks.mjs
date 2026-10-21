import {
  existsSync,
  lstatSync,
  readlinkSync,
  realpathSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// React Native’s prebuilt Catalyst bundles flatten versioned-framework links.
export function normalizeCatalystFrameworks(buildDirectory) {
  if (!buildDirectory) throw new Error('BUILT_PRODUCTS_DIR is required');
  for (const [pod, name] of [
    ['React-Core-prebuilt', 'React'],
    ['ReactNativeDependencies', 'ReactNativeDependencies'],
  ]) {
    const framework = join(
      buildDirectory,
      'XCFrameworkIntermediates',
      pod,
      `${name}.framework`,
    );
    if (
      !existsSync(join(framework, 'Versions/A', name)) ||
      !existsSync(join(framework, 'Versions/A/Resources/Info.plist'))
    ) {
      throw new Error(`Expected a versioned Catalyst framework: ${framework}`);
    }
    for (const resource of readdirSync(framework).filter(name =>
      name.endsWith('.bundle'),
    )) {
      renameSync(
        join(framework, resource),
        join(framework, 'Versions/A/Resources', resource),
      );
    }
    for (const [path, target] of [
      ['Versions/Current', 'A'],
      [name, `Versions/Current/${name}`],
      ['Resources', 'Versions/Current/Resources'],
    ]) {
      const link = join(framework, path);
      if (lstatSync(link).isSymbolicLink()) {
        if (readlinkSync(link) !== target)
          throw new Error(`Unexpected framework link: ${link}`);
        continue;
      }
      rmSync(link, { recursive: true });
      symlinkSync(target, link);
    }
  }
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  normalizeCatalystFrameworks(process.env.BUILT_PRODUCTS_DIR);
}
