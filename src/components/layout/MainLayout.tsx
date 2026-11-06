import { useState } from "react";
import { Outlet, Link } from "react-router";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react";
import { Menu, X } from "lucide-react";

export function MainLayout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-background relative">
      <header className="w-full px-6 py-4 flex items-center justify-between z-20 border-b border-border/30 bg-background/80 backdrop-blur-md sticky top-0 shadow-sm">
        <Link to="/" className="font-heading font-bold text-xl text-primary hover:opacity-80 transition-opacity py-2 flex items-center gap-2">
          <span className="bg-primary text-primary-foreground w-8 h-8 rounded-lg flex items-center justify-center text-sm shadow-sm">IP</span>
          Jatimetri
        </Link>
        
        {/* Desktop Nav */}
        <nav className="hidden sm:flex items-center gap-2">
          <Link to="/assessment" className="px-4 py-2 text-sm font-medium text-foreground/80 hover:text-primary hover:bg-secondary/20 rounded-full transition-all">
            Assessment
          </Link>
          <SignedIn>
            <Link to="/dashboard" className="px-4 py-2 text-sm font-medium text-foreground/80 hover:text-primary hover:bg-secondary/20 rounded-full transition-all">
              Dashboard
            </Link>
            <Link to="/profile" className="px-4 py-2 text-sm font-medium text-foreground/80 hover:text-primary hover:bg-secondary/20 rounded-full transition-all mr-2">
              Profil
            </Link>
            <UserButton />
          </SignedIn>
          <SignedOut>
            <SignInButton mode="modal">
              <button className="px-6 py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-full hover:shadow-md hover:-translate-y-0.5 transition-all">Sign In</button>
            </SignInButton>
          </SignedOut>
        </nav>

        {/* Mobile Nav Toggle */}
        <div className="sm:hidden flex items-center gap-3">
          <SignedIn>
            <UserButton />
          </SignedIn>
          <button 
            className="p-2 -mr-2 text-foreground/80 hover:text-foreground hover:bg-secondary/20 rounded-full transition-colors"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle Menu"
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* Mobile Nav Drawer */}
      {isMobileMenuOpen && (
        <div className="sm:hidden absolute top-[73px] left-0 right-0 bg-background/95 backdrop-blur-md border-b border-border shadow-premium z-10 flex flex-col px-4 py-4 gap-2 animate-in slide-in-from-top-4 duration-300">
          <Link to="/assessment" onClick={() => setIsMobileMenuOpen(false)} className="px-4 py-3 text-sm font-medium rounded-xl hover:bg-secondary/20 hover:text-primary transition-colors">
            Assessment
          </Link>
          <SignedIn>
            <Link to="/dashboard" onClick={() => setIsMobileMenuOpen(false)} className="px-4 py-3 text-sm font-medium rounded-xl hover:bg-secondary/20 hover:text-primary transition-colors">
              Dashboard
            </Link>
            <Link to="/profile" onClick={() => setIsMobileMenuOpen(false)} className="px-4 py-3 text-sm font-medium rounded-xl hover:bg-secondary/20 hover:text-primary transition-colors">
              Profil
            </Link>
          </SignedIn>
          <SignedOut>
            <SignInButton mode="modal">
              <button onClick={() => setIsMobileMenuOpen(false)} className="w-full text-center mt-2 px-4 py-3 text-sm font-medium bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-opacity">
                Sign In
              </button>
            </SignInButton>
          </SignedOut>
        </div>
      )}

      <main className="flex-1 flex flex-col relative z-0">
        <Outlet />
      </main>
    </div>
  );
}
