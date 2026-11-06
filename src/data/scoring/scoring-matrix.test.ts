/**
 * Unit tests for src/data/scoring/scoring-matrix.ts
 *
 * Strategy: exercise evaluateAnswers() through its public contract –
 * inputs (answers record + stage string) → output (DashboardResult).
 * No mocks needed: the function is pure (no I/O, no side-effects).
 *
 * Coverage targets:
 *   ✓ Empty input → stable defaults
 *   ✓ Scale answers (number ≥ 4) mapped to correct tendency
 *   ✓ Keyword answers (string / string[]) accumulated correctly
 *   ✓ Minimum-evidence rule (< 2 → excluded from tendencies)
 *   ✓ Maximum-tendencies cap (≤ 3 returned)
 *   ✓ Quality thresholds: Low (<3), Medium (3-4), High (≥5)
 *   ✓ Radar data shape and boundary values
 *   ✓ dominancePattern fallback to "Balanced Individual"
 *   ✓ Multi-category answer (single keyword maps to multiple tendencies)
 *   ✓ Stage parameter is accepted without error (future-proofing)
 */

import { describe, it, expect } from 'vitest';
import { evaluateAnswers, type DashboardResult, type Tendency } from './scoring-matrix';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const emptyAnswers = () => ({} as Record<string, string | number | boolean | string[]>);

function findTendency(result: DashboardResult, id: string): Tendency | undefined {
  return result.tendencies.find(t => t.id === id);
}

// ---------------------------------------------------------------------------
// Suite 1 – Empty / zero-evidence input
// ---------------------------------------------------------------------------

describe('evaluateAnswers – empty / zero-evidence input', () => {
  it('returns a DashboardResult object with all required keys', () => {
    const result = evaluateAnswers(emptyAnswers(), 'adult');
    expect(result).toHaveProperty('dominancePattern');
    expect(result).toHaveProperty('radarData');
    expect(result).toHaveProperty('tendencies');
  });

  it('returns dominancePattern as "Balanced Individual" when no answers provided', () => {
    const result = evaluateAnswers(emptyAnswers(), 'adult');
    expect(result.dominancePattern).toBe('Balanced Individual');
  });

  it('returns an empty tendencies array when no answers are provided (minimum-evidence rule)', () => {
    const result = evaluateAnswers(emptyAnswers(), 'adult');
    expect(result.tendencies).toHaveLength(0);
  });

  it('still returns a fully populated radarData array (6 categories) even with no answers', () => {
    const result = evaluateAnswers(emptyAnswers(), 'adult');
    expect(result.radarData).toHaveLength(6);
    result.radarData.forEach(entry => {
      expect(entry).toHaveProperty('subject');
      expect(entry).toHaveProperty('A');
      expect(entry).toHaveProperty('fullMark', 100);
    });
  });

  it('returns A values ≥ 20 (base-offset) when no scale answers given', () => {
    const result = evaluateAnswers(emptyAnswers(), 'adult');
    result.radarData.forEach(entry => {
      expect(entry.A).toBeGreaterThanOrEqual(20);
    });
  });
});

// ---------------------------------------------------------------------------
// Suite 2 – Scale (number ≥ 4) signal mapping
// ---------------------------------------------------------------------------

describe('evaluateAnswers – scale answer signals', () => {
  it('Q-01 ≥ 4 increments Exploration-Oriented score', () => {
    // With only 1 evidence point the tendency must NOT appear (min-evidence = 2)
    // so we verify it via a second signal:
    const answers2 = { 'Q-01': 5, 'Q-14': 4 };
    const result2 = evaluateAnswers(answers2, 'adult');
    const tendency = findTendency(result2, 'exploration-oriented');
    expect(tendency).toBeDefined();
    expect(tendency!.evidenceCount).toBeGreaterThanOrEqual(2);
  });

  it('Q-02 and Q-21 both ≥ 4 accumulate Structured Executor score', () => {
    const answers = { 'Q-02': 4, 'Q-21': 5 };
    const result = evaluateAnswers(answers, 'adult');
    const tendency = findTendency(result, 'structured-executor');
    expect(tendency).toBeDefined();
    expect(tendency!.evidenceCount).toBe(2);
  });

  it('Q-27 ≥ 4 increments Human-Centered Contributor (single signal – excluded by min-evidence)', () => {
    const answers = { 'Q-27': 5 };
    const result = evaluateAnswers(answers, 'adult');
    // 1 evidence → must be excluded
    const tendency = findTendency(result, 'human-centered-contributor');
    expect(tendency).toBeUndefined();
  });

  it('scale answer < 4 does NOT increment any score', () => {
    // Q-01 with value 3 should be below threshold
    const answers = { 'Q-01': 3, 'Q-14': 3 };
    const result = evaluateAnswers(answers, 'adult');
    const tendency = findTendency(result, 'exploration-oriented');
    expect(tendency).toBeUndefined();
  });

  it('Q-08 and Q-23 ≥ 4 accumulate Analytical Problem Solver', () => {
    const answers = { 'Q-08': 5, 'Q-23': 5 };
    const result = evaluateAnswers(answers, 'adult');
    const tendency = findTendency(result, 'analytical-problem-solver');
    expect(tendency).toBeDefined();
    expect(tendency!.evidenceCount).toBeGreaterThanOrEqual(2);
  });

  it('Q-11 and Q-17 ≥ 4 accumulate Adaptive Growth Seeker', () => {
    const answers = { 'Q-11': 4, 'Q-17': 5 };
    const result = evaluateAnswers(answers, 'adult');
    const tendency = findTendency(result, 'adaptive-growth-seeker');
    expect(tendency).toBeDefined();
    expect(tendency!.evidenceCount).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Suite 3 – Keyword (string / string[]) signal mapping
// ---------------------------------------------------------------------------

describe('evaluateAnswers – keyword answer signals', () => {
  it('a string answer matching a keyword increments its category', () => {
    // "Kreatif" → Creative Maker; pair with another keyword to pass min-evidence
    const answers = { 'q1': 'Kreatif', 'q2': 'Berkarya' };
    const result = evaluateAnswers(answers, 'adult');
    const tendency = findTendency(result, 'creative-maker');
    expect(tendency).toBeDefined();
    expect(tendency!.evidenceCount).toBeGreaterThanOrEqual(2);
  });

  it('an array answer contributes one evidence point per matching keyword element', () => {
    // Both "Berkomunikasi" (Human-Centered) and "Lembut dan mendukung" (Human-Centered)
    const answers = { 'q1': ['Berkomunikasi', 'Lembut dan mendukung'] };
    const result = evaluateAnswers(answers, 'adult');
    const tendency = findTendency(result, 'human-centered-contributor');
    expect(tendency).toBeDefined();
    expect(tendency!.evidenceCount).toBeGreaterThanOrEqual(2);
  });

  it('a keyword absent from the map contributes 0 evidence', () => {
    const answers = { 'q1': 'UNKNOWN_KEYWORD_XYZ' };
    const result = evaluateAnswers(answers, 'adult');
    // All tendencies should still have 0 evidence → none returned
    expect(result.tendencies).toHaveLength(0);
  });

  it('"Jujur" maps to Analytical Problem Solver', () => {
    const answers = { 'q1': 'Jujur', 'q2': 'Menganalisis' };
    const result = evaluateAnswers(answers, 'adult');
    const tendency = findTendency(result, 'analytical-problem-solver');
    expect(tendency).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Suite 4 – Minimum-evidence rule (< 2 excluded)
// ---------------------------------------------------------------------------

describe('evaluateAnswers – minimum-evidence rule', () => {
  it('excludes a tendency with exactly 1 evidence point from the output', () => {
    // "Teliti" → Structured Executor (1 point only)
    const answers = { 'q1': 'Teliti' };
    const result = evaluateAnswers(answers, 'adult');
    const tendency = findTendency(result, 'structured-executor');
    expect(tendency).toBeUndefined();
  });

  it('includes a tendency with exactly 2 evidence points', () => {
    const answers = { 'q1': 'Teliti', 'q2': 'Tekun' };
    const result = evaluateAnswers(answers, 'adult');
    const tendency = findTendency(result, 'structured-executor');
    expect(tendency).toBeDefined();
    expect(tendency!.evidenceCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Suite 5 – Quality threshold mapping
// ---------------------------------------------------------------------------

describe('evaluateAnswers – quality thresholds', () => {
  it('assigns "Low" quality when evidenceCount is 2', () => {
    const answers = { 'q1': 'Teliti', 'q2': 'Tekun' };
    const result = evaluateAnswers(answers, 'adult');
    const tendency = findTendency(result, 'structured-executor');
    expect(tendency!.quality).toBe('Low');
  });

  it('assigns "Medium" quality when evidenceCount is 3', () => {
    const answers = { 'q1': 'Teliti', 'q2': 'Tekun', 'q3': 'Mengatur sesuatu' };
    const result = evaluateAnswers(answers, 'adult');
    const tendency = findTendency(result, 'structured-executor');
    expect(tendency!.quality).toBe('Medium');
  });

  it('assigns "High" quality when evidenceCount reaches 5', () => {
    const answers = {
      'q1': 'Teliti',
      'q2': 'Tekun',
      'q3': 'Mengatur sesuatu',
      'q4': 'Merasa aman',
      'q5': 'Terstruktur',
    };
    const result = evaluateAnswers(answers, 'adult');
    const tendency = findTendency(result, 'structured-executor');
    expect(tendency!.quality).toBe('High');
    expect(tendency!.evidenceCount).toBeGreaterThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// Suite 6 – Maximum tendencies cap (≤ 3)
// ---------------------------------------------------------------------------

describe('evaluateAnswers – maximum tendencies cap', () => {
  it('returns at most 3 tendencies regardless of how many categories meet minimum evidence', () => {
    const answers = {
      'Q-01': 5, 'Q-14': 4,                               // Exploration ×2
      'Q-02': 5, 'Q-21': 5,                               // Structured ×2
      'Q-27': 5, 'q1': 'Berkomunikasi', 'q2': 'Peduli',  // Human ×3
      'Q-08': 5, 'Q-23': 5,                               // Analytical ×2
      'Q-11': 5, 'Q-17': 5,                               // Adaptive ×2
    };
    const result = evaluateAnswers(answers, 'adult');
    expect(result.tendencies.length).toBeLessThanOrEqual(3);
  });

  it('returns tendencies sorted by evidenceCount descending', () => {
    const answers = {
      // Give Human-Centered the most evidence
      'q1': 'Berkomunikasi', 'q2': 'Lembut dan mendukung', 'q3': 'Peduli',
      'q4': 'Membantu orang', 'q5': 'Membimbing',         // 5 Human evidence
      'Q-02': 5, 'Q-21': 5,                               // 2 Structured
      'Q-08': 5, 'Q-23': 5,                               // 2 Analytical
    };
    const result = evaluateAnswers(answers, 'adult');
    // First tendency must have >= evidenceCount of second
    const counts = result.tendencies.map(t => t.evidenceCount);
    for (let i = 0; i < counts.length - 1; i++) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i + 1]);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 7 – dominancePattern
// ---------------------------------------------------------------------------

describe('evaluateAnswers – dominancePattern', () => {
  it('is "Balanced Individual" when all scores are zero', () => {
    expect(evaluateAnswers(emptyAnswers(), 'adult').dominancePattern).toBe('Balanced Individual');
  });

  it('equals the label of the highest-scoring tendency', () => {
    const answers = {
      'q1': 'Berkomunikasi', 'q2': 'Peduli', 'q3': 'Membimbing',
    };
    const result = evaluateAnswers(answers, 'adult');
    // Human-Centered Contributor has the most points
    expect(result.dominancePattern).toBe('Human-Centered Contributor');
  });
});

// ---------------------------------------------------------------------------
// Suite 8 – stage parameter passthrough
// ---------------------------------------------------------------------------

describe('evaluateAnswers – stage parameter', () => {
  it.each(['child', 'teenager', 'adult', null])(
    'accepts stage="%s" without throwing',
    (stage) => {
      expect(() => evaluateAnswers(emptyAnswers(), stage)).not.toThrow();
    }
  );
});

// ---------------------------------------------------------------------------
// Suite 9 – Radar data correctness
// ---------------------------------------------------------------------------

describe('evaluateAnswers – radarData', () => {
  it('radarData A values are capped at 100', () => {
    // Flood one category with extreme evidence to test cap
    const answers: Record<string, string | number> = {};
    for (let i = 0; i < 20; i++) {
      answers[`q${i}`] = 'Berkomunikasi'; // Human-Centered keyword, all unique keys
    }
    // Override: keywords are deduplicated by value in a flat array so multiple
    // identical string values only count once per unique key → use unique keywords
    const bigAnswers = {
      q1: 'Berkomunikasi', q2: 'Peduli', q3: 'Membimbing',
      q4: 'Membantu orang', q5: 'Pendengar', q6: 'Penengah',
      q7: 'Lembut dan mendukung', q8: 'Menenangkan orang',
    };
    const result = evaluateAnswers(bigAnswers, 'adult');
    result.radarData.forEach(entry => {
      expect(entry.A).toBeLessThanOrEqual(100);
    });
  });

  it('every radarData entry has the correct schema', () => {
    const result = evaluateAnswers(emptyAnswers(), 'adult');
    result.radarData.forEach(entry => {
      expect(typeof entry.subject).toBe('string');
      expect(typeof entry.A).toBe('number');
      expect(entry.fullMark).toBe(100);
    });
  });
});

// ---------------------------------------------------------------------------
// Suite 10 – Tendency id format
// ---------------------------------------------------------------------------

describe('evaluateAnswers – tendency id format', () => {
  it('tendency id is kebab-case lowercase of the label', () => {
    const answers = { 'Q-08': 5, 'Q-23': 5 };
    const result = evaluateAnswers(answers, 'adult');
    const tendency = result.tendencies[0];
    // Should match "analytical-problem-solver"
    expect(tendency.id).toMatch(/^[a-z][a-z0-9-]+$/);
    expect(tendency.id).toBe(tendency.label.toLowerCase().replace(/ /g, '-'));
  });
});

describe('evaluateAnswers – maintenance regressions', () => {
  it('scores the "Pengatur tugas" option (Q-26) for Structured Executor', () => {
    const result = evaluateAnswers({ 'Q-26': 'Pengatur tugas', 'Q-x': 'Teliti' }, 'adult');
    const structured = result.tendencies.find(t => t.label === 'Structured Executor');
    expect(structured?.evidenceCount).toBe(2);
  });

  it('ignores identity answers (Q-ID-*) even when they equal a keyword', () => {
    const result = evaluateAnswers({ 'Q-ID-01': 'Kreatif', 'Q-ID-03': 'Kreatif' }, 'adult');
    expect(result.dominancePattern).toBe('Balanced Individual');
  });

  it('keeps a fixed radar axis order regardless of scores', () => {
    const a = evaluateAnswers({ 'Q-a': 'Kreatif' }, 'adult').radarData.map(r => r.subject);
    const b = evaluateAnswers({ 'Q-a': 'Peduli' }, 'adult').radarData.map(r => r.subject);
    expect(a).toEqual(b);
  });
});
