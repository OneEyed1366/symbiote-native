// Svelte-side duplicate of core/components/src/view/render-image/index.ts's private prop-mapping
// helpers (normalizeSource / headersFromAliases / expandSrcSet / readStyleString / readSourceUri /
// resolveSourceArray). None of them are exported — not even from that file — so per the
// svelte-adapter-dom-shim skill's §15 ("skip consuming a render-*.ts function's Descriptor output
// programmatically; hand-author the equivalent markup, reusing only EXPORTED pure helpers"), this
// module reproduces the mapping directly rather than calling renderImage() and reading its
// returned Descriptor's `.props`.
//
// GENUINE GAP (see the Svelte-components work report): these helpers should be exported from
// core/components/src/view/render-image/index.ts so no adapter needs this duplication. Until
// then, this file is kept byte-for-byte equivalent to that source and reuses every primitive that
// IS already exported (resolveImageSource, flattenStyle, dlog) — only the mid-level composition
// is duplicated.

import {
  dlog,
  flattenStyle,
  resolveImageSource,
  type IStyleProp,
  type IViewStyle,
} from '@symbiote-native/engine';
import type { IImageSource, IImageSourceProp, IImageViewProps } from '@symbiote-native/components';

function normalizeSource(source: IImageSourceProp): unknown[] {
  const resolved = resolveImageSource(source);
  const sources = Array.isArray(resolved) ? resolved : [resolved];
  dlog(`Image source resolved to ${JSON.stringify(sources)}`);
  return sources;
}

function headersFromAliases(view: IImageViewProps): Record<string, string> {
  const headers: Record<string, string> = {};
  if (view.crossOrigin === 'use-credentials') {
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  if (view.referrerPolicy !== undefined) {
    headers['Referrer-Policy'] = view.referrerPolicy;
  }
  return headers;
}

function expandSrcSet(
  srcSet: string,
  view: IImageViewProps,
  headers: Record<string, string>,
): IImageSource[] {
  const sources: IImageSource[] = [];
  let useSrcForDefaultScale = true;
  for (const entry of srcSet.split(', ')) {
    const [uri, xScale = '1x'] = entry.split(' ');
    if (!xScale.endsWith('x')) {
      dlog(`Image srcSet: unsupported scale token "${xScale}", skipping`);
      continue;
    }
    const scale = parseInt(xScale.slice(0, -1), 10);
    if (Number.isNaN(scale)) continue;
    if (scale === 1) useSrcForDefaultScale = false;
    sources.push({ uri, scale, width: view.width, height: view.height, ...{ headers } });
  }
  if (useSrcForDefaultScale && view.src !== undefined) {
    sources.push({
      uri: view.src,
      scale: 1,
      width: view.width,
      height: view.height,
      ...{ headers },
    });
  }
  if (sources.length === 0) dlog('Image srcSet: produced no valid sources');
  return sources;
}

function resolveSourceArray(view: IImageViewProps): unknown[] {
  const headers = headersFromAliases(view);
  if (view.srcSet !== undefined) {
    return expandSrcSet(view.srcSet, view, headers);
  }
  if (view.src !== undefined) {
    return [{ uri: view.src, width: view.width, height: view.height, ...{ headers } }];
  }
  if (view.source === undefined) {
    dlog('Image: no source / src / srcSet provided');
    return [];
  }
  const sources = normalizeSource(view.source);
  if (Object.keys(headers).length > 0 && sources.length === 1) {
    const [only] = sources;
    if (typeof only === 'object' && only !== null && typeof Reflect.get(only, 'uri') === 'string') {
      return [{ ...only, headers }];
    }
  }
  return sources;
}

function readStyleString(
  style: IStyleProp<IViewStyle> | undefined,
  key: 'resizeMode' | 'tintColor',
): string | undefined {
  if (style === undefined) return undefined;
  const flat = flattenStyle(style);
  const value = Object.hasOwn(flat, key) ? flat[key] : undefined;
  return typeof value === 'string' ? value : undefined;
}

function readSourceUri(source: IImageSourceProp): string | undefined {
  const [resolved] = normalizeSource(source);
  if (typeof resolved === 'object' && resolved !== null) {
    const uri = Reflect.get(resolved, 'uri');
    if (typeof uri === 'string') return uri;
  }
  return undefined;
}

// Builds the exact prop bag renderImage's `mapped` produces, minus the final `el()` wrap — the
// caller hands the result straight to `<symbiote-image p={bag}>`.
export function buildImageBag(view: IImageViewProps): Record<string, unknown> {
  // `width` / `height` aliases fold into style; explicit style keys win.
  const foldedStyle =
    view.width === undefined && view.height === undefined
      ? view.style
      : [{ width: view.width, height: view.height }, view.style];

  const mapped: Record<string, unknown> = {
    ...view.passthrough,
    style: foldedStyle,
    source: resolveSourceArray(view),
    resizeMode: view.resizeMode ?? readStyleString(view.style, 'resizeMode'),
    tintColor: view.tintColor ?? readStyleString(view.style, 'tintColor'),
  };
  // `alt` is the accessibility text: it sets accessibilityLabel and marks the image accessible.
  // An explicit accessibilityLabel (already folded into passthrough) still wins.
  if (view.alt !== undefined) {
    if (mapped.accessibilityLabel === undefined) mapped.accessibilityLabel = view.alt;
    mapped.accessible = true;
  }
  if (view.defaultSource !== undefined) mapped.defaultSource = normalizeSource(view.defaultSource);
  if (view.loadingIndicatorSource !== undefined) {
    mapped.loadingIndicatorSrc = readSourceUri(view.loadingIndicatorSource);
  }

  dlog('Image -> RCTImageView');
  return mapped;
}
