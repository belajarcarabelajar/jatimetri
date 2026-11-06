import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { useAssessmentStore } from "@/store/useAssessmentStore";
import { evaluateAnswers, type DashboardResult, type Tendency } from "@/data/scoring/scoring-matrix";
import { RadarChartPlot } from "./components/RadarChartPlot";
import { SpectrumSlider } from "./components/SpectrumSlider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Download, Save } from "lucide-react";
import { useAuth, SignInButton } from "@clerk/clerk-react";
import { useTranslation } from "react-i18next";
import { ReportPDF } from "../pdf/ReportPDF";

type HistoricalReport = {
  dominancePattern: string;
  radarData: DashboardResult["radarData"];
  tendencies: Tendency[];
  stage: string;
  createdAt?: string;
};

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const { answers, stage, userName } = useAssessmentStore();
  const [loading, setLoading] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const { isSignedIn, getToken } = useAuth();
  const pdfContainerRef = useRef<HTMLDivElement>(null);
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

  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8787";

  const handleSave = async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/save-attempt`, {
         method: "POST",
         headers: {
           "Content-Type": "application/json",
           "Authorization": `Bearer ${token}`
         },
         body: JSON.stringify({
            stage: effectiveStage,
            answers,
            dominancePattern: result.dominancePattern,
            radarData: result.radarData,
            tendencies: result.tendencies
         })
      });
      if (res.ok) {
         navigate('/profile');
      } else {
         const errData = await res.text();
         alert(`${t('fail_save')} Server Error: ${res.status} - ${errData}`);
      }
    } catch (e) {
      console.error(e);
      alert(`${t('network_error')} ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleDownloadPDF = async () => {
    setGeneratingPdf(true);
    try {
      // html2canvas + jspdf are heavy; load them only when a download is requested
      const { generatePDF } = await import("../pdf/generatePDF");
      const safeUserName = userName || "Pengguna";
      const pdfBlob = await generatePDF("pdf-container", `Inner_Potential_Assessment_${safeUserName}_${new Date().toISOString().split('T')[0]}.pdf`);
      
      // Only a fresh result is saved; re-downloading a historical report must not create a new attempt
      if (isSignedIn && pdfBlob && !historicalReport) {
        const token = await getToken();
        // 1. Save Result first to get assessmentId
        const resSave = await fetch(`${API_URL}/api/save-attempt`, {
           method: "POST",
           headers: {
             "Content-Type": "application/json",
             "Authorization": `Bearer ${token}`
           },
           body: JSON.stringify({
              stage: effectiveStage,
              answers,
              dominancePattern: result.dominancePattern,
              radarData: result.radarData,
              tendencies: result.tendencies
           })
        });

        if (resSave.ok) {
           const { assessmentId } = await resSave.json();
           
           // 2. Upload PDF to R2
           const formData = new FormData();
           formData.append("file", pdfBlob, "report.pdf");
           formData.append("assessmentId", assessmentId);

           const resUpload = await fetch(`${API_URL}/api/upload-pdf`, {
             method: "POST",
             headers: {
               "Authorization": `Bearer ${token}`
             },
             body: formData
           });
           if (!resUpload.ok) {
             console.error(`PDF upload failed: ${resUpload.status}`);
           }
        } else {
           console.error(`Saving attempt failed: ${resSave.status}`);
        }
      }
    } catch (e) {
      console.error(e);
      alert(t('fail_pdf'));
    } finally {
      setGeneratingPdf(false);
    }
  };

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
                ? `${t('category')}: ${historicalReport.stage}${historicalReport.createdAt ? ` · ${new Date(Number(historicalReport.createdAt) * 1000).toLocaleDateString(i18n.language)}` : ''}`
                : `${t('prepared_for')}: ${userName || 'Pengguna'}`
              }
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
             {!historicalReport && (
               isSignedIn ? (
                 <Button variant="outline" className="flex-1 md:flex-none" onClick={handleSave}>
                   <Save className="w-4 h-4 mr-2" /> {t('save_report')}
                 </Button>
               ) : (
                 <SignInButton mode="modal" fallbackRedirectUrl="/dashboard">
                   <Button variant="outline" className="flex-1 md:flex-none text-primary border-primary hover:bg-primary-soft">
                     <Save className="w-4 h-4 mr-2" /> {t('login_save')}
                   </Button>
                 </SignInButton>
               )
             )}
             <Button className="flex-1 md:flex-none" onClick={handleDownloadPDF} disabled={generatingPdf}>
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
      <ReportPDF ref={pdfContainerRef} result={result} userName={userName || "Pengguna"} />
    </div>
  );
}
