import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle for the Docker image (COPY .next/standalone).
  output: 'standalone',
};

export default nextConfig;
