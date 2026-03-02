import type { Metadata } from "next";
import "./globals.css";
import { SidebarProvider } from "./components/Sidebar";
import Navbar from "./components/Navbar";
import Sidebar from "./components/Sidebar";

export const metadata: Metadata = {
  title: "URIS",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <SidebarProvider>
          <Navbar />
          <Sidebar />
          <div className="pt-[52px] pl-[220px] min-h-screen bg-[#f0f0ef]">
            {children}
          </div>
        </SidebarProvider>
      </body>
    </html>
  );
}
