import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AssessmentFlow } from './AssessmentFlow';
import type { QuestionCard as RealQuestionCard } from './components/QuestionCard';
import { useAssessmentStore } from '@/store/useAssessmentStore';
import { v1Bank } from '@/data/questions/v1-bank';

type StoreState = ReturnType<typeof useAssessmentStore.getState>;
type MockStoreState = Pick<
  StoreState,
  'currentSlideIndex' | 'setSlideIndex' | 'answers' | 'setAnswer' | 'setUserName' | 'setStage' | 'resetAssessment'
>;

vi.mock('react-router', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/store/useAssessmentStore', () => ({
  useAssessmentStore: vi.fn(),
}));

// Mock QuestionCard so we don't need to test its internals here
vi.mock('./components/QuestionCard', () => ({
  QuestionCard: ({ question, onNext, onAnswer, headingRef }: React.ComponentProps<typeof RealQuestionCard>) => (
    <div data-testid="question-card">
      <h3 ref={headingRef} tabIndex={-1}>{question.prompt}</h3>
      {question.inputType === 'text' && <input aria-label="Nama kamu" autoFocus />}
      <button onClick={() => onAnswer('mock-answer')}>Answer Mock</button>
      <button onClick={onNext}>Next Mock</button>
    </div>
  ),
}));

describe('AssessmentFlow', () => {
  let storeState: MockStoreState;

  beforeEach(() => {
    storeState = {
      currentSlideIndex: 0,
      setSlideIndex: vi.fn(),
      answers: {},
      setAnswer: vi.fn(),
      setUserName: vi.fn(),
      setStage: vi.fn(),
      resetAssessment: vi.fn(),
    };

    vi.mocked(useAssessmentStore).mockImplementation((selector?: unknown) => {
      if (typeof selector === 'function') {
        return selector(storeState);
      }
      return storeState;
    });
  });

  it('renders correctly', () => {
    render(<AssessmentFlow />);
    // Check progress
    expect(screen.getByText(/Progress:/)).toBeInTheDocument();
    // Check mocked question card
    expect(screen.getAllByTestId('question-card')[0]).toBeInTheDocument();
    // Check Next/Prev controls
    expect(screen.getByRole('button', { name: /sebelumnya/i })).toBeDisabled();
  });

  it('handles prev/next controls correctly', () => {
    storeState.currentSlideIndex = 1;
    storeState.answers = { "Q-ID-01": "John" }; // So it thinks it's answered and enables Next
    
    render(<AssessmentFlow />);
    
    // Prev button should be enabled on slide 1
    const prevBtn = screen.getByRole('button', { name: /sebelumnya/i });
    expect(prevBtn).not.toBeDisabled();
    
    fireEvent.click(prevBtn);
    expect(storeState.setSlideIndex).toHaveBeenCalledWith(0);
  });
  
  it('calls setAnswer when answering', () => {
    render(<AssessmentFlow />);
    const buttons = screen.getAllByRole('button', { name: 'Answer Mock' });
    fireEvent.click(buttons[0]);
    // Assuming Q-ID-01 is the first question in v1Bank
    expect(storeState.setAnswer).toHaveBeenCalled();
  });

  describe('accessibility', () => {
    const originalMatchMedia = window.matchMedia;

    afterEach(() => {
      window.matchMedia = originalMatchMedia;
    });

    const mockViewport = (desktop: boolean) => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: desktop,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })) as unknown as typeof window.matchMedia;
    };

    const mobileSlides = (container: HTMLElement) =>
      Array.from(container.querySelectorAll<HTMLElement>('.md\\:hidden [data-slide]'));

    it('makes only the current mobile slide focusable and visible to assistive tech', () => {
      storeState.currentSlideIndex = 2;
      const { container } = render(<AssessmentFlow />);
      const slides = mobileSlides(container);
      expect(slides).toHaveLength(v1Bank.length);
      slides.forEach((slide, index) => {
        if (index === 2) {
          expect(slide).not.toHaveAttribute('inert');
          expect(slide).not.toHaveAttribute('aria-hidden');
        } else {
          expect(slide).toHaveAttribute('inert');
          expect(slide).toHaveAttribute('aria-hidden', 'true');
        }
      });
    });

    it('offers a mobile "Kembali" control that is disabled on the first slide', () => {
      render(<AssessmentFlow />);
      expect(screen.getByRole('button', { name: /kembali/i })).toBeDisabled();
    });

    it('mobile "Kembali" goes to the previous slide', () => {
      storeState.currentSlideIndex = 3;
      render(<AssessmentFlow />);
      const back = screen.getByRole('button', { name: /kembali/i });
      expect(back).not.toBeDisabled();
      fireEvent.click(back);
      expect(storeState.setSlideIndex).toHaveBeenCalledWith(2);
    });

    it('labels the progress bar with the question position', () => {
      storeState.currentSlideIndex = 4;
      render(<AssessmentFlow />);
      const progress = screen.getByRole('progressbar', { name: `Pertanyaan 5 dari ${v1Bank.length}` });
      expect(progress).toHaveAttribute('aria-valuetext', `Pertanyaan 5 dari ${v1Bank.length}`);
    });

    it('does not move focus to the question heading on initial mount', () => {
      storeState.currentSlideIndex = 3;
      render(<AssessmentFlow />);
      expect(document.activeElement?.tagName).not.toBe('H3');
    });

    it('moves focus to the new desktop question heading after a slide change', () => {
      mockViewport(true);
      storeState.currentSlideIndex = 3;
      const { container, rerender } = render(<AssessmentFlow />);
      storeState.currentSlideIndex = 4;
      rerender(<AssessmentFlow />);
      const desktopHeading = container.querySelector('.md\\:flex [data-slide] h3');
      expect(desktopHeading).not.toBeNull();
      expect(document.activeElement).toBe(desktopHeading);
    });

    it('moves focus to the current mobile slide heading on small screens', () => {
      mockViewport(false);
      storeState.currentSlideIndex = 3;
      const { container, rerender } = render(<AssessmentFlow />);
      storeState.currentSlideIndex = 4;
      rerender(<AssessmentFlow />);
      expect(document.activeElement).toBe(mobileSlides(container)[4].querySelector('h3'));
    });

    it('keeps an autofocused input focused when returning to the name question', () => {
      mockViewport(true);
      storeState.currentSlideIndex = 1;
      const { rerender } = render(<AssessmentFlow />);
      storeState.currentSlideIndex = 0;
      rerender(<AssessmentFlow />);
      expect(document.activeElement?.tagName).toBe('INPUT');
    });
  });
});
