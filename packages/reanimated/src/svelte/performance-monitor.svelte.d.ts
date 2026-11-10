import type { Component } from 'svelte';
import type { IPerformanceMonitorProps } from '../core/performance-monitor';

export type { IPerformanceMonitorProps };

declare const PerformanceMonitor: Component<IPerformanceMonitorProps>;
export default PerformanceMonitor;
