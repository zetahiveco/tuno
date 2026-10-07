import { useState } from "react";
import { FiArrowLeft, FiBriefcase, FiCalendar, FiCheckSquare, FiColumns, FiCommand, FiDatabase, FiFileText, FiFolder, FiGlobe, FiGrid, FiLogOut, FiMail, FiShield, FiZap } from "react-icons/fi";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { api, type User } from "@/lib/api-client";

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid size-9 place-items-center bg-[#24152f] text-white">
        <FiCommand className="size-[17px]" />
      </div>
      <span className="text-[17px] font-semibold tracking-[-0.04em]">tuno</span>
    </div>
  );
}

function Sidebar({ user, onLogout }: { user: User; onLogout: () => void }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-[248px] flex-col border-r border-[#eeeaf1] bg-white px-4 py-5 lg:flex">
      <Link aria-label="Tuno overview" className="px-2 pb-8 pt-1" to="/home"><Brand /></Link>
      <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a49ba9]">Workspace</div>
      <nav className="space-y-1">
        <NavLink className={({ isActive }) => `flex h-10 items-center gap-3 px-3 text-[13px] font-medium transition ${isActive ? "bg-[#f3eef7] text-[#4f3262]" : "text-[#716b76] hover:bg-[#f7f5f8]"}`} to="/home">
          <FiGrid className="size-[17px]" /> Overview
        </NavLink>
      </nav>
      <div className="mb-2 mt-9 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a49ba9]">Your apps</div>
      <nav className="space-y-1">
        <NavLink className={({ isActive }) => `flex h-10 items-center gap-3 px-3 text-[13px] font-medium transition ${isActive ? "bg-[#f3eef7] text-[#4f3262]" : "text-[#716b76] hover:bg-[#f7f5f8]"}`} to="/mailer">
          <FiMail className="size-[17px]" /> Mailer
        </NavLink>
        <NavLink className={({ isActive }) => `flex h-10 items-center gap-3 px-3 text-[13px] font-medium transition ${isActive ? "bg-[#f3eef7] text-[#4f3262]" : "text-[#716b76] hover:bg-[#f7f5f8]"}`} to="/notes">
          <FiFileText className="size-[17px]" /> Notes
        </NavLink>
        <NavLink className={({ isActive }) => `flex h-10 items-center gap-3 px-3 text-[13px] font-medium transition ${isActive ? "bg-[#f3eef7] text-[#4f3262]" : "text-[#716b76] hover:bg-[#f7f5f8]"}`} to="/forms">
          <FiCheckSquare className="size-[17px]" /> Forms
        </NavLink>
        <NavLink className={({ isActive }) => `flex h-10 items-center gap-3 px-3 text-[13px] font-medium transition ${isActive ? "bg-[#f3eef7] text-[#4f3262]" : "text-[#716b76] hover:bg-[#f7f5f8]"}`} to="/scheduler">
          <FiCalendar className="size-[17px]" /> Scheduler
        </NavLink>
        <NavLink className={({ isActive }) => `flex h-10 items-center gap-3 px-3 text-[13px] font-medium transition ${isActive ? "bg-[#f3eef7] text-[#4f3262]" : "text-[#716b76] hover:bg-[#f7f5f8]"}`} to="/crm">
          <FiBriefcase className="size-[17px]" /> CRM
        </NavLink>
        <NavLink className={({ isActive }) => `flex h-10 items-center gap-3 px-3 text-[13px] font-medium transition ${isActive ? "bg-[#f3eef7] text-[#4f3262]" : "text-[#716b76] hover:bg-[#f7f5f8]"}`} to="/tasks">
          <FiColumns className="size-[17px]" /> Tasks
        </NavLink>
        <NavLink className={({ isActive }) => `flex h-10 items-center gap-3 px-3 text-[13px] font-medium transition ${isActive ? "bg-[#f3eef7] text-[#4f3262]" : "text-[#716b76] hover:bg-[#f7f5f8]"}`} to="/documents">
          <FiFolder className="size-[17px]" /> Documents
        </NavLink>
        <NavLink className={({ isActive }) => `flex h-10 items-center gap-3 px-3 text-[13px] font-medium transition ${isActive ? "bg-[#f3eef7] text-[#4f3262]" : "text-[#716b76] hover:bg-[#f7f5f8]"}`} to="/websites">
          <FiGlobe className="size-[17px]" /> Websites
        </NavLink>
        <NavLink className={({ isActive }) => `flex h-10 items-center gap-3 px-3 text-[13px] font-medium transition ${isActive ? "bg-[#f3eef7] text-[#4f3262]" : "text-[#716b76] hover:bg-[#f7f5f8]"}`} to="/cms">
          <FiDatabase className="size-[17px]" /> CMS
        </NavLink>
      </nav>
      <div className="mt-auto bg-[#f8f5fa] p-4">
        <div className="mb-2 grid size-8 place-items-center bg-white text-[#78538c] shadow-sm"><FiZap className="size-4" /></div>
        <p className="text-xs font-semibold">More room to focus</p>
        <p className="mt-1 text-[11px] leading-5 text-[#857b89]">Your apps, settings, and team — all connected.</p>
      </div>
      <Separator className="my-4 bg-[#eeeaf1]" />
      <div className="flex items-center gap-2.5 px-1">
        <div className="grid size-9 shrink-0 place-items-center bg-[#e8dced] text-xs font-semibold uppercase text-[#513d5c]">{(user.name.trim() || user.email)[0]}</div>
        <div className="min-w-0 flex-1">
          {user.name.trim() && user.name.trim().toLowerCase() !== "user" ? (
            <>
              <p className="truncate text-xs font-medium">{user.name}</p>
              <p className="mt-0.5 text-[10px] text-[#968d9a]">{user.email}</p>
            </>
          ) : (
            <>
              <p className="truncate text-xs font-medium">{user.email}</p>
              <p className="mt-0.5 text-[10px] text-[#968d9a]">{user.role.toLowerCase()}</p>
            </>
          )}
        </div>
        <button aria-label="Sign out" className="p-2 text-[#908794] hover:bg-white hover:text-[#3e3543]" onClick={onLogout}><FiLogOut className="size-4" /></button>
      </div>
    </aside>
  );
}

export function WorkspaceShell({
  children,
  pageName,
  user,
  onLogout,
}: {
  children: React.ReactNode;
  pageName: string;
  user: User;
  onLogout: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  async function signOut() {
    setError("");
    try {
      await api<void>("/api/auth/logout", { method: "POST" });
      onLogout();
      navigate("/auth/login", { replace: true });
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : "Could not sign out.");
    }
  }

  const mobileNav = location.pathname === "/home" ? (
    <button className="text-[#736b78] lg:hidden" onClick={signOut}>Sign out <FiLogOut className="ml-1 inline size-3.5" /></button>
  ) : (
    <Link className="flex items-center gap-1 text-xs text-[#736b78] lg:hidden" to="/home"><FiArrowLeft className="size-3.5" /> Workspace</Link>
  );

  return (
    <div className="min-h-screen bg-[#f8f7fa] text-[#211d26]">
      <Sidebar user={user} onLogout={() => void signOut()} />
      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-10 flex h-[66px] items-center justify-between border-b border-[#eeeaf1] bg-white/90 px-5 backdrop-blur sm:px-8">
          <div className="flex items-center gap-2 text-xs text-[#9a919e]">
            <Link className="font-medium text-[#514956]" to="/home">Workspace</Link>
            <span>/</span>
            <span>{pageName}</span>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="hidden bg-[#f4f1f6] px-2.5 py-1 text-[10px] font-medium text-[#6f6078] sm:inline-flex">{user.role}</Badge>
            {mobileNav}
          </div>
        </header>
        <main className="mx-auto max-w-[1180px] px-5 py-8 sm:px-8 sm:py-10">
          {error && <p aria-live="polite" className="mb-4 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</p>}
          {children}
          <footer className="mt-12 flex items-center justify-between border-t border-[#ece8ef] pt-5 text-[10px] text-[#a198a5]">
            <span>© {new Date().getFullYear()} Tuno</span>
            <span className="flex items-center gap-1"><FiShield className="size-3" /> Your workspace, your rules</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
