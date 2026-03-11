import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { ProjectProvider } from "@/contexts/ProjectContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Solution Agent",
  description: "Accelerating solution architecture workflows",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.className} h-full bg-white text-slate-900`}>
        <ProjectProvider>
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-auto bg-slate-100/30 relative">
              {/* Global Background Watermark */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden flex items-end justify-end opacity-[0.03] z-[-1]">
                <img 
                  src="/icon.svg" 
                  alt="Background Watermark" 
                  className="w-[800px] h-[800px] object-contain translate-x-1/4 translate-y-1/4 -rotate-12"
                />
              </div>
              {children}
            </main>
          </div>
        </ProjectProvider>
      </body>
    </html>
  );
}
