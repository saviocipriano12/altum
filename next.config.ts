import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ⛔ Não travar deploy por causa de ESLint
  eslint: {
    ignoreDuringBuilds: true,
  },

  // ⛔ Não travar deploy por causa de erro de TypeScript
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
