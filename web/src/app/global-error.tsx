'use client';

import { useEffect } from 'react';

/**
 * Last line of defence: this replaces the root layout, so it cannot rely on
 * anything the layout provides — no ToastProvider, no theme script, and no
 * guarantee the stylesheet applied. Styling is therefore inline and the markup
 * is deliberately dumb.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[lc] root layout error', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          padding: '2rem 1.5rem',
          textAlign: 'center',
          background: '#0a0a0c',
          color: '#e4e4e7',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <p
          style={{
            fontSize: '13px',
            fontWeight: 600,
            letterSpacing: '0.32em',
            margin: 0,
          }}
        >
          LAST&nbsp;CHANCE
        </p>
        <h1 style={{ fontSize: '18px', fontWeight: 600, margin: '0.5rem 0 0' }}>
          The console failed to start
        </h1>
        <p
          style={{
            fontSize: '14px',
            lineHeight: 1.6,
            color: '#a1a1aa',
            maxWidth: '28rem',
            margin: 0,
          }}
        >
          Something went wrong before the page could render. Reloading usually
          clears it.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: '0.75rem',
            padding: '0.65rem 1.35rem',
            fontSize: '14px',
            fontWeight: 500,
            color: '#fff',
            background: '#96764e',
            border: 0,
            borderRadius: '0.5rem',
            cursor: 'pointer',
          }}
        >
          Reload
        </button>
        {error.digest && (
          <p
            style={{
              marginTop: '1.5rem',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: '11px',
              color: '#52525b',
            }}
          >
            Reference: {error.digest}
          </p>
        )}
      </body>
    </html>
  );
}
