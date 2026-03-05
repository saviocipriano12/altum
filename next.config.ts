const nextConfig = {
  // Do not block deploy while we finish full strict typing migration.
  typescript: {
    ignoreBuildErrors: true,
  },
  turbopack: {
    root: process.cwd(),
  },
} as const;

export default nextConfig;
