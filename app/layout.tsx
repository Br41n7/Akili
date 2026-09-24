import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from 'react-hot-toast';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Akili — AI Study Copilot for African Students',
  description: 'Upload your notes, import PastQ question banks, and let AI build a course, quiz, and exam system tailored to your environment.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-[#F8F8F8] text-[#111]`}>
        <Toaster position="top-right" />
        {children}
      </body>
    </html>
  );
}
