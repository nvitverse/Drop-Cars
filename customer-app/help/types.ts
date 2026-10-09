export type HelpSeverity = 'info' | 'warning' | 'blocking';

export interface HelpStep {
  title?: string;
  description: string;
}

export interface HelpAction {
  label: string;
  route?: string;
  onPress?: () => void;
}

export interface HelpContext {
  screen?: string;
  code?: string;
  bookingId?: string | number;
  appBuild?: string;
  language?: string;
  extra?: Record<string, any>;
}

export interface HelpEntry {
  code: string;
  title: string;
  what: string;
  why: string;
  steps: Array<HelpStep | string>;
  action?: HelpAction;
  severity: HelpSeverity;
  contact?: boolean;
}
