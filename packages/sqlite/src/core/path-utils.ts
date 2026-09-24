// Ported verbatim (logic unchanged) from expo-sqlite's pathUtils.ts (.vendors/expo @
// origin/sdk-57, packages/expo-sqlite/src/pathUtils.ts).
import { expoSQLite } from './native-module';

function resolveDbDirectory(directory: string | undefined): string {
  const resolvedDirectory = directory ?? expoSQLite.defaultDatabaseDirectory;
  if (resolvedDirectory == null) {
    throw new Error(
      'Both provided directory and defaultDatabaseDirectory are null.',
    );
  }
  return resolvedDirectory;
}

/**
 * Creates a normalized database path by combining the directory and database name — no
 * trailing slash on the directory, no leading slash on the name, so the join never doubles up.
 */
export function createDatabasePath(
  databaseName: string,
  directory?: string,
): string {
  if (databaseName === ':memory:') return databaseName;
  const resolvedDirectory = resolveDbDirectory(directory);

  function removeTrailingSlash(path: string): string {
    return path.replace(/\/*$/, '');
  }
  function removeLeadingSlash(path: string): string {
    return path.replace(/^\/+/, '');
  }

  return `${removeTrailingSlash(resolvedDirectory)}/${removeLeadingSlash(databaseName)}`;
}

export function basename(path: string): string {
  return path.substring(path.lastIndexOf('/') + 1);
}
