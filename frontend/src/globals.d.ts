// i18next globals (from i18n.js loaded before app.js)
declare function t(key: string, opts?: Record<string, unknown>): string;
declare function getLocale(): string;
declare function translateDOM(): void;
declare const i18next: {
  isInitialized: boolean;
  t: typeof t;
  resolvedLanguage: string;
};

// socket.io global
declare function io(url: string, opts?: {
  path?: string;
  transports?: string[];
}): {
  on(event: string, handler: (...args: unknown[]) => void): void;
  disconnect(): void;
};
