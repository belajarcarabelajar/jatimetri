import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

type Stage = "child" | "teenager" | "adult" | null;

type AnswerValue = string | number | boolean | string[];

interface AssessmentState {
  stage: Stage;
  userName: string;
  answers: Record<string, AnswerValue>;
  currentSlideIndex: number;
  isCompleted: boolean;
  setStage: (stage: Stage) => void;
  setUserName: (name: string) => void;
  setAnswer: (questionId: string, value: AnswerValue) => void;
  clearAnswer: (questionId: string) => void;
  nextSlide: () => void;
  prevSlide: () => void;
  setSlideIndex: (index: number) => void;
  completeAssessment: () => void;
  resetAssessment: () => void;
}

export const useAssessmentStore = create<AssessmentState>()(
  persist(
    (set) => ({
      stage: null,
      userName: "",
      answers: {},
      currentSlideIndex: 0,
      isCompleted: false,

      setStage: (stage) => set({ stage }),
      setUserName: (userName) => set({ userName }),
      setAnswer: (questionId, value) => 
        set((state) => ({ answers: { ...state.answers, [questionId]: value } })),
      clearAnswer: (questionId) =>
        set((state) => {
          const answers = { ...state.answers };
          delete answers[questionId];
          return { answers };
        }),
      nextSlide: () => 
        set((state) => ({ currentSlideIndex: state.currentSlideIndex + 1 })),
      prevSlide: () => 
        set((state) => ({ currentSlideIndex: Math.max(0, state.currentSlideIndex - 1) })),
      setSlideIndex: (index) => set({ currentSlideIndex: index }),
      completeAssessment: () => set({ isCompleted: true }),
      resetAssessment: () => set({ stage: null, userName: "", answers: {}, currentSlideIndex: 0, isCompleted: false }),
    }),
    {
      name: 'jatimetri-v1-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
