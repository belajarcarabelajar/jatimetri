import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { cn } from "@/lib/utils";

const LANGUAGES = [
  { code: "id", label: "ID", name: "Bahasa Indonesia" },
  { code: "en", label: "EN", name: "English" },
] as const;

export function LanguageSwitcher({ className }: { className?: string }) {
  const { i18n } = useTranslation();
  const current = (i18n.resolvedLanguage || i18n.language || "id").slice(0, 2);

  return (
    <div
      role="group"
      aria-label="Bahasa / Language"
      className={cn("flex items-center gap-1 rounded-full border border-border/50 p-1", className)}
    >
      <Languages className="w-4 h-4 mx-1 text-foreground/60" aria-hidden="true" />
      {LANGUAGES.map(({ code, label, name }) => {
        const active = current === code;
        return (
          <button
            key={code}
            type="button"
            lang={code}
            aria-label={name}
            aria-pressed={active}
            onClick={() => { if (!active) void i18n.changeLanguage(code); }}
            className={cn(
              "px-2.5 py-1 text-xs font-semibold rounded-full transition-colors",
              active ? "bg-primary text-primary-foreground" : "text-foreground/70 hover:text-primary hover:bg-secondary/20"
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
