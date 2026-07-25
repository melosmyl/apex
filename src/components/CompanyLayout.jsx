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
      <div className="px-7 py-8 border-b border-border/50">
        <button onClick={() => navigate("/")} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-xs mb-6 transition-colors tracking-wide">
          <ChevronLeft className="w-3.5 h-3.5" /> All Companies
        </button>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl text-primary-foreground flex items-center justify-center font-display text-xl overflow-hidden bg-primary shadow-soft">
            {company?.logo_url ? <img src={company.logo_url} alt="" className="w-full h-full object-cover" /> : company?.name?.[0] || "•"}
          </div>
          <div className="min-w-0">
            <div className="font-display text-lg leading-tight truncate font-normal">{company?.name || "…"}</div>
            <div className="text-xs text-muted-foreground truncate mt-0.5">{company?.industry}</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-4 py-5 space-y-0.5">
        {NAV.map((item) =>
      <NavLink
        key={item.to}
        to={`/company/${companyId}/${item.to}`}
        className={({ isActive }) =>
        `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-[13px] transition-all duration-300 ${
        isActive ? "bg-accent/70 text-accent-foreground font-medium" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"}`

        }>
            <item.icon className="w-[17px] h-[17px]" strokeWidth={1.5} />
            {item.label}
          </NavLink>
      )}
      </nav>
      <div className="px-7 py-5 border-t border-border/50 flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-display italic">Never build alone.</span>
        <Link to="/pricing" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Pricing</Link>
      </div>
    </div>;


  return (
    <div className="min-h-screen bg-background flex">
      <aside className="hidden lg:flex w-72 shrink-0 border-r border-border/50 bg-sidebar/60 backdrop-blur-xl sticky top-0 h-screen">
        {SidebarInner}
      </aside>

      {open &&
      <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-foreground/15 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="relative w-72 bg-card h-full shadow-elevated">{SidebarInner}</aside>
        </div>
      }

      <div className="flex-1 min-w-0">
        <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-5 py-3.5 border-b border-border/50 bg-card/80 backdrop-blur-xl">
          <button onClick={() => setOpen(true)}><Menu className="w-5 h-5 text-muted-foreground" /></button>
          <span className="font-display text-lg">{company?.name}</span>
          <span className="w-5" />
        </header>
        <main className="max-w-5xl mx-auto px-6 sm:px-10 py-10 lg:py-16">
          {company && <PinProvider companyId={companyId}><Outlet context={{ company, setCompany }} /></PinProvider>}
        </main>
      </div>
    </div>);

}