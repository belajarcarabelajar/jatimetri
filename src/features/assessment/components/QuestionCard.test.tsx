import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QuestionCard } from './QuestionCard';
import { Question } from '@/types/assessment';

describe('QuestionCard', () => {
  const defaultQuestion: Question = {
    id: "q1",
    scope: "scope 1",
    prompt: "Sample prompt",
    inputType: "tap-card",
    stage: "all",
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('renders common elements (scope, prompt, helperText)', () => {
    render(
      <QuestionCard
        question={{ ...defaultQuestion, helperText: 'Helper text here' }}
        onAnswer={vi.fn()}
      />
    );
    expect(screen.getByText('scope 1')).toBeInTheDocument();
    expect(screen.getByText('Sample prompt')).toBeInTheDocument();
    expect(screen.getByText('Helper text here')).toBeInTheDocument();
  });

  describe('inputType: text', () => {
    it('renders an input and handles changes', async () => {
      const handleAnswer = vi.fn();
      render(
        <QuestionCard
          question={{ ...defaultQuestion, inputType: 'text' }}
          onAnswer={handleAnswer}
        />
      );
      const input = screen.getByPlaceholderText(/ketik nama kamu/i);
      fireEvent.change(input, { target: { value: 'John' } });
      expect(handleAnswer).toHaveBeenCalledWith('John');
    });

    it('shows next button only when there is an answer', () => {
      const { rerender } = render(
        <QuestionCard question={{ ...defaultQuestion, inputType: 'text' }} onAnswer={vi.fn()} />
      );
      expect(screen.queryByRole('button', { name: /lanjut/i })).not.toBeInTheDocument();

      rerender(
        <QuestionCard
          question={{ ...defaultQuestion, inputType: 'text' }}
          currentAnswer="John"
          onAnswer={vi.fn()}
          onNext={vi.fn()}
        />
      );
      expect(screen.getByRole('button', { name: /lanjut/i })).toBeInTheDocument();
    });
  });

  describe('inputType: dropdown', () => {
    it('renders options and handles click with delay', () => {
      const handleAnswer = vi.fn();
      const handleNext = vi.fn();
      render(
        <QuestionCard
          question={{ ...defaultQuestion, inputType: 'dropdown', options: ['A', 'B'] }}
          onAnswer={handleAnswer}
          onNext={handleNext}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'A' }));
      expect(handleAnswer).toHaveBeenCalledWith('A');
      expect(handleNext).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(handleNext).toHaveBeenCalledTimes(1);
    });
  });

  describe('inputType: transition', () => {
    it('renders a transition button', () => {
      const handleNext = vi.fn();
      render(
        <QuestionCard
          question={{ ...defaultQuestion, inputType: 'transition' }}
          onAnswer={vi.fn()}
          onNext={handleNext}
        />
      );

      const btn = screen.getByRole('button', { name: /mengerti, lanjut/i });
      fireEvent.click(btn);
      expect(handleNext).toHaveBeenCalledTimes(1);
    });
  });

  describe('inputType: ranking', () => {
    it('allows selecting up to 3 options', () => {
      const handleAnswer = vi.fn();
      const question: Question = { ...defaultQuestion, inputType: 'ranking', options: ['1', '2', '3', '4'] };
      
      const { rerender } = render(
        <QuestionCard question={question} onAnswer={handleAnswer} currentAnswer={[]} />
      );

      fireEvent.click(screen.getByRole('button', { name: '1' }));
      expect(handleAnswer).toHaveBeenCalledWith(['1']);

      rerender(<QuestionCard question={question} onAnswer={handleAnswer} currentAnswer={['1', '2', '3']} />);
      const btn4 = screen.getByRole('button', { name: '4' });
      expect(btn4).toBeDisabled();

      // Deselect
      fireEvent.click(screen.getByRole('button', { name: '1' }));
      expect(handleAnswer).toHaveBeenCalledWith(['2', '3']);
    });
  });

  describe('inputType: scale-1-5', () => {
    it('renders 5 scale options and auto-advances', () => {
      const handleAnswer = vi.fn();
      const handleNext = vi.fn();
      render(
        <QuestionCard
          question={{ ...defaultQuestion, inputType: 'scale-1-5' }}
          onAnswer={handleAnswer}
          onNext={handleNext}
        />
      );

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(5);

      fireEvent.click(buttons[0]); // Scale 1
      expect(handleAnswer).toHaveBeenCalledWith(1);
      
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(handleNext).toHaveBeenCalledTimes(1);
    });
  });

  describe('inputType: yes-no', () => {
    it('renders Yes and No buttons', () => {
      const handleAnswer = vi.fn();
      const handleNext = vi.fn();
      render(
        <QuestionCard
          question={{ ...defaultQuestion, inputType: 'yes-no' }}
          onAnswer={handleAnswer}
          onNext={handleNext}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Ya' }));
      expect(handleAnswer).toHaveBeenCalledWith('yes');

      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(handleNext).toHaveBeenCalledTimes(1);
    });
  });

  describe('inputType: tap-card', () => {
    it('renders options', () => {
      const handleAnswer = vi.fn();
      const handleNext = vi.fn();
      render(
        <QuestionCard
          question={{ ...defaultQuestion, inputType: 'tap-card', options: ['Option 1', 'Option 2'] }}
          onAnswer={handleAnswer}
          onNext={handleNext}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Option 1' }));
      expect(handleAnswer).toHaveBeenCalledWith('Option 1');

      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(handleNext).toHaveBeenCalledTimes(1);
    });
  });
});
