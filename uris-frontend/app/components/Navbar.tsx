"use client";

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
  return (
    <header className="h-[52px] bg-white border-b border-surface-200 flex items-center px-4 gap-3">
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