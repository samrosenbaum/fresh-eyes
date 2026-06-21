import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FreshEyes — Cold Case Intelligence',
  description: 'AI-powered investigative platform for cold case analysis',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0f1117] text-[#e8eaf0] antialiased">
        {children}
      </body>
    </html>
  );
}
