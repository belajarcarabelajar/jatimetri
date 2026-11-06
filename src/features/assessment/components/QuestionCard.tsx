import type { Ref } from "react";
import { Question, QuestionOption } from "@/types/assessment";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Object options exist only in the stage banks, which nothing renders; this card renders plain string options.
const stringOptions = (opts?: QuestionOption[]): string[] =>
  (opts || []).filter((opt): opt is string => typeof opt === "string");

interface Props {
  question: Question;
  currentAnswer?: string | number | boolean | string[];
  onAnswer: (value: string | number | boolean | string[]) => void;
  onNext?: () => void;
  /** Ref to the question heading, so the flow can move focus to it after a slide change. */
  headingRef?: Ref<HTMLHeadingElement>;
}

export function QuestionCard({ question, currentAnswer, onAnswer, onNext, headingRef }: Props) {
  
  const handleRankingToggle = (val: string) => {
    const arr = (Array.isArray(currentAnswer) ? currentAnswer : []) as string[];
    if (arr.includes(val)) {
      onAnswer(arr.filter(item => item !== val));
    } else {
      if (arr.length < 3) {
        onAnswer([...arr, val]);
      }
    }
  };

  const renderInput = () => {
    switch (question.inputType) {
      case "text":
        return (
          <div className="flex flex-col gap-4">
            <Input 
              autoFocus
              aria-label="Nama kamu"
              placeholder="Ketik nama kamu di sini..." 
              value={typeof currentAnswer === 'string' ? currentAnswer : ''}
              onChange={(e) => onAnswer(e.target.value)}
              className="h-14 text-lg"
              autoComplete="name"
              autoCorrect="off"
              spellCheck={false}
            />
            {currentAnswer && <Button onClick={onNext} size="lg" className="mt-4">Lanjut</Button>}
          </div>
        );
        
      case "dropdown": {
        // For stage selection, options depend on whether child/teen/adult options are provided
        const opts = stringOptions(question.options || question.childOptions || question.teenOptions || question.adultOptions);
        return (
          <div className="flex flex-col gap-3">
            {opts.map((opt, idx) => (
              <Button 
                key={idx} 
                variant={currentAnswer === opt ? "default" : "outline"}
                aria-pressed={currentAnswer === opt}
                className={`justify-start h-16 text-lg text-left transition-all duration-300 rounded-2xl ${currentAnswer === opt ? 'shadow-md scale-[1.01]' : 'hover:border-primary hover:shadow-sm hover:-translate-y-0.5 active:scale-[0.98]'}`}
                onClick={() => { onAnswer(opt); setTimeout(() => onNext?.(), 300); }}
              >
                {opt}
              </Button>
            ))}
          </div>
        );
      }

      case "transition":
        return (
          <div className="flex justify-center mt-8">
             <Button onClick={onNext} size="lg" className="w-full md:w-auto px-12 h-14 text-lg">Mengerti, Lanjut</Button>
          </div>
        );

      case "ranking": {
        const currentArr = (Array.isArray(currentAnswer) ? currentAnswer : []) as string[];
        return (
          <div className="flex flex-col gap-6">
            <p className="text-sm text-muted-foreground font-medium">Pilih maksimal 3 opsi ({currentArr.length}/3 terpilih)</p>
            <div className="flex flex-wrap gap-3">
              {stringOptions(question.options).map((opt, idx) => {
                const isSelected = currentArr.includes(opt);
                const disabled = !isSelected && currentArr.length >= 3;
                return (
                  <Button 
                    key={idx} 
                    variant={isSelected ? "default" : "outline"}
                aria-pressed={isSelected}
                    className="h-auto py-3 px-5 text-left whitespace-normal hover:border-primary transition rounded-full"
                    disabled={disabled}
                    onClick={() => handleRankingToggle(opt)}
                  >
                    {opt}
                  </Button>
                );
              })}
            </div>
            {currentArr.length > 0 && (
              <Button onClick={onNext} size="lg" className="mt-4">Lanjut</Button>
            )}
          </div>
        );
      }

      case "scale-1-5": {
        const scaleLabels = ["Sangat tidak sesuai", "Kurang sesuai", "Netral / kadang-kadang", "Cukup sesuai", "Sangat sesuai"];
        return (
          <div className="flex flex-col gap-3">
            {scaleLabels.map((label, idx) => {
              const val = idx + 1;
              return (
                <Button 
                  key={val} 
                  variant={currentAnswer === val ? "default" : "outline"}
                aria-pressed={currentAnswer === val}
                  className={`justify-start h-auto py-5 text-left whitespace-normal transition-all duration-300 rounded-2xl ${currentAnswer === val ? 'shadow-md scale-[1.01]' : 'hover:border-primary hover:shadow-sm hover:-translate-y-0.5 active:scale-[0.98]'}`}
                  onClick={() => { onAnswer(val); setTimeout(() => onNext?.(), 300); }}
                >
                  <span className={`w-10 h-10 rounded-full flex items-center justify-center mr-4 font-bold transition-colors ${currentAnswer === val ? 'bg-background/20 text-primary-foreground' : 'bg-primary/10 text-primary'}`}>{val}</span>
                  <span className="text-lg">{label}</span>
                </Button>
              )
            })}
          </div>
        );
      }

      case "yes-no":
        return (
          <div className="flex gap-4">
            <Button 
                variant={currentAnswer === "yes" ? "default" : "outline"}
                aria-pressed={currentAnswer === "yes"}
                className="flex-1 h-20 text-xl hover:border-primary transition"
                onClick={() => { onAnswer("yes"); setTimeout(() => onNext?.(), 200); }}
              >
                Ya
            </Button>
            <Button 
                variant={currentAnswer === "no" ? "default" : "outline"}
                aria-pressed={currentAnswer === "no"}
                className="flex-1 h-20 text-xl hover:border-primary transition"
                onClick={() => { onAnswer("no"); setTimeout(() => onNext?.(), 200); }}
              >
                Tidak
            </Button>
          </div>
        );

      case "tap-card":
      default:
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stringOptions(question.options).map((opt, idx) => (
              <Button 
                key={idx} 
                variant={currentAnswer === opt ? "default" : "outline"}
                aria-pressed={currentAnswer === opt}
                className={`h-auto min-h-[6rem] text-lg whitespace-normal p-6 flex items-center text-left transition-all duration-300 rounded-3xl ${currentAnswer === opt ? 'shadow-md scale-[1.02]' : 'hover:border-primary hover:shadow-sm hover:-translate-y-0.5 active:scale-[0.98]'}`}
                onClick={() => { onAnswer(opt); setTimeout(() => onNext?.(), 300); }}
              >
                {opt}
              </Button>
            ))}
          </div>
        );
    }
  };

  return (
    <Card className="w-full max-w-3xl mx-auto shadow-premium border-border/40 rounded-[2rem] animate-in fade-in-up duration-700 bg-card/95 backdrop-blur-sm">
      <CardHeader className="pb-8">
        <div className="flex items-center gap-2 mb-4">
          <span className="px-4 py-1.5 text-xs font-bold tracking-wider uppercase bg-secondary/20 text-primary border border-secondary/30 rounded-full shadow-sm">
            {question.scope}
          </span>
        </div>
        {/* We expect Assessment.tsx to inject the correct prompt string into question.prompt before passing down */}
        <CardTitle ref={headingRef} tabIndex={-1} className="focus:outline-none text-3xl md:text-4xl leading-snug text-foreground font-heading tracking-tight">{question.prompt}</CardTitle>
        {question.helperText && (
          <CardDescription className="text-lg mt-3 text-muted-foreground">{question.helperText}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {renderInput()}
      </CardContent>
    </Card>
  );
}
