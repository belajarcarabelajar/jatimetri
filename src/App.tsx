import { useEffect, lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router";
import { Loader2 } from "lucide-react";
import { MainLayout } from "./components/layout/MainLayout";
import NotFound from "./components/NotFound";
import { RequireSession } from "./lib/auth";

// Route components are code-split so the landing page does not pay for
// recharts, the assessment flow or the PDF pipeline up front.
const Assessment = lazy(() => import("./features/assessment/Assessment"));
const Dashboard = lazy(() => import("./features/dashboard/Dashboard"));
const Profile = lazy(() => import("./features/profile/Profile"));

function RouteFallback() {
  return (
    <div role="status" aria-label="Loading" className="flex-1 min-h-[50vh] flex items-center justify-center bg-background">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
    </div>
  );
}

// Suspense per route keeps MainLayout (header/footer) mounted while a page chunk loads.
function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

function Home() {
  useEffect(() => {
    document.title = "Jatimetri - Beranda";
  }, []);

  return (
    <div className="flex-1 flex items-center justify-center bg-background relative py-12 overflow-hidden">
      {/* Organic Background Blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] bg-primary/10 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-secondary/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }} />
      <div className="absolute top-[20%] right-[10%] w-[30vw] h-[30vw] bg-accent/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '4s' }} />

      <div className="text-center space-y-6 relative z-10 px-4 max-w-4xl mx-auto animate-in fade-in-up duration-700">
        <div className="inline-flex items-center justify-center px-4 py-1.5 mb-4 text-sm font-medium rounded-full bg-secondary/20 text-primary border border-secondary/30 backdrop-blur-xs">
          ✨ Jelajahi Dirimu
        </div>
        <h1 className="text-5xl md:text-7xl font-bold text-foreground font-heading tracking-tight leading-tight">
          Jatimetri <br/> <span className="text-primary">Assessment</span>
        </h1>
        <p className="text-muted-foreground text-lg md:text-xl max-w-2xl mx-auto font-sans leading-relaxed">
          Temukan kekuatan sejatimu dan arah pertumbuhanmu melalui pendekatan psikologi yang mendalam.
        </p>
        <div className="pt-8">
          <Link 
            to="/assessment" 
            className="inline-flex items-center justify-center bg-primary text-primary-foreground px-8 py-4 rounded-full font-medium shadow-premium hover:shadow-premium-hover hover:-translate-y-1 hover:scale-[1.02] transition-all duration-300 text-lg group"
          >
            Mulai Assessment
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-2 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}

function ProtectedProfile() {
  return (
    <RequireSession next="/profile">
      <Lazy><Profile /></Lazy>
    </RequireSession>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Lazy><Dashboard /></Lazy>} />
          <Route path="/profile" element={<ProtectedProfile />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        {/* Assessment is outside MainLayout for immersive full-screen experience */}
        <Route path="/assessment" element={<Lazy><Assessment /></Lazy>} />
      </Routes>
    </BrowserRouter>
  );
}
