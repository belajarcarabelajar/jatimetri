import React, { forwardRef } from "react";
import { useTranslation } from "react-i18next";
import { RadarChartPlot } from "../dashboard/components/RadarChartPlot";
import type { DashboardResult } from "@/data/scoring/scoring-matrix";

type ReportPDFProps = {
  result: DashboardResult | null;
  /** Omitted for a historical report: the name is not stored with it, so the name line is hidden. */
  userName?: string;
  /** Date of the report; defaults to today for a live result. */
  date?: Date;
};

export const ReportPDF = forwardRef<HTMLDivElement, ReportPDFProps>(({ result, userName, date }, ref) => {
  const { i18n } = useTranslation();
  if (!result) return null;

  return (
    <div
      id="pdf-container"
      ref={ref}
      style={{
        position: "absolute",
        top: "-9999px",
        left: "-9999px",
        width: "794px", // A4 pixel width at 96 DPI
        backgroundColor: "white",
        zIndex: -1000,
      }}
    >
      {/* Page 1: Cover & Disclaimer */}
      <div className="pdf-page h-[1123px] flex flex-col items-center justify-center bg-primary/5 border-b p-12 text-center relative overflow-hidden">
        <h1 className="text-6xl font-bold text-primary mb-4 tracking-tight">Jatimetri</h1>
        <h2 className="text-3xl font-semibold mb-8 text-slate-700">Laporan Assessment Pribadi</h2>
        <div className="mt-20 space-y-2">
          {userName !== undefined && (
            <>
              <p className="text-xl text-slate-500">Disiapkan untuk:</p>
              <p className="text-4xl font-bold text-slate-800">{userName}</p>
            </>
          )}
          <p className="text-lg text-slate-500 mt-4">Tanggal: {(date ?? new Date()).toLocaleDateString(i18n.language)}</p>
        </div>
        
        <div className="mt-32 max-w-2xl bg-amber-50 p-6 rounded-xl border border-amber-200">
          <p className="font-bold text-amber-800 mb-2">⚠ Disclaimer Penting</p>
          <p className="text-amber-700 leading-relaxed">
            Hasil ini adalah alat refleksi awal, bukan diagnosis psikologis, penilaian baku, atau 
            vonis mutlak mengenai kepribadian Anda. Laporan ini mengukur kecenderungan berdasarkan respons 
            yang diberikan dan dirancang sebagai titik tolak untuk mengeksplorasi potensi Anda lebih lanjut.
          </p>
        </div>
      </div>

      {/* Page 2: Summary */}
      <div className="pdf-page h-[1123px] p-12 bg-white flex flex-col gap-8 relative overflow-hidden">
        <h2 className="text-4xl font-bold text-primary border-b pb-4">Ringkasan Kecenderungan</h2>
        <div className="flex-1 flex flex-col items-center justify-center">
          <h3 className="text-2xl font-semibold mb-8 text-slate-700">Pola Indikasi Dominan: <span className="text-primary">{result.dominancePattern}</span></h3>
          <div className="w-full max-w-xl aspect-square bg-slate-50 rounded-full p-8 shadow-xs border border-slate-100">
             <RadarChartPlot data={result.radarData} />
          </div>
          <div className="mt-12 text-xl leading-relaxed text-slate-700 text-center max-w-2xl">
            <p>
              Berdasarkan gabungan respons Anda di berbagai ruang lingkup, Anda <strong>tampak memiliki kecenderungan pola {result.dominancePattern}</strong>.
              Ini menunjukkan bahwa secara umum Anda mungkin lebih sering mengambil keputusan atau merespons situasi melalui pendekatan ini dibandingkan pola lainnya.
            </p>
          </div>
        </div>
      </div>

      {/* Page 3: Strengths & Weaknesses */}
      <div className="pdf-page h-[1123px] p-12 bg-white flex flex-col gap-8 relative overflow-hidden">
        <h2 className="text-4xl font-bold text-primary border-b pb-4">Indikasi Potensi & Tantangan</h2>
        <div className="grid grid-cols-2 gap-8 mt-8">
           {result.tendencies.map((t, idx) => (
             <div key={idx} className="border border-slate-200 p-8 rounded-xl bg-slate-50 shadow-xs flex flex-col">
               <h3 className="text-2xl font-bold capitalize mb-6 text-slate-800 border-b pb-4">{t.label}</h3>
               <div className="mb-6 flex-1">
                 <p className="font-semibold text-emerald-600 mb-2 flex items-center gap-2">✦ Kecenderungan Potensi:</p>
                 <p className="text-slate-700 leading-relaxed text-lg">{t.description}</p>
               </div>
               <div>
                 <p className="font-semibold text-amber-600 mb-2 flex items-center gap-2">⚠ Titik Waspada:</p>
                 <p className="text-slate-700 leading-relaxed text-lg">Setiap potensi berlebih berpeluang menjadi titik buta (blind spot) jika tidak diseimbangkan dengan kesadaran lingkungan.</p>
               </div>
             </div>
           ))}
        </div>
      </div>

      {/* Page 4: Reflection Plan */}
      <div className="pdf-page h-[1123px] p-12 bg-white flex flex-col gap-8 relative overflow-hidden">
        <h2 className="text-4xl font-bold text-primary border-b pb-4">Rencana Refleksi</h2>
        <div className="space-y-8 text-xl text-slate-700 mt-4 leading-relaxed">
          <p>
            Rencana berikut disusun untuk membantu Anda merefleksikan kecenderungan yang muncul
            serta mengeksplorasi langkah praktis untuk mengoptimalkannya.
          </p>
          <div className="bg-primary/5 p-8 rounded-xl border border-primary/20">
             <h3 className="text-2xl font-bold mb-6 text-primary">Pertanyaan Refleksi</h3>
             <ul className="list-disc pl-8 space-y-4">
               <li>Seberapa besar kecenderungan ini sesuai dengan keseharian Anda di kehidupan nyata?</li>
               <li>Apakah pola ini lebih sering menguntungkan Anda, atau justru menjadi hambatan di saat tertentu?</li>
               <li>Area mana dari hidup Anda yang sekiranya paling bisa memanfaatkan indikasi potensi ini?</li>
             </ul>
          </div>
          <div className="bg-slate-50 p-8 rounded-xl border border-slate-200">
             <h3 className="text-2xl font-bold mb-6 text-slate-800">Langkah Observasi Selanjutnya</h3>
             <ul className="list-disc pl-8 space-y-4">
               <li>Validasi dengan orang terdekat atau mentor mengenai pandangan mereka terhadap indikasi potensi ini.</li>
               <li>Cobalah sadari kapan Anda menggunakan kecenderungan {result.dominancePattern} secara otomatis dalam seminggu ke depan.</li>
               <li>Jangan biarkan label apa pun membatasi eksplorasi kemampuan Anda yang lain.</li>
             </ul>
          </div>
        </div>
      </div>

      {/* Page 5: Closing Notes */}
      <div className="pdf-page h-[1123px] p-12 bg-white flex flex-col justify-between relative overflow-hidden">
        <div className="mt-12">
          <h2 className="text-4xl font-bold text-primary border-b pb-4 mb-12">Catatan Penutup</h2>
          <div className="space-y-6 text-xl text-slate-700 leading-relaxed bg-slate-50 p-8 rounded-xl border border-slate-100">
            <p>
              Tujuan dari assessment ini adalah membuka percakapan internal (self-dialogue) yang lebih kaya,
              bukan sekadar menempatkan Anda dalam kotak tertentu.
            </p>
            <p>
              Selalu ingat bahwa potensi manusia sangat adaptif dan kontekstual.
              Anda memiliki kebebasan dan kapasitas untuk berkembang melewati batasan hasil apa pun.
            </p>
          </div>
        </div>
        <div className="text-center text-slate-400 border-t pt-8 mt-12 mb-12">
          <p className="text-lg font-medium text-slate-500 mb-2">Jatimetri Assessment</p>
          <p>Dokumen Refleksi Awal - Dibuat secara otomatis oleh sistem</p>
          <p className="mt-4">© {new Date().getFullYear()} Hak Cipta Dilindungi</p>
        </div>
      </div>

    </div>
  );
});
