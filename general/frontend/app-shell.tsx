import type { IconType } from "react-icons";
import { FiArrowLeft } from "react-icons/fi";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";

export type AppNavPage = {
  end?: boolean;
  icon: IconType;
  label: string;
  to: string;
};

export function AppShell({
  accent,
  appName,
  children,
  icon: AppIcon,
  pages,
}: {
  accent: string;
  appName: string;
  children?: React.ReactNode;
  icon: IconType;
  pages?: AppNavPage[];
}) {
  const navigate = useNavigate();

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8f7fa] text-[#211d26]">
      <aside className="hidden w-[248px] shrink-0 flex-col border-r border-[#eeeaf1] bg-white px-4 py-5 lg:flex">
        <div className="flex items-center gap-2.5 px-2 pb-8 pt-1">
          <div className={`grid size-9 place-items-center ${accent}`}>
            <AppIcon className="size-[17px]" />
          </div>
          <span className="text-[17px] font-semibold tracking-[-0.04em]">{appName}</span>
        </div>

        {(pages ?? []).length > 0 ? (
          <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a49ba9]">
            Pages
          </div>
        ) : null}
        <nav className="space-y-1">
          {(pages ?? []).map((page) => (
            <NavLink
              className={({ isActive }) =>
                `flex h-10 items-center gap-3 px-3 text-[13px] font-medium transition ${
                  isActive ? "bg-[#f3eef7] text-[#4f3262]" : "text-[#716b76] hover:bg-[#f7f5f8]"
                }`
              }
              end={page.end}
              key={page.to}
              to={page.to}
            >
              <page.icon className="size-[17px]" />
              {page.label}
            </NavLink>
          ))}
        </nav>

        {children ? <div className="mt-4 min-h-0 flex-1 overflow-y-auto">{children}</div> : null}

        <div className={children ? "mt-4 border-t border-[#eeeaf1] pt-4" : "mt-auto border-t border-[#eeeaf1] pt-4"}>
          <button
            className="flex h-10 w-full items-center gap-3 px-3 text-[13px] font-medium text-[#716b76] transition hover:bg-[#f7f5f8] hover:text-[#3e3543]"
            onClick={() => navigate("/home")}
            type="button"
          >
            <FiArrowLeft className="size-[17px]" />
            Leave app
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[56px] shrink-0 items-center justify-between border-b border-[#eeeaf1] bg-white px-5 lg:hidden">
          <div className="flex items-center gap-2.5">
            <div className={`grid size-8 place-items-center ${accent}`}>
              <AppIcon className="size-4" />
            </div>
            <span className="text-sm font-semibold tracking-[-0.03em]">{appName}</span>
          </div>
          <Link className="flex items-center gap-1 text-xs text-[#736b78]" to="/home">
            <FiArrowLeft className="size-3.5" />
            Leave app
          </Link>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-[#eeeaf1] bg-white px-3 py-2 lg:hidden">
          {(pages ?? []).map((page) => (
            <NavLink
              className={({ isActive }) =>
                `shrink-0 px-3 py-2 text-xs font-medium transition ${
                  isActive ? "bg-[#f3eef7] text-[#4f3262]" : "text-[#716b76]"
                }`
              }
              end={page.end}
              key={page.to}
              to={page.to}
            >
              {page.label}
            </NavLink>
          ))}
        </nav>

        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function AppPageFrame({
  action,
  children,
  description,
  title,
}: {
  action?: React.ReactNode;
  children?: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <div className="flex h-full min-h-full flex-col px-5 py-8 sm:px-8 sm:py-10">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.05em] sm:text-[32px]">{title}</h1>
          <p className="mt-1.5 text-sm text-[#847b89]">{description}</p>
        </div>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </div>
      {children}
    </div>
  );
}
