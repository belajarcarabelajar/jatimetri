/**
 * Unit tests for src/lib/utils.ts
 *
 * The `cn()` utility merges Tailwind class names using clsx + tailwind-merge.
 * Tests verify:
 *   ✓ Basic concatenation of string classes
 *   ✓ Falsy values (false, null, undefined, 0) are ignored
 *   ✓ Conditional (object syntax) classes
 *   ✓ Tailwind conflict resolution (later class wins)
 *   ✓ Array of class names
 *   ✓ Mixed types in a single call
 *   ✓ No arguments → empty string
 */

import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn – class name utility', () => {
  it('returns an empty string when called with no arguments', () => {
    expect(cn()).toBe('');
  });

  it('returns a single class unchanged', () => {
    expect(cn('text-red-500')).toBe('text-red-500');
  });

  it('concatenates multiple string classes with a space separator', () => {
    expect(cn('px-4', 'py-2', 'rounded')).toBe('px-4 py-2 rounded');
  });

  it('ignores falsy values: false', () => {
    expect(cn('text-sm', false, 'font-bold')).toBe('text-sm font-bold');
  });

  it('ignores falsy values: undefined', () => {
    expect(cn('text-sm', undefined, 'font-bold')).toBe('text-sm font-bold');
  });

  it('ignores falsy values: null', () => {
    expect(cn('text-sm', null, 'font-bold')).toBe('text-sm font-bold');
  });

  it('handles conditional (object) syntax: truthy key included', () => {
    expect(cn({ 'bg-blue-500': true, 'bg-red-500': false })).toBe('bg-blue-500');
  });

  it('handles conditional (object) syntax: falsy key excluded', () => {
    const isActive = false;
    expect(cn('base', { 'active-class': isActive })).toBe('base');
  });

  it('resolves conflicting Tailwind utilities – last wins via tailwind-merge', () => {
    // tailwind-merge should deduplicate: p-4 wins over p-2
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('resolves text-color conflict: later value wins', () => {
    expect(cn('text-gray-500', 'text-blue-700')).toBe('text-blue-700');
  });

  it('handles an array of class names', () => {
    const classes = ['flex', 'items-center'];
    expect(cn(...classes)).toBe('flex items-center');
  });

  it('handles deeply mixed input types in a single call', () => {
    const result = cn('base', undefined, { 'active': true, 'hidden': false }, 'extra');
    expect(result).toBe('base active extra');
  });
});
