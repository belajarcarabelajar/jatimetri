import { useState } from "react";
import { Outlet, Link, useNavigate } from "react-router";
import { LogOut, Menu, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSession } from "@/lib/auth";
import { useAssessmentStore } from "@/store/useAssessmentStore";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function MainLayout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { t } = useTranslation();
  const { status, email, signIn, signOut } = useSession();
  const navigate = useNavigate();
  const isSignedIn = status === "signedIn";
  const isSignedOut = status === "signedOut";

  const resetAssessment = useAssessmentStore((s) => s.resetAssessment);

  const handleSignOut = async () => {
    setIsMobileMenuOpen(false);
    // The name and answers persist in localStorage; clear them so the next person on this browser cannot read them.
    resetAssessment();
    // Leave first: on a protected page (/profile) a signed-out state would otherwise
    // make RequireSession start a new login before the navigation happens.
    navigate("/");
    await signOut();
  };

  const handleSignIn = () => {
    setIsMobileMenuOpen(false);
    signIn();
  };

  return (
    <div className="min-h-screen flex flex-col bg-background relative">
      <header className="w-full px-6 py-4 flex items-center justify-between z-20 border-b border-border/30 bg-background/80 backdrop-blur-md sticky top-0 shadow-sm">
        <Link to="/" className="font-heading font-bold text-xl text-primary hover:opacity-80 transition-opacity py-2 flex items-center gap-2">
          <span className="bg-primary text-primary-foreground w-8 h-8 rounded-lg flex items-center justify-center text-sm shadow-sm">IP</span>
          Jatimetri
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden sm:flex items-center gap-2" aria-label={t('main_navigation')}>
          <LanguageSwitcher className="mr-2" />
          <Link to="/assessment" className="px-4 py-2 text-sm font-medium text-foreground/80 hover:text-primary hover:bg-secondary/20 rounded-full transition-all">
            {t('nav_assessment')}
          </Link>
          {isSignedIn && (
            <>
              <Link to="/dashboard" className="px-4 py-2 text-sm font-medium text-foreground/80 hover:text-primary hover:bg-secondary/20 rounded-full transition-all">
                {t('nav_dashboard')}
              </Link>
              <Link to="/profile" className="px-4 py-2 text-sm font-medium text-foreground/80 hover:text-primary hover:bg-secondary/20 rounded-full transition-all mr-2">
                {t('nav_profile')}
              </Link>
              <div role="group" aria-label={t('account')} className="flex items-center gap-2 pl-2 border-l border-border/50">
                <span className="text-xs text-muted-foreground max-w-[12rem] truncate" title={email}>
                  {email}
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-foreground/80 hover:text-primary hover:bg-secondary/20 rounded-full transition-all"
                >
                  <LogOut className="w-4 h-4" aria-hidden="true" />
                  {t('sign_out')}
                </button>
              </div>
            </>
          )}
          {isSignedOut && (
            <button
              type="button"
              onClick={handleSignIn}
              className="px-6 py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-full hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              {t('sign_in')}
            </button>
          )}
        </nav>

        {/* Mobile Nav Toggle */}
        <div className="sm:hidden flex items-center gap-3">
          {isSignedIn && email && (
            <span
              className="w-8 h-8 rounded-full bg-primary/15 text-primary text-sm font-semibold flex items-center justify-center"
              title={email}
              aria-hidden="true"
            >
              {email.charAt(0).toUpperCase()}
            </span>
          )}
          <button
            className="p-2 -mr-2 text-foreground/80 hover:text-foreground hover:bg-secondary/20 rounded-full transition-colors"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label={t('toggle_menu')}
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* Mobile Nav Drawer */}
      {isMobileMenuOpen && (
        <div className="sm:hidden absolute top-[73px] left-0 right-0 bg-background/95 backdrop-blur-md border-b border-border shadow-premium z-10 flex flex-col px-4 py-4 gap-2 animate-in slide-in-from-top-4 duration-300">
          <LanguageSwitcher className="self-start mb-1" />
          <Link to="/assessment" onClick={() => setIsMobileMenuOpen(false)} className="px-4 py-3 text-sm font-medium rounded-xl hover:bg-secondary/20 hover:text-primary transition-colors">
            {t('nav_assessment')}
          </Link>
          {isSignedIn && (
            <>
              <Link to="/dashboard" onClick={() => setIsMobileMenuOpen(false)} className="px-4 py-3 text-sm font-medium rounded-xl hover:bg-secondary/20 hover:text-primary transition-colors">
                {t('nav_dashboard')}
              </Link>
              <Link to="/profile" onClick={() => setIsMobileMenuOpen(false)} className="px-4 py-3 text-sm font-medium rounded-xl hover:bg-secondary/20 hover:text-primary transition-colors">
                {t('nav_profile')}
              </Link>
              <div className="mt-2 pt-3 border-t border-border/50 px-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{t('signed_in_as')}</p>
                  <p className="text-sm font-medium truncate">{email}</p>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl border border-border hover:bg-secondary/20 hover:text-primary transition-colors"
                >
                  <LogOut className="w-4 h-4" aria-hidden="true" />
                  {t('sign_out')}
                </button>
              </div>
            </>
          )}
          {isSignedOut && (
            <button
              type="button"
              onClick={handleSignIn}
              className="w-full text-center mt-2 px-4 py-3 text-sm font-medium bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-opacity"
            >
              {t('sign_in')}
            </button>
          )}
        </div>
      )}

      <main className="flex-1 flex flex-col relative z-0">
        <Outlet />
      </main>
    </div>
  );
}
