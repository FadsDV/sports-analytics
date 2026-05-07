import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";

export const metadata: Metadata = {
  title: "DegenHUB – Sports Analytics",
  description: "Personal sports analytics dashboard. Live scores, stats and insights.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full overflow-hidden">
        <Sidebar />
        <TopBar />
        <main className="ml-[60px] xl:ml-[200px] mt-14 h-[calc(100vh-56px)] overflow-y-auto">
          {children}
        </main>
      </body>
    </html>
  );
}
