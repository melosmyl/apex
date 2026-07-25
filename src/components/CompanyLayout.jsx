import React, { useEffect, useState } from "react";
import { Outlet, useParams, NavLink, useNavigate, useLocation, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { PinProvider } from "@/components/pins/PinContext";
import {
  LayoutDashboard, Users, Landmark, FolderKanban, CheckSquare, BookOpen,
  FileText, Search, Scale, CalendarClock, Settings, ChevronLeft, Menu, X, Pin } from
"lucide-react";

const NAV = [
{ to: "dashboard", label: "Dashboard", icon: LayoutDashboard },
{ to: "team", label: "Executive Team", icon: Users },
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
  <div className="flex flex-col h-full">
      <div className="px-6 py-6 border-b border-border/60">
        <button onClick={() => navigate("/")} className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-4 transition-colors">
          <ChevronLeft className="w-4 h-4" /> My Companies
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl text-primary-foreground flex items-center justify-center font-display text-lg overflow-hidden bg-[#247420]">
            {company?.logo_url ? <img src={company.logo_url} alt="" className="w-full h-full object-cover" /> : company?.name?.[0] || "•"}
          </div>
          <div className="min-w-0">
            <div className="font-display text-base leading-tight truncate">{company?.name || "…"}</div>
            <div className="text-xs text-muted-foreground truncate">{company?.industry}</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {NAV.map((item) =>
      <NavLink
        key={item.to}
        to={`/company/${companyId}/${item.to}`}
        className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
        isActive ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`

        }>
        
            <item.icon className="w-[18px] h-[18px]" strokeWidth={1.75} />
            {item.label}
          </NavLink>
      )}
      </nav>
      <div className="px-6 py-4 border-t border-border/60 flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-display italic">Never build alone.</span>
        <Link to="/pricing" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Pricing</Link>
      </div>
    </div>;


  return (
    <div className="min-h-screen bg-background flex">
      <aside className="hidden lg:flex w-72 shrink-0 border-r border-border/60 bg-card/50 backdrop-blur sticky top-0 h-screen">
        {SidebarInner}
      </aside>

      {open &&
      <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-foreground/20 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="relative w-72 bg-card h-full shadow-xl">{SidebarInner}</aside>
        </div>
      }

      <div className="flex-1 min-w-0">
        <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 border-b border-border/60 bg-card/80 backdrop-blur">
          <button onClick={() => setOpen(true)}><Menu className="w-6 h-6" /></button>
          <span className="font-display">{company?.name}</span>
          <span className="w-6" />
        </header>
        <main className="max-w-6xl mx-auto px-5 sm:px-8 py-8 lg:py-12">
          {company && <PinProvider companyId={companyId}><Outlet context={{ company, setCompany }} /></PinProvider>}
        </main>
      </div>
    </div>);

}