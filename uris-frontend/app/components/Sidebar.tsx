"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface SidebarContextType {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
}

const SidebarContext = createContext<SidebarContextType>({
  isOpen: true,
  toggle: () => {},
  close: () => {},
});

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(true);
  const toggle = () => setIsOpen((v) => !v);
  const close = () => setIsOpen(false);
  return (
    <SidebarContext.Provider value={{ isOpen, toggle, close }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  href: string;
  badge?: number;
  section?: "main" | "bottom";
}

const DatabaseIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
  </svg>
);

const AgentsIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c0-3.314 3.134-6 7-6s7 2.686 7 6" />
  </svg>
);

const AnalyticsIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v18h18" />
    <path d="M7 16l4-4 4 4 4-8" />
  </svg>
);

const PoliciesIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14,2 14,8 20,8" />
    <line x1="9" y1="13" x2="15" y2="13" />
    <line x1="9" y1="17" x2="13" y2="17" />
  </svg>
);

const AuditIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 11l3 3L22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
);

const SettingsIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
);

const ChevronLeftIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const NAV_ITEMS: NavItem[] = [
  { id: "datasets",   label: "Datasets",   icon: <DatabaseIcon />,   href: "/Datasets",  section: "main"   },
  { id: "agents",     label: "Agents",     icon: <AgentsIcon />,     href: "/Agents",    badge: 12, section: "main" },
  { id: "analytics",  label: "Analytics",  icon: <AnalyticsIcon />,  href: "/analytics", section: "main"   },
  { id: "policies",   label: "Policies",   icon: <PoliciesIcon />,   href: "/policies",  section: "main"   },
  { id: "audit-log",  label: "Audit Log",  icon: <AuditIcon />,      href: "/audit-log", section: "main"   },
  { id: "settings",   label: "Settings",   icon: <SettingsIcon />,   href: "/settings",  section: "bottom" },
];

export default function Sidebar() {
  const { isOpen, toggle } = useSidebar();
  const pathname = usePathname();
  const active = NAV_ITEMS.find((i) => pathname.startsWith(i.href))?.id ?? "datasets";

  const mainItems  = NAV_ITEMS.filter((i) => i.section === "main");
  const bottomItems = NAV_ITEMS.filter((i) => i.section === "bottom");

  return (
    <>
      {/* Sidebar panel */}
      <aside
        style={{
          transform: isOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 220ms cubic-bezier(0.22, 1, 0.36, 1), width 220ms cubic-bezier(0.22, 1, 0.36, 1)",
          width: isOpen ? "220px" : "0px",
        }}
        className="fixed left-0 top-0 bottom-0 z-20 overflow-hidden bg-[#f9f9f9] border-r border-surface-200 flex flex-col"
      >
        <div className="flex flex-col h-full w-[220px] px-2 py-3">
          {/* Toggle button */}
          <button
            onClick={toggle}
            className="mb-2 w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-ink-500 hover:bg-white/70 hover:text-ink-700 transition-all duration-150"
            title="Close sidebar"
          >

                {/* Logo */}
      <div className="flex items-center gap-2 select-none">
        <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center flex-shrink-0">
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
            <path d="M2 7L5.5 3.5L9 7L5.5 10.5L2 7Z" fill="white" opacity="0.55" />
            <path d="M6 7L9.5 3.5L13 7L9.5 10.5L6 7Z" fill="white" />
          </svg>
        </div>
        <span className="text-[13.5px] font-semibold tracking-tight text-ink-900">
          URIS
        </span>
      </div>


            <span className="text-ink-400 hover:text-ink-600">
              <ChevronLeftIcon />
            </span>
          </button>

          {/* Main nav */}
          <nav className="flex flex-col gap-0.5 flex-1">
            {mainItems.map((item) => (
              <NavButton
                key={item.id}
                item={item}
                isActive={active === item.id}
              />
            ))}
          </nav>

          {/* Divider */}
          <div className="h-px bg-surface-200 mx-2 my-2" />

          {/* Bottom nav */}
          <div className="flex flex-col gap-0.5">
            {bottomItems.map((item) => (
              <NavButton
                key={item.id}
                item={item}
                isActive={active === item.id}
              />
            ))}
          </div>
        </div>
      </aside>

      {/* Floating toggle button when closed */}
      {!isOpen && (
        <button
          onClick={toggle}
          className="fixed left-3 top-[16px] z-30 w-9 h-9 flex items-center justify-center rounded-lg bg-white border border-surface-200 shadow-md hover:shadow-lg hover:bg-surface-50 text-ink-500 hover:text-ink-700 transition-all duration-150"
          title="Open sidebar"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}
    </>
  );
}

// ── NavButton ──────────────────────────────────────────────────────────────
function NavButton({
  item,
  isActive,
}: {
  item: NavItem;
  isActive: boolean;
}) {
  return (
    <Link
      href={item.href}
      className={[
        "group relative w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 text-left select-none whitespace-nowrap",
        isActive
          ? "bg-white text-ink-900 shadow-sm border border-surface-200"
          : "text-ink-500 hover:bg-white/70 hover:text-ink-700",
      ].join(" ")}
    >
      {/* Active bar */}
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-accent" />
      )}

      {/* Icon box */}
      <span
        className={[
          "w-[28px] h-[28px] rounded-md flex items-center justify-center flex-shrink-0 transition-colors",
          isActive
            ? "bg-accent/10 text-accent"
            : "bg-surface-100 text-ink-400 group-hover:bg-surface-200 group-hover:text-ink-600",
        ].join(" ")}
      >
        {item.icon}
      </span>

      {/* Label */}
      <span className="flex-1">{item.label}</span>

      {/* Badge */}
      {item.badge !== undefined && (
        <span className="ml-auto text-[10.5px] font-semibold px-1.5 py-0.5 rounded-md bg-accent/10 text-accent font-mono border border-accent/15">
          {item.badge}
        </span>
      )}
    </Link>
  );
}