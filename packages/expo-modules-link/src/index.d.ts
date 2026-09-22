export type ISymbioteExpoLinkAndroidModule = {
  importPath: string;
  className: string;
  nativeName: string;
};

export type ISymbioteExpoLinkManifestService = {
  /** Fully-qualified native class name, e.g. `expo.modules.audio.service.AudioControlsService`. */
  name: string;
  /** e.g. `mediaPlayback`, `microphone`, `location`. */
  foregroundServiceType?: string;
  /** @default false */
  exported?: boolean;
  /** Action names for a single `<intent-filter>` with one `<action>` per entry. */
  intentFilterActions?: string[];
};

/**
 * A policy-sensitive permission/service group a package deliberately does NOT request
 * unconditionally (see `manifestPermissions`/`manifestServices` below) — surfaced instead for a
 * developer to opt into explicitly, e.g. via `@symbiote-native/cli grant`. The package never
 * applies these itself; something the DEVELOPER runs reads them and edits their own app.
 */
export type ISymbioteExpoLinkOptionalBundle = {
  /** Stable id within this package, e.g. `background`, `recording`. */
  id: string;
  /** Shown when a developer is choosing which bundle to grant. */
  label: string;
  /** Why requesting this is policy-sensitive (e.g. triggers Play Console review). */
  warning: string;
  /** What JS code the developer still needs to write for this to do anything. */
  nextSteps: string;
  manifestPermissions?: string[];
  manifestServices?: ISymbioteExpoLinkManifestService[];
};

export type ISymbioteExpoLinkManifest = {
  android?: {
    // Both optional to match the actual runtime contract: every patcher in this package reads
    // them defensively (`entry.manifest.android?.gradleProjectName`, `Array.isArray(...modules)`)
    // and no-ops when absent — a synthetic entry that exists only to carry
    // manifestPermissions/manifestServices (see @symbiote-native/cli's `grant` command) has
    // neither, and is a legitimate entry, not a malformed one.
    gradleProjectName?: string;
    modules?: ISymbioteExpoLinkAndroidModule[];
    /** Attributes to set on the app's own `<application>` element, e.g. Auto Backup rules. */
    manifestApplicationAttributes?: Record<string, string>;
    /**
     * `<uses-permission>` names to add, for whatever a package's own AndroidManifest.xml
     * deliberately does not carry (typically because requesting it triggers Play Console policy
     * review for every consumer) — only list one here to make EVERY consumer request it
     * unconditionally, matching whatever upstream's own config-plugin defaults to `true`.
     */
    manifestPermissions?: string[];
    /**
     * `<service>` elements to add to the app's own `<application>`, for a foreground-service
     * native class upstream's config-plugin adds dynamically rather than shipping in the
     * package's own manifest (so autolinking's ordinary merge never adds it either).
     */
    manifestServices?: ISymbioteExpoLinkManifestService[];
    /** Policy-sensitive bundles a developer can opt into by hand — see the type's own doc. */
    optionalManifestBundles?: ISymbioteExpoLinkOptionalBundle[];
  };
  ios?: {
    infoPlistKeys: Record<string, string>;
  };
};

export type ISymbioteExpoLinkEntry = {
  packageName: string;
  manifest: ISymbioteExpoLinkManifest;
};

/** Scans the app's node_modules and regenerates every native registration block. */
export function linkApp(appRoot?: string): void;
export function collectManifests(appRoot: string): ISymbioteExpoLinkEntry[];
export function findAppRoot(): string | null;
/** Adds every `entries[].manifest.android.manifestPermissions` to the app's AndroidManifest.xml. */
export function patchAndroidManifestPermissions(
  appRoot: string,
  entries: readonly ISymbioteExpoLinkEntry[],
): void;
/** Adds every `entries[].manifest.android.manifestServices` to the app's AndroidManifest.xml. */
export function patchAndroidManifestServices(
  appRoot: string,
  entries: readonly ISymbioteExpoLinkEntry[],
): void;
