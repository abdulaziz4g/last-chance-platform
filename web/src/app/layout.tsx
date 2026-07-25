import type { Metadata } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/toast';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    // Pages set their own; this frames them without each repeating the brand.
    default: 'Last Chance — hourly stays and flash deals',
    template: '%s · Last Chance',
  },
  description:
    'Book hotel rooms and apartments by the hour across Saudi Arabia, or claim a flash deal before it expires.',
  applicationName: 'Last Chance',
  openGraph: {
    type: 'website',
    siteName: 'Last Chance',
    locale: 'en',
  },
  twitter: { card: 'summary_large_image' },
  formatDetection: { telephone: false },
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
      <body className="font-sans">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
