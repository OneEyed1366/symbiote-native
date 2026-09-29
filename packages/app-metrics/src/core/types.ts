// Ported verbatim from expo-app-metrics's types.ts (sdk-57), renamed with this repo's
// `I`-prefix convention

export type IAppStartupTimes = {
  /** @platform ios */
  loadTime?: number;
  coldLaunchTime?: number;
  warmLaunchTime?: number;
  bundleLoadTime?: number;
  timeToFirstRender?: number;
  timeToInteractive?: number;
};

export type IMemoryUsageSnapshot = {
  /** @platform ios */
  allocated?: number;
  physical: number;
  available: number;
  /** @platform android */
  javaHeap?: number;
};

export type IFrameRateMetrics = {
  renderedFrames: number;
  expectedFrames: number;
  droppedFrames: number;
  /** Takes at least 700ms to render */
  frozenFrames: number;
  /** Takes at least 17ms to render */
  slowFrames: number;
  freezeTime: number;
  sessionDuration: number;
};

export type IMetric = {
  timestamp: string;
  category: string;
  name: string;
  value: number;
  sessionId: string;
  routeName?: string | null;
  params?: Record<string, unknown>;
};

export type IMetricAttributes = {
  routeName?: string | null;
  params?: Record<string, unknown>;
};

/** Ordered from least to most severe */
export type ILogSeverity =
  'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export type ILogAttributeValue =
  | string
  | number
  | boolean
  | ILogAttributeValue[]
  | { [key: string]: ILogAttributeValue };

export type ILogRecord = {
  timestamp: string;
  name: string;
  body?: string | null;
  attributes?: Record<string, ILogAttributeValue> | null;
  severity: ILogSeverity;
};

export type ILogEventOptions = {
  displayName?: string | null;
  body?: string | null;
  attributes?: Record<string, ILogAttributeValue> | null;
  /** @default 'info' */
  severity?: ILogSeverity | null;
};

export type ISessionType =
  'main' | 'foreground' | 'screen' | 'custom' | 'unknown';

/** Every `IMetric` field except `sessionId`, implied by the owning session */
export type IMetricInput = Omit<IMetric, 'sessionId'>;

export type ICallStackFrame = {
  /** @platform ios */
  binaryName?: string | null;
  /** @platform ios */
  binaryUUID?: string | null;
  /** @platform ios */
  address?: number | null;
  /** @platform ios */
  offsetIntoBinaryTextSegment?: number | null;
  /** @platform ios */
  sampleCount?: number | null;
  subFrames?: ICallStackFrame[] | null;
  /** ios: on-device `dladdr` symbolication. android: the JVM stack-trace frame string */
  symbol?: string | null;
};

export type ICallStack = {
  threadAttributed?: boolean | null;
  callStackRootFrames?: ICallStackFrame[] | null;
};

export type ICallStackTree = {
  callStacks?: ICallStack[] | null;
};

/** ios (MetricKit) reports the numeric fields; android reports `exceptionReason` as a string */
export type ICrashReport = {
  /** @platform ios */
  exceptionType?: number | null;
  /** @platform ios */
  exceptionCode?: number | null;
  /** Unix signal number, e.g. SIGSEGV = 11 */
  signal?: number | null;
  terminationReason?: string | null;
  /** @platform ios */
  virtualMemoryRegionInfo?: string | null;
  /** ios: a structured MetricKit reason object. android: a plain composed string */
  exceptionReason?:
    | {
        composedMessage: string;
        formatString: string;
        arguments: string[];
        exceptionType: string;
        className: string;
        exceptionName: string;
      }
    | string
    | null;
  callStackTree?: ICallStackTree | null;
  /** `null` for an orphan crash with no attributable session. @platform android */
  sessionId?: string | null;
  appVersion: string;
  timestampBegin: string;
  /** @platform ios */
  timestampEnd?: string;
  ingestedAt: string;
};

export type INetworkRequestStartedEvent = {
  id: string;
  url: string;
  method: string;
  startedAt: string;
};

export type INetworkRequestRedirect = {
  fromUrl: string;
  toUrl: string;
  statusCode: number;
};

export type INetworkRequestCompletedEvent = {
  id: string;
  url: string;
  method: string;
  statusCode: number | null;
  networkProtocol: string | null;
  requestBytesSent: number | null;
  responseBytesReceived: number | null;
  errorDescription: string | null;
  startedAt: string | null;
  completedAt: string | null;
  totalDuration: number;
  redirects: INetworkRequestRedirect[];
};

/** An unset field places no constraint; fields AND together, entries within one OR together */
export type INetworkRequestFilter = {
  hosts?: string[] | null;
  methods?: string[] | null;
};

export type INetworkRequestObserverEvents = {
  requestStarted(event: INetworkRequestStartedEvent): void;
  requestCompleted(event: INetworkRequestCompletedEvent): void;
};

/** Debug-only, from `getInactiveSessions()` as a plain eager record, not a shared object */
export type IDebugSession = {
  id: string;
  type: ISessionType;
  startDate: string;
  endDate?: string | null;
  metrics: IMetric[];
  logs: ILogRecord[];
  crashReport?: ICrashReport | null;
};

/** Recorded natively as an OpenTelemetry-shaped `js.exception` log event */
export type IReportErrorInput = {
  source: 'global' | 'errorBoundary' | 'reportedByUser';
  type?: string;
  message: string;
  stacktrace?: string;
  /** The React component stack, error-boundary captures only */
  componentStack?: string;
  isFatal: boolean;
};
