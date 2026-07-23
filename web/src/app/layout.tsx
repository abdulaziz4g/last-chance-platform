import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Last Chance — Console',
  description: 'Host & operations dashboards for the Last Chance platform',
};

/** Applies the persisted theme before first paint — never a white flash. */
const themeInit = `
try {
  var t = localStorage.getItem('lc-theme');
  if (t !== 'light') document.documentElement.classList.add('dark');
} catch (e) { document.documentElement.classList.add('dark'); }
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
