import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Source_Serif_4 } from 'next/font/google';
import './globals.css';
import { Toaster } from 'react-hot-toast';

// Bricolage Grotesque carries the interface; Source Serif 4 carries anything you read for a long time.
// The latin-ext subset covers Yoruba, Igbo and Hausa letters.
const ui = Bricolage_Grotesque({ subsets: ['latin', 'latin-ext'], variable: '--font-ui', display: 'swap' });
const read = Source_Serif_4({ subsets: ['latin', 'latin-ext'], variable: '--font-read', display: 'swap' });

export const metadata: Metadata = {
  title: 'Akili — AI study copilot for African students',
  description: 'Upload your notes or import past questions. Akili builds lessons, quizzes and mock exams for your level.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#16204A',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${ui.variable} ${read.variable}`}>
      <body>
        <Toaster
          position="top-center"
          containerStyle={{ top: 'calc(env(safe-area-inset-top) + 8px)' }}
          toastOptions={{ style: { background: '#16204A', color: '#fff', fontSize: '14px', borderRadius: '12px' }, duration: 3500 }}
        />
        {children}
      </body>
    </html>
  );
}
