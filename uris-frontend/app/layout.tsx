"use client";

import "./globals.css";
import { usePathname } from "next/navigation";
import { SidebarProvider, useSidebar } from "./components/Sidebar";
import Navbar from "./components/Navbar";
import Sidebar from "./components/Sidebar";


function LayoutContent({ children }: { children: React.ReactNode }) {
  const { isOpen } = useSidebar();
  const pathname = usePathname();
  const normalizedPath = pathname.toLowerCase();
  const hideAppChrome = normalizedPath === "/" || normalizedPath === "/signin" || normalizedPath === "/auth/callback";

  if (hideAppChrome) {
    return <>{children}</>;
  }

  return (
    <div 
      style={{
        marginLeft: isOpen ? "220px" : "0px",
        transition: "margin-left 220ms cubic-bezier(0.22, 1, 0.36, 1)"
      }}
      className="flex flex-col min-h-screen"
    >
      <Navbar />
      <main className="flex-1 bg-[#f0f0ef]">
        {children}
      </main>
    </div>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const normalizedPath = pathname.toLowerCase();
  const hideAppChrome = normalizedPath === "/" || normalizedPath === "/signin" || normalizedPath === "/auth/callback";

  return (
    <html lang="en">
      <body>
        <SidebarProvider>
          {!hideAppChrome && <Sidebar />}
          <LayoutContent>{children}</LayoutContent>
        </SidebarProvider>
      </body>
    </html>
  );
}
