"use client";

import { useSidebar } from "./Sidebar";
function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      {open ? (
        <>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </>
      ) : (
        <>
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="20" y2="17" />
        </>
      )}
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export default function Navbar() {
  const { isOpen, toggle } = useSidebar();

  return (
    <header className="fixed top-0 left-0 right-0 z-30 h-[52px] bg-white border-b border-surface-200 flex items-center px-4 gap-3">
      {/* Hamburger */}
      <button
        onClick={toggle}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-500 hover:bg-surface-100 hover:text-ink-700 transition-colors"
        aria-label="Toggle sidebar"
      >
        <MenuIcon open={isOpen} />
      </button>

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

      {/* Separator */}
      <div className="w-px h-4 bg-surface-300 mx-1" />

      {/* Breadcrumb */}
      <span className="text-[12px] text-ink-400 font-mono">dashboard</span>

      {/* Right actions */}
      <div className="ml-auto flex items-center gap-1.5">
        <button className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-400 hover:bg-surface-100 hover:text-ink-700 transition-colors border border-surface-200">
          <SearchIcon />
        </button>
        <button className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-400 hover:bg-surface-100 hover:text-ink-700 transition-colors border border-surface-200">
          <BellIcon />
        </button>
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent to-violet-500 text-white text-[10px] font-semibold flex items-center justify-center ml-1 cursor-pointer select-none">
          JD
        </div>
      </div>
    </header>
  );
}