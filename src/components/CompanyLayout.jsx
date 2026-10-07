import React, { useEffect, useState } from "react";
import { Outlet, useParams, NavLink, useNavigate, useLocation, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { PinProvider } from "@/components/pins/PinContext";
import {
  LayoutDashboard, Users, Landmark, FolderKanban, CheckSquare, BookOpen,
  FileText, Search, Scale, CalendarClock, Settings, ChevronLeft, Menu, Pin } from
"lucide-react";

const NAV = [
{ to: "dashboard", label: "Dashboard", icon: LayoutDashboard },
{ to: "team", label: "Your advisors", icon: Users },
{ to: "boardroom", label: "Boardroom", icon: Landmark },
{ to: "projects", label: "Projects", icon: FolderKanban },
{ to: "tasks", label: "Tasks", icon: CheckSquare },
{ to: "pins", label: "Pins", icon: Pin },
{ to: "knowledge", label: "Knowledge", icon: BookOpen },
{ to: "documents", label: "Documents", icon: FileText },
{ to: "research", label: "Research", icon: Search },
{ to: "decisions", label: "Decisions", icon: Scale },
{ to: "meetings", label: "Meetings", icon: CalendarClock },
{ to: "settings", label: "Settings", icon: Settings }];

// The light sidebar from the Workstream L mocks: a warm panel a step below
// the paper, the company in an outlined tile, and the current page drawn as
// a small outlined card.
const SIDEBAR = { background: "hsl(var(--side))", color: "hsl(var(--foreground))" };

export default function CompanyLayout() {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [company, setCompany] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    base44.entities.Company.get(companyId).then(setCompany).catch(() => navigate("/"));
  }, [companyId]);

  useEffect(() => {setOpen(false);}, [location.pathname]);

  const SidebarInner =
  <div className="flex flex-col h-full border-r border-border" style={SIDEBAR}>
      <div className="px-4 pt-5 pb-3">
        <button onClick={() => navigate("/companies")} className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-sm mb-3 transition-colors">
          <ChevronLeft className="w-4 h-4" /> My companies
        </button>
        <div className="flex items-center gap-3 px-2 pb-4 border-b border-border">
          <div className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center font-display text-lg overflow-hidden bg-card border-2 border-foreground shadow-[2px_2px_0_hsl(var(--foreground))]">
            {company?.logo_url ? <img src={company.logo_url} alt="" className="w-full h-full object-cover" /> : company?.name?.[0] || "•"}
          </div>
          <div className="min-w-0">
            <div className="font-display font-medium text-[1.05rem] leading-tight truncate">{company?.name || "…"}</div>
            <div className="text-xs text-muted-foreground truncate">{company?.industry}</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
        {NAV.map((item) =>
      <NavLink
        key={item.to}
        to={`/company/${companyId}/${item.to}`}
        className={({ isActive }) =>
        `flex items-center gap-3 px-2.5 py-2 rounded-lg text-[0.95rem] border-2 transition-colors ${
        isActive ? "bg-card border-foreground shadow-[2px_2px_0_hsl(var(--foreground))] font-semibold" : "border-transparent hover:bg-foreground/5"}`
        }>

            <item.icon className="w-[18px] h-[18px] opacity-70" strokeWidth={1.75} />
            {item.label}
          </NavLink>
      )}
      </nav>
      <div className="mx-4 py-4 border-t border-border text-muted-foreground">
        <div className="text-[0.85rem] font-display italic mb-1">Never build alone.</div>
        <div className="flex items-center gap-3 text-xs">
          <Link to="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
          <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
          <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
        </div>
      </div>
    </div>;


  return (
    <div className="min-h-screen flex">
      <aside className="hidden lg:flex w-64 shrink-0 sticky top-0 h-screen">
        {SidebarInner}
      </aside>

      {open &&
      <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-foreground/20 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="relative w-72 max-w-[85vw] h-full shadow-[4px_0_0_hsl(var(--foreground))]">{SidebarInner}</aside>
        </div>
      }

      <div className="flex-1 min-w-0">
        <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 border-b-2 border-foreground bg-[hsl(var(--side))]">
          <button onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="w-6 h-6" /></button>
          <span className="font-display">{company?.name}</span>
          <span className="w-6" />
        </header>
        <main className="max-w-6xl mx-auto px-5 sm:px-8 py-8 lg:py-12">
          {company && <PinProvider companyId={companyId}><Outlet context={{ company, setCompany }} /></PinProvider>}
        </main>
      </div>
    </div>);

}
