/**
 * Unit tests for src/store/useAssessmentStore.ts
 *
 * Strategy: Exercise the Zustand store's state transitions in isolation.
 * We use a Vitest mock for localStorage so the `persist` middleware can
 * serialise/deserialise without a real browser environment.
 *
 * Coverage targets:
 *   ✓ Default state shape on first use
 *   ✓ setStage   – valid values and null reset
 *   ✓ setUserName
 *   ✓ setAnswer  – add, update, multi-key coexistence
 *   ✓ nextSlide  – increments index
 *   ✓ prevSlide  – decrements index, floor at 0
 *   ✓ setSlideIndex – arbitrary jump
 *   ✓ completeAssessment – sets isCompleted
 *   ✓ resetAssessment   – restores all defaults
 *   ✓ Combined flow: stage → answers → complete → reset cycle
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Polyfill localStorage for jsdom (persist middleware needs it)
// ---------------------------------------------------------------------------
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

// Import AFTER polyfilling so the persist middleware binds to the mock
import { useAssessmentStore } from './useAssessmentStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Grab a clean snapshot of the current store state */
const getState = () => useAssessmentStore.getState();

type Stage = Parameters<ReturnType<typeof getState>['setStage']>[0];

// ---------------------------------------------------------------------------
// Setup: reset store AND localStorage before each test so tests are isolated
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorageMock.clear();
  getState().resetAssessment();
});

// ---------------------------------------------------------------------------
// Suite 1 – Default state
// ---------------------------------------------------------------------------

describe('useAssessmentStore – default state', () => {
  it('stage is null', () => {
    expect(getState().stage).toBeNull();
  });

  it('userName is an empty string', () => {
    expect(getState().userName).toBe('');
  });

  it('answers is an empty object', () => {
    expect(getState().answers).toEqual({});
  });

  it('currentSlideIndex is 0', () => {
    expect(getState().currentSlideIndex).toBe(0);
  });

  it('isCompleted is false', () => {
    expect(getState().isCompleted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Suite 2 – setStage
// ---------------------------------------------------------------------------

describe('useAssessmentStore – setStage', () => {
  it.each(['child', 'teenager', 'adult'] as const)('accepts stage "%s"', (stage) => {
    getState().setStage(stage);
    expect(getState().stage).toBe(stage);
  });

  it('accepts null to clear stage', () => {
    getState().setStage('adult');
    getState().setStage(null);
    expect(getState().stage).toBeNull();
  });

  it('does not mutate other state fields', () => {
    getState().setUserName('Alice');
    // 'teen' is deliberately outside the Stage union to exercise an invalid value.
    getState().setStage('teen' as unknown as Stage);
    expect(getState().userName).toBe('Alice');
  });
});

// ---------------------------------------------------------------------------
// Suite 3 – setUserName
// ---------------------------------------------------------------------------

describe('useAssessmentStore – setUserName', () => {
  it('stores the provided name', () => {
    getState().setUserName('Budi');
    expect(getState().userName).toBe('Budi');
  });

  it('replaces a previously set name', () => {
    getState().setUserName('Budi');
    getState().setUserName('Sari');
    expect(getState().userName).toBe('Sari');
  });

  it('accepts an empty string to clear the name', () => {
    getState().setUserName('Budi');
    getState().setUserName('');
    expect(getState().userName).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Suite 4 – setAnswer
// ---------------------------------------------------------------------------

describe('useAssessmentStore – setAnswer', () => {
  it('adds a new string answer under the given question id', () => {
    getState().setAnswer('Q-01', 'integrity');
    expect(getState().answers['Q-01']).toBe('integrity');
  });

  it('adds a numeric answer', () => {
    getState().setAnswer('Q-02', 4);
    expect(getState().answers['Q-02']).toBe(4);
  });

  it('adds a boolean answer', () => {
    getState().setAnswer('Q-03', true);
    expect(getState().answers['Q-03']).toBe(true);
  });

  it('adds a string-array answer', () => {
    getState().setAnswer('Q-06', ['Kreatif', 'Berani mencoba']);
    expect(getState().answers['Q-06']).toEqual(['Kreatif', 'Berani mencoba']);
  });

  it('overwrites a previous answer for the same question id', () => {
    getState().setAnswer('Q-01', 'first');
    getState().setAnswer('Q-01', 'second');
    expect(getState().answers['Q-01']).toBe('second');
  });

  it('accumulates multiple answers without overwriting unrelated keys', () => {
    getState().setAnswer('Q-01', 'alpha');
    getState().setAnswer('Q-02', 5);
    expect(getState().answers['Q-01']).toBe('alpha');
    expect(getState().answers['Q-02']).toBe(5);
    expect(Object.keys(getState().answers)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Suite 5 – nextSlide / prevSlide / setSlideIndex
// ---------------------------------------------------------------------------

describe('useAssessmentStore – slide navigation', () => {
  it('nextSlide increments currentSlideIndex by 1', () => {
    getState().nextSlide();
    expect(getState().currentSlideIndex).toBe(1);
  });

  it('nextSlide can be called multiple times', () => {
    getState().nextSlide();
    getState().nextSlide();
    getState().nextSlide();
    expect(getState().currentSlideIndex).toBe(3);
  });

  it('prevSlide decrements currentSlideIndex by 1', () => {
    getState().nextSlide();
    getState().nextSlide();
    getState().prevSlide();
    expect(getState().currentSlideIndex).toBe(1);
  });

  it('prevSlide floors at 0 and does not go negative', () => {
    expect(getState().currentSlideIndex).toBe(0);
    getState().prevSlide();
    expect(getState().currentSlideIndex).toBe(0);
  });

  it('setSlideIndex jumps to the specified index', () => {
    getState().setSlideIndex(10);
    expect(getState().currentSlideIndex).toBe(10);
  });

  it('setSlideIndex to 0 resets position', () => {
    getState().nextSlide();
    getState().nextSlide();
    getState().setSlideIndex(0);
    expect(getState().currentSlideIndex).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 6 – completeAssessment
// ---------------------------------------------------------------------------

describe('useAssessmentStore – completeAssessment', () => {
  it('sets isCompleted to true', () => {
    getState().completeAssessment();
    expect(getState().isCompleted).toBe(true);
  });

  it('does not mutate other fields', () => {
    getState().setStage('adult');
    getState().setUserName('Rani');
    getState().completeAssessment();
    expect(getState().stage).toBe('adult');
    expect(getState().userName).toBe('Rani');
  });
});

// ---------------------------------------------------------------------------
// Suite 7 – resetAssessment
// ---------------------------------------------------------------------------

describe('useAssessmentStore – resetAssessment', () => {
  it('clears stage back to null', () => {
    getState().setStage('adult');
    getState().resetAssessment();
    expect(getState().stage).toBeNull();
  });

  it('clears userName', () => {
    getState().setUserName('Alex');
    getState().resetAssessment();
    expect(getState().userName).toBe('');
  });

  it('clears all answers', () => {
    getState().setAnswer('Q-01', 5);
    getState().resetAssessment();
    expect(getState().answers).toEqual({});
  });

  it('resets currentSlideIndex to 0', () => {
    getState().nextSlide();
    getState().nextSlide();
    getState().resetAssessment();
    expect(getState().currentSlideIndex).toBe(0);
  });

  it('resets isCompleted to false', () => {
    getState().completeAssessment();
    getState().resetAssessment();
    expect(getState().isCompleted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Suite 8 – Full lifecycle integration
// ---------------------------------------------------------------------------

describe('useAssessmentStore – full assessment lifecycle', () => {
  it('survives a complete stage → answer → complete → reset cycle', () => {
    // Setup
    getState().setStage('adult');
    getState().setUserName('Dewi');
    getState().setAnswer('Q-01', 5);
    getState().setAnswer('Q-06', ['Kreatif']);
    getState().nextSlide();
    getState().nextSlide();
    getState().completeAssessment();

    expect(getState().stage).toBe('adult');
    expect(getState().userName).toBe('Dewi');
    expect(getState().isCompleted).toBe(true);
    expect(getState().currentSlideIndex).toBe(2);

    // Tear down
    getState().resetAssessment();

    expect(getState().stage).toBeNull();
    expect(getState().userName).toBe('');
    expect(getState().answers).toEqual({});
    expect(getState().currentSlideIndex).toBe(0);
    expect(getState().isCompleted).toBe(false);
  });
});
