import type { File } from './file';
import type { Directory } from './directory';
import * as nodePath from './node-path';
import { asUrl, isUrl, encodeURLChars } from './url-utilities';

function uriObjectToString(path: string | File | Directory): string {
  return typeof path === 'string' ? path : path.uri;
}

// React Native's own ambient `URL` type (react-native/src/types/globals.d.ts) declares every
// property but `search` as readonly, so a new pathname is applied by reconstructing the URL
// rather than assigning `.pathname` in place — matching what a real setter would do internally.
// Built from `.protocol`/`.host` rather than `.origin`, because `file://` URLs report `.origin`
// as the literal string `"null"` per spec.
function withPathname(url: URL, pathname: string): URL {
  return new URL(
    `${url.protocol}//${url.host}${pathname}${url.search}${url.hash}`,
  );
}

export class PathUtilities {
  /**
   * Joins path segments into a single path.
   */
  static join(...paths: (string | File | Directory)[]): string {
    const [firstSegment = '', ...rest] = paths.map(uriObjectToString);
    const pathAsUrl = asUrl(firstSegment);
    if (pathAsUrl) {
      const joined = nodePath.join(
        pathAsUrl.pathname,
        ...rest.map(encodeURLChars),
      );
      return withPathname(pathAsUrl, joined).toString();
    }
    return nodePath.join(firstSegment, ...rest.map(encodeURLChars));
  }

  /**
   * Resolves a relative path to an absolute path.
   */
  static relative(
    from: string | File | Directory,
    to: string | File | Directory,
  ): string {
    let fromPath: string | File | Directory = from;
    let toPath: string | File | Directory = to;
    const fromString = uriObjectToString(from);
    const toString = uriObjectToString(to);

    if (isUrl(fromString)) {
      fromPath = asUrl(fromString)!.pathname;
    }
    if (isUrl(toString)) {
      toPath = asUrl(toString)!.pathname;
    }
    return nodePath.relative(
      uriObjectToString(fromPath),
      uriObjectToString(toPath),
    );
  }

  /**
   * Checks if a path is absolute.
   */
  static isAbsolute(path: string | File | Directory): boolean {
    const pathString = uriObjectToString(path);
    if (isUrl(pathString)) {
      return true;
    }
    return nodePath.isAbsolute(pathString);
  }

  /**
   * Normalizes a path.
   */
  static normalize(path: string | File | Directory): string {
    const pathString = uriObjectToString(path);
    const pathURL = asUrl(encodeURLChars(pathString));
    if (pathURL) {
      const normalized = encodeURLChars(
        nodePath.normalize(decodeURIComponent(pathURL.pathname)),
      );
      return withPathname(pathURL, normalized).toString();
    }
    return nodePath.normalize(pathString);
  }

  /**
   * Returns the directory name of a path.
   */
  static dirname(path: string | File | Directory): string {
    const pathString = uriObjectToString(path);
    const pathURL = asUrl(pathString);
    if (pathURL) {
      const dirnamePath = encodeURLChars(
        nodePath.dirname(decodeURIComponent(pathURL.pathname)),
      );
      return withPathname(pathURL, dirnamePath).toString();
    }
    return nodePath.dirname(pathString);
  }

  /**
   * Returns the base name of a path.
   */
  static basename(path: string | File | Directory, ext?: string): string {
    const pathString = uriObjectToString(path);
    const pathURL = asUrl(pathString);
    if (pathURL) {
      return nodePath.basename(decodeURIComponent(pathURL.pathname));
    }
    return nodePath.basename(pathString, ext);
  }

  /**
   * Returns the extension of a path.
   */
  static extname(path: string | File | Directory): string {
    const pathString = uriObjectToString(path);
    const pathURL = asUrl(pathString);
    if (pathURL) {
      return nodePath.extname(decodeURIComponent(pathURL.pathname));
    }
    return nodePath.extname(pathString);
  }

  /**
   * Parses a path into its components.
   */
  static parse(path: string | File | Directory): {
    root: string;
    dir: string;
    base: string;
    ext: string;
    name: string;
  } {
    const pathString = uriObjectToString(path);
    const pathURL = asUrl(pathString);
    if (pathURL) {
      return nodePath.parse(decodeURIComponent(pathURL.pathname));
    }
    return nodePath.parse(pathString);
  }
}
