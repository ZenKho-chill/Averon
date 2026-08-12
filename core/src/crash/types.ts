/**
 * Types cho core/crash — anti-crash handlers + quarantine logic (CLAUDE.md §9).
 * EN: Types for core/crash — anti-crash handlers and quarantine logic.
 */

export interface CrashReport {
  timestamp: string;
  error: {
    name: string;
    message: string;
    stack?: string;
  };
  context: {
    appVersion: string;
    nodeVersion: string;
    modules: {
      name: string;
      state: 'REGISTERED' | 'LOADING' | 'LOADED' | 'RUNNING' | 'DRAINING' | 'UNLOADED' | 'FAULTED';
    }[];
  };
  quarantine?: QuarantineModule;
}

export interface QuarantineModule {
  name: string;
  reason: string;
  timestamp: string;
  failureCount: number;
}
