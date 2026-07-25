import type { NextConfig } from 'next';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle for the Docker image (COPY .next/standalone).
  output: 'standalone',

  async rewrites() {
    return [
      // Unit photos live on the API's storage, but the browser only knows this
      // origin. Proxying keeps the stored URLs relative — so moving uploads to
      // a CDN later is a config change, not a data migration — and keeps
      // next/image treating them as same-origin.
      { source: '/media/:path*', destination: `${BACKEND_URL}/media/:path*` },
    ];
  },
};

export default nextConfig;
