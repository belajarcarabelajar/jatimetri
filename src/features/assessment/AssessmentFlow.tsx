import { useState } from "react";
import { useNavigate } from "react-router";
import { useAssessmentStore } from "@/store/useAssessmentStore";
import { v1Bank } from "@/data/questions/v1-bank";
import { QuestionCard } from "./components/QuestionCard";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight } from "lucide-react";

export function AssessmentFlow() {
  const { currentSlideIndex, setSlideIndex, answers, setAnswer, clearAnswer, setUserName, setStage, resetAssessment } = useAssessmentStore();
  const navigate = useNavigate();

  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const questions = v1Bank;
  // A persisted index can be out of range after the question bank changes
  const slideIndex = Math.min(Math.max(currentSlideIndex, 0), questions.length - 1);
  const progress = ((slideIndex + 1) / questions.length) * 100;

  const currentQuestion = questions[slideIndex];

  // Determine stage from Q-ID-02
  const stageRaw = answers["Q-ID-02"] as string;
  let activeStage: "child" | "teen" | "adult" = "adult"; // Default fallback
  if (stageRaw === "Anak") activeStage = "child";
  if (stageRaw === "Remaja") activeStage = "teen";
  if (stageRaw === "Dewasa") activeStage = "adult";

  // Inject dynamic prompt
  const dynamicQuestion = { ...currentQuestion };
  if (currentQuestion.prompts) {
    dynamicQuestion.prompt = currentQuestion.prompts[activeStage];
  }

  // Determine dynamic options (for Stage Detail)
  if (currentQuestion.id === "Q-ID-03") {
    if (activeStage === "child") dynamicQuestion.options = currentQuestion.childOptions;
    if (activeStage === "teen") dynamicQuestion.options = currentQuestion.teenOptions;
    if (activeStage === "adult") dynamicQuestion.options = currentQuestion.adultOptions;
  }

  const handleNext = () => {
    if (slideIndex < questions.length - 1) {
      setSlideIndex(slideIndex + 1);
    }
  };

  const handlePrev = () => {
    if (slideIndex > 0) {
      setSlideIndex(slideIndex - 1);
    }
  };

  const handleAnswer = (val: string | number | boolean | string[]) => {
    setAnswer(currentQuestion.id, val);
    
    // Special handling for Identity
    if (currentQuestion.id === "Q-ID-01" && typeof val === "string") {
      setUserName(val);
    }

    // Persist stage to store when Q-ID-02 is answered
    if (currentQuestion.id === "Q-ID-02" && typeof val === "string") {
      // Stage detail options depend on the stage, so a previous detail answer is no longer valid
      if (answers["Q-ID-02"] !== undefined && answers["Q-ID-02"] !== val) {
        clearAnswer("Q-ID-03");
      }
      if (val === "Anak") setStage("child");
      else if (val === "Remaja") setStage("teenager");
      else if (val === "Dewasa") setStage("adult");
    }
  };

  const handleFinish = () => {
    navigate("/dashboard");
  };

  // Determine if we can proceed
  const isAnswered = () => {
    const ans = answers[currentQuestion.id];
    if (currentQuestion.inputType === "transition") return true; // transitions don't need answers to enable next
    if (currentQuestion.required === false) return true;
    if (currentQuestion.inputType === "ranking") {
      return Array.isArray(ans) && ans.length > 0;
    }
    if (currentQuestion.inputType === "text") {
      return typeof ans === 'string' && ans.trim().length > 0;
    }
    return ans !== undefined;
  };

  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientY);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientY);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isUpSwipe = distance > minSwipeDistance;
    const isDownSwipe = distance < -minSwipeDistance;

    if (isUpSwipe) {
      if (isAnswered() && slideIndex < questions.length - 1) {
        handleNext();
      }
    }
    if (isDownSwipe) {
      handlePrev();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-surface relative overflow-hidden">
      <h1 className="sr-only">Assessment Kepribadian Jatimetri</h1>
      {/* Top Bar with Progress */}
      <div className="w-full bg-background p-4 shadow-sm z-10 border-b border-border/50">
        <div className="flex items-center justify-between mb-3 max-w-5xl mx-auto">
          <span className="text-sm font-medium text-muted-foreground">Progress: {Math.round(progress)}%</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="text-muted-foreground hover:text-primary">
              Keluar
            </Button>
            <Button variant="ghost" size="sm" onClick={resetAssessment} className="text-muted-foreground hover:text-destructive">
              Reset
            </Button>
          </div>
        </div>
        <div className="max-w-5xl mx-auto">
          <Progress value={progress} className="h-2 bg-primary-soft" />
        </div>
      </div>

      {/* Desktop View */}
      <div className="hidden md:flex flex-1 items-center justify-center p-6 relative w-full max-w-5xl mx-auto">
        <div className="w-full">
          <QuestionCard 
            question={dynamicQuestion} 
            currentAnswer={answers[currentQuestion.id]} 
            onAnswer={handleAnswer} 
            onNext={handleNext}
          />
        </div>
        
        {/* Desktop Controls */}
        <div className="absolute bottom-10 left-6 right-6 flex justify-between">
          <Button variant="outline" onClick={handlePrev} disabled={slideIndex === 0} className="shadow-sm">
            <ArrowLeft className="mr-2 h-4 w-4" /> Sebelumnya
          </Button>
          {slideIndex === questions.length - 1 && isAnswered() ? (
             <Button onClick={handleFinish} className="shadow-sm bg-success hover:bg-success/90">
               Selesai <ArrowRight className="ml-2 h-4 w-4" />
             </Button>
          ) : (
             currentQuestion.inputType !== "transition" && currentQuestion.inputType !== "ranking" && currentQuestion.inputType !== "text" && (
              <Button 
                variant={isAnswered() ? "default" : "secondary"} 
                onClick={handleNext} 
                disabled={!isAnswered()}
                className="shadow-sm"
              >
                Selanjutnya <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
             )
          )}
        </div>
      </div>

      {/* Mobile View (Strict Swipe) */}
      <div 
        className="md:hidden flex-1 overflow-hidden relative"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div 
          className="flex flex-col h-full w-full transition-transform duration-500 ease-out"
          style={{ transform: `translateY(-${slideIndex * 100}%)` }}
        >
          {questions.map((q, index) => {
            const mDynamicQ = { ...q };
            if (q.prompts) mDynamicQ.prompt = q.prompts[activeStage];
            if (q.id === "Q-ID-03") {
              if (activeStage === "child") mDynamicQ.options = q.childOptions;
              if (activeStage === "teen") mDynamicQ.options = q.teenOptions;
              if (activeStage === "adult") mDynamicQ.options = q.adultOptions;
            }
            return (
              <div 
                key={q.id} 
                className="h-full w-full flex-shrink-0 flex items-center justify-center p-4 overflow-y-auto"
              >
                <div className="w-full my-auto py-8">
                  <QuestionCard 
                    question={mDynamicQ} 
                    currentAnswer={answers[q.id]} 
                    onAnswer={(val) => {
                      handleAnswer(val);
                    }} 
                    onNext={() => {
                      if (index === questions.length - 1) {
                        handleFinish();
                      } else {
                        setSlideIndex(index + 1);
                      }
                    }}
                  />
                  {index === questions.length - 1 && isAnswered() && (
                    <div className="mt-8 flex justify-center w-full max-w-3xl mx-auto">
                      <Button size="lg" className="w-full bg-success hover:bg-success/90 shadow-lg text-lg h-14" onClick={handleFinish}>
                        Selesai, Lihat Laporan Hasil
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
