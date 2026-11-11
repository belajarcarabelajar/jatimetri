import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { useAssessmentStore } from "@/store/useAssessmentStore";
import { evaluateAnswers, type DashboardResult, type Tendency } from "@/data/scoring/scoring-matrix";
import { RadarChartPlot } from "./components/RadarChartPlot";
import { SpectrumSlider } from "./components/SpectrumSlider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Download, Save, ClipboardList, ArrowRight } from "lucide-react";
import { useSession } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { useTranslation } from "react-i18next";
import { ReportPDF } from "../pdf/ReportPDF";

type HistoricalReport = {
  dominancePattern: string;
  radarData: DashboardResult["radarData"];
  tendencies: Tendency[];
  stage: string;
  createdAt?: string;
};

type SaveOutcome =
  | { ok: true; assessmentId: string | null }
  | { ok: false; status: number; detail: string };

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const { answers, stage, userName } = useAssessmentStore();
  const [loading, setLoading] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const { status: sessionStatus, signIn } = useSession();
  const isSignedIn = sessionStatus === "signedIn";
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const saveInFlightRef = useRef(false);
  const saveAttemptRef = useRef<Promise<SaveOutcome> | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Dashboard - Jatimetri";
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);

  // Check if we're viewing a historical report from profile page
  const [historicalReport] = useState<HistoricalReport | null>(() => {
    try {
      const stored = sessionStorage.getItem('view-historical-report');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try { sessionStorage.removeItem('view-historical-report'); } catch { /* storage unavailable */ }
    // The old `historicalReport ? 0 : 2000` read the initial null state, so the delay was always 2000 ms.
    const timer = setTimeout(() => setLoading(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  // Identity answers (Q-ID-*) carry no scoring evidence. Without any scored answer the
  // scoring matrix would still produce a default pattern, which must not be shown as a result.
  const answerKeys = Object.keys(answers);
  const hasScoredAnswers = answerKeys.some((key) => !key.startsWith("Q-ID-"));
  const isEmpty = !historicalReport && !hasScoredAnswers;

  const liveResult = evaluateAnswers(answers, stage);
  const result = historicalReport ? {
    dominancePattern: historicalReport.dominancePattern,
    radarData: historicalReport.radarData,
    tendencies: historicalReport.tendencies,
  } : liveResult;

  // Derive stage from Q-ID-02 answer if store's stage is null (legacy sessions)
  const stageFromAnswer = (() => {
    const raw = answers["Q-ID-02"] as string;
    if (raw === "Dewasa") return "adult";
    if (raw === "Remaja") return "teenager";
    if (raw === "Anak") return "child";
    return null;
  })();
  const effectiveStage = historicalReport ? historicalReport.stage : (stage || stageFromAnswer || "adult");

  // createdAt of a historical report is Unix seconds (written by Profile.tsx)
  const historicalDate = historicalReport?.createdAt
    ? new Date(Number(historicalReport.createdAt) * 1000)
    : undefined;

  const postAttempt = () => apiFetch("/api/save-attempt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      stage: effectiveStage,
      answers,
      dominancePattern: result.dominancePattern,
      radarData: result.radarData,
      tendencies: result.tendencies
    })
  });

  // Repeated Simpan clicks share this one POST: a later click reuses the first one's result.
  // The outcome is a plain object because two callers cannot both read one Response body.
  const saveAttemptOnce = (): Promise<SaveOutcome> => {
    if (saveAttemptRef.current) return saveAttemptRef.current;
    const attempt = (async (): Promise<SaveOutcome> => {
      const res = await postAttempt();
      if (res.ok) {
        let assessmentId: string | null = null;
        try {
          assessmentId = ((await res.json()) as { assessmentId?: string }).assessmentId ?? null;
        } catch { /* no usable body: saved, but without an id to attach a PDF to */ }
        return { ok: true, assessmentId };
      }
      if (res.status === 429) {
        // Alerted here so overlapping callers of one attempt show the message once
        alert(t('save_limit_reached'));
        return { ok: false, status: 429, detail: "" };
      }
      return { ok: false, status: res.status, detail: await res.text() };
    })();
    saveAttemptRef.current = attempt;
    // A stored attempt stays cached so later clicks reuse it; a failed one is dropped so it can be retried
    const drop = () => { if (saveAttemptRef.current === attempt) saveAttemptRef.current = null; };
    attempt.then((outcome) => { if (!outcome.ok) drop(); }, drop);
    return attempt;
  };

  const handleSave = async () => {
    // The ref stops a second click that lands before the disabled state is rendered
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setSaving(true);
    try {
      const outcome = await saveAttemptOnce();
      if (outcome.ok) {
         navigate('/profile');
      } else if (outcome.status === 401) {
         // Session expired: log in again and come back; the answers stay in localStorage
         signIn('/dashboard');
      } else if (outcome.status !== 429) {
         alert(`${t('fail_save')} Server Error: ${outcome.status} - ${outcome.detail}`);
      }
    } catch (e) {
      console.error(e);
      alert(`${t('network_error')} ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  };

  // Unduh PDF stays on the device: it never calls the API (privasi-2).
  const handleDownloadPDF = async () => {
    setGeneratingPdf(true);
    try {
      // html2canvas + jspdf are heavy; load them only when a download is requested
      const { generatePDF } = await import("../pdf/generatePDF");
      const safeUserName = userName || "Pengguna";
      const fileDate = (historicalDate ?? new Date()).toISOString().split('T')[0];
      // The name is not stored with a historical report, so its file name must not carry the local one
      const fileName = historicalReport
        ? `Jatimetri_${fileDate}.pdf`
        : `Jatimetri_${safeUserName}_${fileDate}.pdf`;
      await generatePDF("pdf-container", fileName);
    } catch (e) {
      console.error(e);
      alert(t('fail_pdf'));
    } finally {
      setGeneratingPdf(false);
    }
  };

  const busy = saving || generatingPdf;

  if (isEmpty) {
    const hasStarted = answerKeys.length > 0;
    return (
      <div className="flex-1 flex items-center justify-center bg-surface p-4 md:p-8">
        <Card className="max-w-lg w-full shadow-md border-border/60 text-center">
          <CardHeader>
            <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <ClipboardList className="h-7 w-7 text-primary" aria-hidden="true" />
            </div>
            <CardTitle className="text-2xl">{t('no_result_title')}</CardTitle>
            <CardDescription className="text-base leading-relaxed">{t('no_result_desc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="lg" onClick={() => navigate('/assessment')}>
              {t(hasStarted ? 'continue_assessment' : 'start_assessment')}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-6" />
        <h2 className="text-2xl font-bold text-foreground">{t('analyzing')}</h2>
        <p className="text-muted-foreground mt-2 text-lg">{t('evaluating_evidence')}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-surface p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-background p-6 rounded-2xl shadow-sm border border-border">
          <div>
            <h1 className="text-3xl font-bold text-primary">{t('report_title')}</h1>
            <p className="text-muted-foreground mt-1 capitalize">
              {historicalReport
                ? `${t('category')}: ${historicalReport.stage}${historicalDate ? ` · ${historicalDate.toLocaleDateString(i18n.language)}` : ''}`
                : `${t('prepared_for')}: ${userName || 'Pengguna'}`
              }
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
             {!historicalReport && isSignedIn && (
               <Button variant="outline" className="flex-1 md:flex-none" onClick={handleSave} disabled={busy}>
                 <Save className="w-4 h-4 mr-2" /> {t('save_report')}
               </Button>
             )}
             {!historicalReport && sessionStatus === "signedOut" && (
               // Full-page login; the answers persist in localStorage so the user can save on return
               <Button variant="outline" className="flex-1 md:flex-none text-primary border-primary hover:bg-primary-soft" onClick={() => signIn('/dashboard')}>
                 <Save className="w-4 h-4 mr-2" /> {t('login_save')}
               </Button>
             )}
             <Button className="flex-1 md:flex-none" onClick={handleDownloadPDF} disabled={busy}>
               {generatingPdf ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />} 
               {t('download_pdf')}
             </Button>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-1 shadow-md border-border/60 flex flex-col justify-center">
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-lg text-muted-foreground uppercase tracking-wider">{t('dominant_indication')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-4">
                <div className="text-5xl mb-6">🌟</div>
                <h3 className="text-2xl font-bold text-foreground mb-3">{result.dominancePattern}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{t('dominant_desc')}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2 shadow-md border-border/60">
            <CardHeader>
              <CardTitle>{t('potential_map')}</CardTitle>
              <CardDescription>{t('potential_map_desc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <RadarChartPlot data={result.radarData} />
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-md border-border/60">
          <CardHeader>
            <CardTitle>{t('main_tendencies')}</CardTitle>
            <CardDescription>{t('main_tendencies_desc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.tendencies.map(tendency => (
              <div key={tendency.id} className="grid md:grid-cols-2 gap-6 items-center bg-surface p-6 rounded-xl border border-border/50">
                <div>
                   <h4 className="font-bold text-xl text-primary mb-2">{tendency.label}</h4>
                   <p className="text-muted-foreground text-sm leading-relaxed">{tendency.description}</p>
                </div>
                <div className="w-full">
                   <SpectrumSlider label={t('evidence_strength')} quality={tendency.quality} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="shadow-md border-border/60 bg-amber-50 border-amber-200">
          <CardHeader>
            <CardTitle className="text-amber-800">{t('disclaimer_title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-amber-700 leading-relaxed">
              {t('disclaimer_desc')}
            </p>
          </CardContent>
        </Card>

      </div>
      <ReportPDF ref={pdfContainerRef} result={result} userName={historicalReport ? undefined : (userName || "Pengguna")} date={historicalDate} />
    </div>
  );
}
