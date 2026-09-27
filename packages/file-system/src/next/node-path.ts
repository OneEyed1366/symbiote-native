// Ported verbatim from expo-file-system's own vendored copy of Node's posix `path` module
// (Copyright Joyent, Inc. and other Node contributors, MIT licensed) — a self-contained,
// mechanical algorithm with zero native dependency, so a straight port carries low risk.

function isPathSeparator(code: string) {
  return code === '/';
}

// Resolves . and .. elements in a path with directory names
function normalizeString(
  path: string,
  allowAboveRoot: boolean,
  separator: string,
) {
  let res = '';
  let lastSegmentLength = 0;
  let lastSlash = -1;
  let dots = 0;
  let code = '';
  for (let i = 0; i <= path.length; ++i) {
    if (i < path.length) code = path.charAt(i);
    else if (isPathSeparator(code)) break;
    else code = '/';

    if (isPathSeparator(code)) {
      if (lastSlash === i - 1 || dots === 1) {
        // NOOP
      } else if (dots === 2) {
        if (
          res.length < 2 ||
          lastSegmentLength !== 2 ||
          res.charAt(res.length - 1) !== '.' ||
          res.charAt(res.length - 2) !== '.'
        ) {
          if (res.length > 2) {
            const lastSlashIndex = res.lastIndexOf(separator);
            if (lastSlashIndex === -1) {
              res = '';
              lastSegmentLength = 0;
            } else {
              res = res.slice(0, lastSlashIndex);
              lastSegmentLength = res.length - 1 - res.lastIndexOf(separator);
            }
            lastSlash = i;
            dots = 0;
            continue;
          } else if (res.length !== 0) {
            res = '';
            lastSegmentLength = 0;
            lastSlash = i;
            dots = 0;
            continue;
          }
        }
        if (allowAboveRoot) {
          res += res.length > 0 ? `${separator}..` : '..';
          lastSegmentLength = 2;
        }
      } else {
        if (res.length > 0)
          res += `${separator}${path.slice(lastSlash + 1, i)}`;
        else res = path.slice(lastSlash + 1, i);
        lastSegmentLength = i - lastSlash - 1;
      }
      lastSlash = i;
      dots = 0;
    } else if (code === '.' && dots !== -1) {
      ++dots;
    } else {
      dots = -1;
    }
  }
  return res;
}

export function resolve(...args: string[]) {
  let resolvedPath = '';
  let resolvedAbsolute = false;

  for (let i = args.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    const path = i >= 0 ? args[i] : '';

    if (!path || path.length === 0) {
      continue;
    }

    resolvedPath = `${path}/${resolvedPath}`;
    resolvedAbsolute = !!(path && path.charAt(0) === '/');
  }

  resolvedPath = normalizeString(resolvedPath, !resolvedAbsolute, '/');

  if (resolvedAbsolute) {
    return `/${resolvedPath}`;
  }
  return resolvedPath.length > 0 ? resolvedPath : '.';
}

export function normalize(path: string) {
  if (path.length === 0) return '.';

  const isAbsolute = path.charAt(0) === '/';
  const trailingSeparator = path.charAt(path.length - 1) === '/';

  path = normalizeString(path, !isAbsolute, '/');

  if (path.length === 0) {
    if (isAbsolute) return '/';
    return trailingSeparator ? './' : '.';
  }
  if (trailingSeparator) path += '/';

  return isAbsolute ? `/${path}` : path;
}

export function isAbsolute(path: string) {
  return path.length > 0 && path.charAt(0) === '/';
}

export function join(...args: string[]) {
  if (args.length === 0) return '.';

  const path: string[] = [];
  for (let i = 0; i < args.length; ++i) {
    const arg = args[i];
    if (arg && arg.length > 0) {
      path.push(arg);
    }
  }

  if (path.length === 0) return '.';

  return normalize(path.join('/'));
}

export function relative(from: string, to: string) {
  if (from === to) return '';

  from = resolve(from);
  to = resolve(to);

  if (from === to) return '';

  const fromStart = 1;
  const fromEnd = from.length;
  const fromLen = fromEnd - fromStart;
  const toStart = 1;
  const toLen = to.length - toStart;

  const length = fromLen < toLen ? fromLen : toLen;
  let lastCommonSep = -1;
  let i = 0;
  for (; i < length; i++) {
    const fromChar = from.charAt(fromStart + i);
    if (fromChar !== to.charAt(toStart + i)) break;
    else if (fromChar === '/') lastCommonSep = i;
  }
  if (i === length) {
    if (toLen > length) {
      if (to.charAt(toStart + i) === '/') {
        return to.slice(toStart + i + 1);
      }
      if (i === 0) {
        return to.slice(toStart + i);
      }
    } else if (fromLen > length) {
      if (from.charAt(fromStart + i) === '/') {
        lastCommonSep = i;
      } else if (i === 0) {
        lastCommonSep = 0;
      }
    }
  }

  let out = '';
  for (i = fromStart + lastCommonSep + 1; i <= fromEnd; ++i) {
    if (i === fromEnd || from.charAt(i) === '/') {
      out += out.length === 0 ? '..' : '/..';
    }
  }

  return `${out}${to.slice(toStart + lastCommonSep)}`;
}

export function dirname(path: string) {
  if (path.length === 0) return '.';
  const hasRoot = path.charAt(0) === '/';
  let end = -1;
  let matchedSlash = true;
  for (let i = path.length - 1; i >= 1; --i) {
    if (path.charAt(i) === '/') {
      if (!matchedSlash) {
        end = i;
        break;
      }
    } else {
      matchedSlash = false;
    }
  }

  if (end === -1) return hasRoot ? '/' : '.';
  if (hasRoot && end === 1) return '//';
  return path.slice(0, end);
}

export function basename(path: string, suffix?: string) {
  let start = 0;
  let end = -1;
  let matchedSlash = true;

  if (
    suffix !== undefined &&
    suffix.length > 0 &&
    suffix.length <= path.length
  ) {
    if (suffix === path) return '';
    let extIdx = suffix.length - 1;
    let firstNonSlashEnd = -1;
    for (let i = path.length - 1; i >= 0; --i) {
      const code = path.charAt(i);
      if (code === '/') {
        if (!matchedSlash) {
          start = i + 1;
          break;
        }
      } else {
        if (firstNonSlashEnd === -1) {
          matchedSlash = false;
          firstNonSlashEnd = i + 1;
        }
        if (extIdx >= 0) {
          if (code === suffix.charAt(extIdx)) {
            if (--extIdx === -1) {
              end = i;
            }
          } else {
            extIdx = -1;
            end = firstNonSlashEnd;
          }
        }
      }
    }

    if (start === end) end = firstNonSlashEnd;
    else if (end === -1) end = path.length;
    return path.slice(start, end);
  }
  for (let i = path.length - 1; i >= 0; --i) {
    if (path.charAt(i) === '/') {
      if (!matchedSlash) {
        start = i + 1;
        break;
      }
    } else if (end === -1) {
      matchedSlash = false;
      end = i + 1;
    }
  }

  if (end === -1) return '';
  return path.slice(start, end);
}

export function extname(path: string) {
  let startDot = -1;
  let startPart = 0;
  let end = -1;
  let matchedSlash = true;
  let preDotState = 0;
  for (let i = path.length - 1; i >= 0; --i) {
    const code = path.charAt(i);
    if (code === '/') {
      if (!matchedSlash) {
        startPart = i + 1;
        break;
      }
      continue;
    }
    if (end === -1) {
      matchedSlash = false;
      end = i + 1;
    }
    if (code === '.') {
      if (startDot === -1) startDot = i;
      else if (preDotState !== 1) preDotState = 1;
    } else if (startDot !== -1) {
      preDotState = -1;
    }
  }

  if (
    startDot === -1 ||
    end === -1 ||
    preDotState === 0 ||
    (preDotState === 1 && startDot === end - 1 && startDot === startPart + 1)
  ) {
    return '';
  }
  return path.slice(startDot, end);
}

export function parse(path: string) {
  const ret = { root: '', dir: '', base: '', ext: '', name: '' };
  if (path.length === 0) return ret;
  const isAbsolutePath = path.charAt(0) === '/';
  let start;
  if (isAbsolutePath) {
    ret.root = '/';
    start = 1;
  } else {
    start = 0;
  }
  let startDot = -1;
  let startPart = 0;
  let end = -1;
  let matchedSlash = true;
  let i = path.length - 1;
  let preDotState = 0;

  for (; i >= start; --i) {
    const code = path.charAt(i);
    if (code === '/') {
      if (!matchedSlash) {
        startPart = i + 1;
        break;
      }
      continue;
    }
    if (end === -1) {
      matchedSlash = false;
      end = i + 1;
    }
    if (code === '.') {
      if (startDot === -1) startDot = i;
      else if (preDotState !== 1) preDotState = 1;
    } else if (startDot !== -1) {
      preDotState = -1;
    }
  }

  if (end !== -1) {
    const nameStart = startPart === 0 && isAbsolutePath ? 1 : startPart;
    if (
      startDot === -1 ||
      preDotState === 0 ||
      (preDotState === 1 && startDot === end - 1 && startDot === startPart + 1)
    ) {
      ret.base = ret.name = path.slice(nameStart, end);
    } else {
      ret.name = path.slice(nameStart, startDot);
      ret.base = path.slice(nameStart, end);
      ret.ext = path.slice(startDot, end);
    }
  }

  if (startPart > 0) ret.dir = path.slice(0, startPart - 1);
  else if (isAbsolutePath) ret.dir = '/';

  return ret;
}

export const sep = '/';
