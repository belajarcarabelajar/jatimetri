import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuth, useClerk, useUser } from "@clerk/clerk-react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Loader2, AlertCircle, Settings, Trash2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAssessmentStore } from "@/store/useAssessmentStore";
import type { DashboardResult, Tendency } from "@/data/scoring/scoring-matrix";

const DELETE_CONFIRM_WORD = "HAPUS";

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
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
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
        const token = await getToken();
        const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8787";
        const res = await fetch(`${API_URL}/api/reports`, {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });
        
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
  }, [isSignedIn, getToken]);

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus riwayat assessment ini? Tindakan tidak bisa dibatalkan.")) return;
    setDeletingId(id);
    try {
      const token = await getToken();
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8787";
      const res = await fetch(`${API_URL}/api/assessments/${id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
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
      const token = await getToken();
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8787";
      const res = await fetch(`${API_URL}/api/account`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!res.ok) {
        alert("Gagal menghapus akun. Silakan coba lagi atau hubungi kami.");
        return;
      }
      resetAssessment();
      try { sessionStorage.removeItem('view-historical-report'); } catch { /* storage unavailable */ }
      await signOut();
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
              <img src={user?.imageUrl} alt={`Foto profil pengguna ${user?.firstName || ''}`} loading="lazy" className="w-12 h-12 rounded-full aspect-square" />
              <div>
                <p className="font-semibold">{user?.fullName || "Pengguna"}</p>
                <p className="text-sm text-muted-foreground">{user?.primaryEmailAddress?.emailAddress}</p>
              </div>
            </div>
            
            <div className="p-4 border rounded-lg border-destructive/20 bg-destructive/5 space-y-4">
              <div className="flex justify-between items-center gap-4">
                <div>
                  <h3 className="font-semibold text-destructive">Hapus Akun & Data</h3>
                  <p className="text-sm text-muted-foreground">Akun, semua riwayat assessment, dan PDF laporan akan dihapus permanen.</p>
                </div>
                {!confirmingAccountDelete && (
                  <Button variant="destructive" size="sm" onClick={() => setConfirmingAccountDelete(true)}>
                    <Trash2 className="w-4 h-4 mr-2"/> Hapus
                  </Button>
                )}
              </div>
              {confirmingAccountDelete && (
                <div className="space-y-3">
                  <label htmlFor="delete-account-confirm" className="text-sm font-medium block">
                    Ketik <strong>{DELETE_CONFIRM_WORD}</strong> untuk konfirmasi. Tindakan ini tidak bisa dibatalkan.
                  </label>
                  <Input
                    id="delete-account-confirm"
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
                      Hapus Akun Permanen
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
