import type { Metadata } from 'next';
import { Cormorant_Garamond, Poppins, Tajawal } from 'next/font/google';
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

/**
 * The design package's three families, SELF-HOSTED.
 *
 * next/font downloads these at BUILD time and serves them from our own
 * origin. The alternative — a <link> to fonts.googleapis.com — hands every
 * visitor's IP to a third party and puts a render-blocking request to another
 * host in front of first paint. The weights are the package's recommended
 * scale: 400 body, 500 labels, 600 buttons, 700 key numbers.
 */
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-cormorant',
  display: 'swap',
});

/**
 * Arabic gets its own family because Poppins and Cormorant ship no Arabic
 * glyphs — an Arabic string in either renders as tofu or is silently swapped
 * for a system face, which is the failure nobody catches until a native
 * reader opens the page.
 */
const tajawal = Tajawal({
  subsets: ['arabic'],
  weight: ['400', '500', '700'],
  variable: '--font-tajawal',
  display: 'swap',
});

/**
 * Applies the persisted theme before first paint — never a flash.
 *
 * DEFAULTS TO LIGHT. It used to default to dark, which put the whole site in
 * an appearance the design package explicitly rules out — "not a dark luxury
 * brand" — and left web and mobile looking like different products on first
 * visit. Dark remains available as an explicit choice; it is no longer what a
 * new visitor gets.
 */
const themeInit = `
try {
  if (localStorage.getItem('lc-theme') === 'dark') {
    document.documentElement.classList.add('dark');
  }
} catch (e) {}
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${poppins.variable} ${cormorant.variable} ${tajawal.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="font-sans">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
