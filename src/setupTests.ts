import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import idTranslations from './locales/id/translation.json';
// Automatically cleanup React testing library trees after each test
afterEach(() => {
  cleanup();
});

// Mock ResizeObserver for Radix UI components in jsdom
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Global mock for react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => {
    return {
      t: (key: string) => (idTranslations as Record<string, string>)[key] || key,
      i18n: {
        changeLanguage: () => new Promise(() => {}),
        language: 'id',
      },
    };
  },
  initReactI18next: {
    type: '3rdParty',
    init: () => {},
  }
}));
