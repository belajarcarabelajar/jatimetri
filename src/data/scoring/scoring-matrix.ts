export type Tendency = {
  id: string;
  label: string;
  description: string;
  quality: "Low" | "Medium" | "High";
  evidenceCount: number;
};

export type DashboardResult = {
  dominancePattern: string;
  radarData: { subject: string; A: number; fullMark: number }[];
  tendencies: Tendency[];
};

const keywordMap: Record<string, string[]> = {
  "Exploration-Oriented": [
    "Ingin tahu", "Berani mencoba", "Mencari tahu sesuatu", "Bebas memilih", 
    "Kebebasan tapi lebih tidak pasti", "Bisa memilih sendiri", "Mencoba langsung", 
    "Fleksibel", "Cepat paham", "Punya ide", "Tantangan besar"
  ],
  "Structured Executor": [
    "Teliti", "Mengatur data/daftar", "Mengatur sesuatu", "Mengatur langkah", 
    "Menghitung", "Mengorganisasi", "Merasa aman", "Ketenangan stabil", 
    "Keamanan tapi lebih terbatas", "Terstruktur", "Melihat data/fakta", 
    "Bisa dipercaya", "Tekun", "Pengatur tugas"
  ],
  "Human-Centered Contributor": [
    "Peduli", "Suka membantu", "Membantu orang", "Berkomunikasi", "Membimbing", 
    "Bekerja dengan orang yang cocok", "Mendengar penjelasan", "Bicara dengan orang", 
    "Bertanya pada orang lain", "Mencari bantuan", "Pendengar", "Penengah", 
    "Lembut dan mendukung", "Menenangkan orang", "Pemberi ide"
  ],
  "Creative Maker": [
    "Kreatif", "Membuat sesuatu dengan tangan", "Menggambar/berkreasi", "Membuat karya", 
    "Menggambar/desain", "Berkarya", "Mencoba lalu memperbaiki", "Membuat atau memperbaiki sesuatu"
  ],
  "Analytical Problem Solver": [
    "Jujur", "Menyelidiki/mencari tahu", "Memecahkan masalah", "Menganalisis", 
    "Menjadi ahli", "Melihat data/fakta", "Mencari penjelasan", "Menyelesaikan masalah", 
    "Memahami ide", "Berpikir mendalam"
  ],
  "Adaptive Growth Seeker": [
    "Suka memimpin", "Memimpin/menjual ide", "Mengajak orang", "Menjelaskan ide", 
    "Mengambil keputusan", "Diakui", "Ada target jelas", "Ada hasil nyata", 
    "Langsung bertindak", "Pemimpin", "Jelas dan langsung", "Berani tampil", 
    "Bisa memimpin", "Mengambil tindakan", "Bergerak/aksi langsung", "Menjelaskan"
  ]
};

const descriptions: Record<string, string> = {
  "Exploration-Oriented": "Cenderung terdorong oleh rasa ingin tahu, menghargai kebebasan, dan terbuka mencoba hal-hal baru yang menantang.",
  "Structured Executor": "Tampak mengarah pada penyelesaian tugas dengan teliti, menghargai keteraturan, dan dapat diandalkan untuk menjaga kestabilan.",
  "Human-Centered Contributor": "Menunjukkan indikasi kuat dalam berempati, mendengarkan, dan bekerja secara harmonis bersama orang lain.",
  "Creative Maker": "Terdapat kecenderungan untuk mengekspresikan diri melalui karya nyata, desain, maupun pemecahan masalah yang artistik.",
  "Analytical Problem Solver": "Cenderung menggunakan logika dan data dalam memecahkan masalah kompleks serta suka mencari pemahaman mendalam.",
  "Adaptive Growth Seeker": "Tampak menonjol dalam mengambil inisiatif, mengarahkan orang lain, dan berfokus pada hasil serta pencapaian nyata."
};

type Answers = Record<string, string | number | boolean | string[]>;

// Scoring ignores the stage today; the overload keeps it in the public signature that callers and tests use.
export function evaluateAnswers(answers: Answers, stage: string | null): DashboardResult;
export function evaluateAnswers(answers: Answers): DashboardResult {
  const scores: Record<string, number> = {
    "Exploration-Oriented": 0,
    "Structured Executor": 0,
    "Human-Centered Contributor": 0,
    "Creative Maker": 0,
    "Analytical Problem Solver": 0,
    "Adaptive Growth Seeker": 0
  };

  // Stringify and lowercase all answers for broad matching, but we'll also do exact array matching.
  const flatAnswers: string[] = [];
  Object.entries(answers).forEach(([key, val]) => {
    // Identity answers (name, stage, stage detail) are not evidence for any tendency
    if (key.startsWith("Q-ID-")) return;
    if (typeof val === 'string') flatAnswers.push(val);
    if (Array.isArray(val)) flatAnswers.push(...val);
    if (typeof val === 'number' && val >= 4) { // scale-1-5 answers where they strongly agree
      // We could map specific questions to categories here based on the Question ID
      if (["Q-01", "Q-14", "Q-16"].includes(key)) scores["Exploration-Oriented"] += 1;
      if (["Q-02", "Q-21"].includes(key)) scores["Structured Executor"] += 1;
      if (["Q-27"].includes(key)) scores["Human-Centered Contributor"] += 1;
      if (["Q-08", "Q-23"].includes(key)) scores["Analytical Problem Solver"] += 1;
      if (["Q-11", "Q-17", "Q-25"].includes(key)) scores["Adaptive Growth Seeker"] += 1;
      if (["Q-05"].includes(key)) scores["Analytical Problem Solver"] += 1;
    }
  });

  // Tally keywords
  flatAnswers.forEach(ans => {
    for (const [tendency, keywords] of Object.entries(keywordMap)) {
      if (keywords.includes(ans)) {
        scores[tendency] += 1;
      }
    }
  });

  // Calculate quality and create tendencies array
  const tendencies: Tendency[] = [];
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);

  let topPattern = "Balanced Individual";
  if (entries[0][1] > 0) {
    topPattern = entries[0][0];
  }

  // Generate top 3 tendencies if they meet the minimum evidence rule (>= 2)
  for (let i = 0; i < Math.min(3, entries.length); i++) {
    const [id, count] = entries[i];
    if (count >= 2) {
      tendencies.push({
        id: id.toLowerCase().replace(/ /g, '-'),
        label: id,
        description: descriptions[id],
        quality: count >= 5 ? "High" : count >= 3 ? "Medium" : "Low",
        evidenceCount: count
      });
    }
  }

  // Create radar data
  // Keep a fixed axis order so charts are comparable across results
  const radarData = Object.entries(scores).map(([subject, count]) => ({
    subject,
    A: Math.min(100, count * 15 + 20), // pseudo-normalization for radar
    fullMark: 100
  }));

  return {
    dominancePattern: topPattern,
    radarData,
    tendencies
  };
}
