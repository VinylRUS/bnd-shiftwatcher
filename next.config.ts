import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Автономная сборка (.next/standalone) — то, что запускает Docker
  // (см. Dockerfile и docker-compose.yml).
  output: "standalone",
  images: { unoptimized: true },
  allowedDevOrigins: ["*.space-z.ai"],
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
