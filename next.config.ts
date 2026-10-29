import type { NextConfig } from "next";
import { InboxQaWatchPlugin, extendInboxQaWatchIgnore } from "./scripts/inbox-qa-watch-plugin.mjs";

const projectRoot = process.cwd().replaceAll("\\", "/");
const localQa = process.env.ALTUM_QA_EMULATORS === "1";
if (localQa && (process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== "demo-altum-qa-lab")) {
  throw new Error("QA server requires development and the isolated demo project.");
}

const nextConfig = {
  ...(localQa ? {
    webpack(config: Parameters<NonNullable<NextConfig["webpack"]>>[0]) {
      config.watchOptions = { ...config.watchOptions,
        ignored: extendInboxQaWatchIgnore(config.watchOptions?.ignored, process.cwd()) };
      if (process.env.ALTUM_QA_TRACE_WATCH === "1") config.plugins.push(new InboxQaWatchPlugin(process.cwd()));
      return config;
    },
  } : {}),
  ...(localQa ? { distDir: ".qa-artifacts/next-inbox" } : {}),
  poweredByHeader: false,
  // The native binary resolves relative to its installed package. Bundling it
  // rewrites __dirname to /ROOT and breaks audio conversion on the local host.
  serverExternalPackages: ["ffmpeg-static"],
  // O servidor de desenvolvimento gera tipos em .next/dev enquanto esta
  // aberto. Builds de producao usam o contrato isolado para nao consumir um
  // arquivo parcialmente escrito pelo dev server.
  typescript: {
    tsconfigPath: localQa ? "tsconfig.inbox-qa.json" : process.env.NODE_ENV === "production" ? "tsconfig.release.json" : "tsconfig.json",
  },
  turbopack: {
    root: projectRoot,
  },
  outputFileTracingIncludes: {
    "/api/internal/jobs/ai/process": ["./node_modules/ffmpeg-static/ffmpeg*"],
    "/api/internal/jobs/chat-outbound/process": ["./node_modules/ffmpeg-static/ffmpeg*"],
    "/api/webhooks/meta": ["./node_modules/ffmpeg-static/ffmpeg*"],
    "/api/webhooks/whatsapp": ["./node_modules/ffmpeg-static/ffmpeg*"],
    "/api/tenant/*/ai-voice/preview": ["./node_modules/ffmpeg-static/ffmpeg*"],
    "/api/tenant/*/chats/*/ai-state": ["./node_modules/ffmpeg-static/ffmpeg*"],
    "/api/tenant/*/chats/*/send-media": ["./node_modules/ffmpeg-static/ffmpeg*"],
    "/api/tenant/*/chats/*/send-stored-media": ["./node_modules/ffmpeg-static/ffmpeg*"],
    "/api/tenant/*/chats/*/messages/*/media": ["./node_modules/ffmpeg-static/ffmpeg*"],
  },
  async redirects() {
    return [
      {
        source: "/chatbot-para-empresas",
        destination: "/chatbot-whatsapp",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.altumia.com.br" }],
        destination: "https://altumia.com.br/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    const isDev = process.env.NODE_ENV !== "production";
    const qaConnect = localQa && isDev ? " http://127.0.0.1:9099 http://127.0.0.1:8080 http://127.0.0.1:9199" : "";
    const scriptSrc = isDev
      ? "'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://connect.facebook.net https://cdn.jsdelivr.net https://apis.google.com https://accounts.google.com"
      : "'self' 'unsafe-inline' https://www.googletagmanager.com https://connect.facebook.net https://cdn.jsdelivr.net https://apis.google.com https://accounts.google.com";

    return [
      {
        source: "/covers/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }],
      },
      {
        source: "/images/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=86400" }],
      },
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Content-Type", value: "application/javascript; charset=utf-8" }],
      },
      { source: "/site.webmanifest", headers: [{ key: "Cache-Control", value: "no-cache" }] },
      {
        source: "/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      },
      {
        source: "/cliente/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, nosnippet" }],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Origin-Agent-Cluster", value: "?1" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value:
              'camera=(self "https://meet.jit.si"), microphone=(self "https://meet.jit.si"), display-capture=(self "https://meet.jit.si"), geolocation=()',
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; " +
              `script-src ${scriptSrc}; ` +
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
              "img-src 'self' data: blob: https://images.unsplash.com https://www.facebook.com https://*.facebook.com https://*.fbcdn.net https://*.cdninstagram.com https://lookaside.fbsbx.com https://platform-lookaside.fbsbx.com https://www.google.com https://*.googleusercontent.com https://firebasestorage.googleapis.com https://storage.googleapis.com https://grainy-gradients.vercel.app; " +
              "media-src 'self' data: blob: https://*.fbcdn.net https://*.cdninstagram.com https://firebasestorage.googleapis.com https://storage.googleapis.com; " +
              "font-src 'self' https://fonts.gstatic.com data:; " +
              "connect-src 'self' https://graph.facebook.com https://www.google-analytics.com https://*.google-analytics.com https://www.googleapis.com https://*.googleapis.com https://accounts.google.com https://googleads.googleapis.com https://api.openai.com https://*.firebaseio.com https://*.firebasedatabase.app https://*.firebaseapp.com https://typebot.io https://*.typebot.io" + qaConnect + "; " +
              "frame-src 'self' https://meet.jit.si https://*.firebaseapp.com https://*.google.com https://accounts.google.com https://typebot.io https://*.typebot.io; " +
              "frame-ancestors 'none'; " +
              "base-uri 'self'; " +
              "form-action 'self'",
          },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "*.cdninstagram.com",
      },
      {
        protocol: "https",
        hostname: "*.fbcdn.net",
      },
      {
        protocol: "https",
        hostname: "lookaside.fbsbx.com",
      },
      {
        protocol: "https",
        hostname: "platform-lookaside.fbsbx.com",
      },
      {
        protocol: "https",
        hostname: "*.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
      },
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
      },
    ],
  },
} as const;

export default nextConfig;
