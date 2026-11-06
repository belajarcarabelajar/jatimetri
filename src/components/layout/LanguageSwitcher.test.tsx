import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const changeLanguage = vi.fn(() => Promise.resolve());
let language = 'id';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage, language, resolvedLanguage: language },
  }),
}));

import { LanguageSwitcher } from './LanguageSwitcher';

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    changeLanguage.mockClear();
    language = 'id';
  });

  it('marks the current language as pressed', () => {
    render(<LanguageSwitcher />);
    expect(screen.getByRole('button', { name: 'Bahasa Indonesia' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('switches language on click', () => {
    render(<LanguageSwitcher />);
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(changeLanguage).toHaveBeenCalledWith('en');
  });

  it('does nothing when the active language is clicked', () => {
    render(<LanguageSwitcher />);
    fireEvent.click(screen.getByRole('button', { name: 'Bahasa Indonesia' }));
    expect(changeLanguage).not.toHaveBeenCalled();
  });
});
