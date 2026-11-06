import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useSession } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Loader2, AlertCircle, Settings, Trash2, Eye, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAssessmentStore } from "@/store/useAssessmentStore";
import type { DashboardResult, Tendency } from "@/data/scoring/scoring-matrix";

const DELETE_CONFIRM_WORD = "HAPUS";
const BCB_ACCOUNT_URL = "https://belajarcarabelajar.com/account";

type Report = {
  id: string;
  stage: string;
  created_at: number; // Unix timestamp from D1
  dominance_pattern: string;
  radar_data: string | DashboardResult["radarData"];
  tendencies: string | Tendency[];
};

// A malformed row from the API must not crash the whole history list
function parseJsonField<T>(value: string | T[] | null | undefined): T[] {
  if (typeof value !== 'string') return value ?? [];
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function Profile() {
  const { i18n } = useTranslation();
  const { email, refresh } = useSession();
  const resetAssessment = useAssessmentStore((s) => s.resetAssessment);
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Profil - Jatimetri";
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);

  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmingAccountDelete, setConfirmingAccountDelete] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    const fetchReports = async () => {
      try {
        const res = await apiFetch("/api/reports");

        if (res.status === 401) {
          // Session expired: re-check it so the route guard sends the user to the login
          void refresh();
          return;
        }
        if (!res.ok) {
          const errData = await res.text();
          throw new Error(`Server Error: ${res.status} - ${errData}`);
        }

        const data = await res.json();
        setReports(data.reports || []);
      } catch (err) {
        console.warn("Backend fetch failed:", err);
        setError(`Gagal menghubungi server: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, [refresh]);

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus riwayat assessment ini? Tindakan tidak bisa dibatalkan.")) return;
    setDeletingId(id);
    try {
      const res = await apiFetch(`/api/assessments/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (res.ok) {
        setReports(prev => prev.filter(r => r.id !== id));
      } else {
        alert("Gagal menghapus. Silakan coba lagi.");
      }
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteAccount = async () => {
    if (confirmText.trim().toUpperCase() !== DELETE_CONFIRM_WORD) return;
    setDeletingAccount(true);
    try {
      // Deletes only the Jatimetri data (history, PDFs, session); the BCB account itself stays
      const res = await apiFetch("/api/account", { method: "DELETE" });
      if (!res.ok) {
        alert("Gagal menghapus data Jatimetri. Silakan coba lagi atau hubungi kami.");
        return;
      }
      resetAssessment();
      try { sessionStorage.removeItem('view-historical-report'); } catch { /* storage unavailable */ }
      // The Worker cleared the session cookie; re-read it so the app shows the signed-out state
      await refresh();
      navigate('/');
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <div className="flex-1 bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold text-primary">Profil & Riwayat Laporan</h1>

        {error && (
          <div className="bg-destructive/10 text-destructive p-4 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Settings className="w-5 h-5"/> Pengaturan Personal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4 border p-4 rounded-lg">
              <div
                aria-hidden="true"
                className="w-12 h-12 shrink-0 rounded-full bg-primary/15 text-primary text-lg font-semibold flex items-center justify-center"
              >
                {(email?.charAt(0) || "?").toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Masuk dengan akun BCB Academy</p>
                <p className="font-semibold truncate">{email}</p>
              </div>
            </div>

            <div className="p-4 border rounded-lg border-destructive/20 bg-destructive/5 space-y-4">
              <div className="flex justify-between items-center gap-4">
                <div>
                  <h3 className="font-semibold text-destructive">Hapus Data Jatimetri</h3>
                  <p className="text-sm text-muted-foreground">
                    Semua riwayat assessment dan PDF laporan Jatimetri Anda akan dihapus permanen, lalu Anda akan keluar.
                    Akun BCB Academy Anda tidak ikut terhapus; akun itu dikelola di{" "}
                    <a
                      href={BCB_ACCOUNT_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 font-medium text-primary underline underline-offset-2"
                    >
                      belajarcarabelajar.com/account
                      <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </a>
                    .
                  </p>
                </div>
                {!confirmingAccountDelete && (
                  <Button variant="destructive" size="sm" onClick={() => setConfirmingAccountDelete(true)}>
                    <Trash2 className="w-4 h-4 mr-2"/> Hapus
                  </Button>
                )}
              </div>
              {confirmingAccountDelete && (
                <div className="space-y-3">
                  <label htmlFor="delete-data-confirm" className="text-sm font-medium block">
                    Ketik <strong>{DELETE_CONFIRM_WORD}</strong> untuk konfirmasi. Tindakan ini tidak bisa dibatalkan.
                  </label>
                  <Input
                    id="delete-data-confirm"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    autoComplete="off"
                    disabled={deletingAccount}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleDeleteAccount}
                      disabled={deletingAccount || confirmText.trim().toUpperCase() !== DELETE_CONFIRM_WORD}
                    >
                      {deletingAccount ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2"/>}
                      Hapus Data Permanen
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setConfirmingAccountDelete(false); setConfirmText(""); }}
                      disabled={deletingAccount}
                    >
                      Batal
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Riwayat Assessment</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : reports.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Belum ada riwayat assessment.</p>
            ) : (
              <div className="space-y-4">
                {reports.map((report) => {
                  const radarData = parseJsonField(report.radar_data);
                  const tendencies = parseJsonField(report.tendencies);
                  const dateLabel = report.created_at
                    ? new Date(Number(report.created_at) * 1000).toLocaleDateString(i18n.language, { year: 'numeric', month: 'long', day: 'numeric' })
                    : '-';

                  const handleViewResult = () => {
                    sessionStorage.setItem('view-historical-report', JSON.stringify({
                      dominancePattern: report.dominance_pattern,
                      radarData,
                      tendencies,
                      stage: report.stage,
                      createdAt: report.created_at,
                    }));
                    navigate('/dashboard');
                  };

                  return (
                    <div key={report.id} className="p-4 border rounded-lg hover:border-primary transition flex justify-between items-center">
                      <div>
                        <h3 className="font-semibold capitalize">Kategori: {report.stage}</h3>
                        <p className="text-sm text-muted-foreground">Pola Dominan: {report.dominance_pattern}</p>
                        <p className="text-xs text-muted-foreground mt-1">{dateLabel}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Button onClick={handleViewResult} size="sm" className="gap-1">
                          <Eye className="w-4 h-4" /> Lihat Hasil
                        </Button>
                        <Button
                          onClick={() => handleDelete(report.id)}
                          variant="outline"
                          size="sm"
                          className="gap-1 border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                          disabled={deletingId === report.id}
                        >
                          {deletingId === report.id
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Trash2 className="w-4 h-4" />
                          }
                          Hapus
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
