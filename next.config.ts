const projectRoot = process.cwd().replaceAll("\\", "/");

const nextConfig = {
  poweredByHeader: false,
  turbopack: {
    root: projectRoot,
  },
  outputFileTracingIncludes: {
    "/api/internal/jobs/chat-outbound/process": ["./node_modules/ffmpeg-static/ffmpeg*"],
    "/api/tenant/*/chats/*/send-media": ["./node_modules/ffmpeg-static/ffmpeg*"],
    "/api/tenant/*/chats/*/send-stored-media": ["./node_modules/ffmpeg-static/ffmpeg*"],
    "/api/tenant/*/chats/*/messages/*/media": ["./node_modules/ffmpeg-static/ffmpeg*"],
  },
  async headers() {
    const isDev = process.env.NODE_ENV !== "production";
    const scriptSrc = isDev
      ? "'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://connect.facebook.net https://cdn.jsdelivr.net https://apis.google.com https://accounts.google.com"
      : "'self' 'unsafe-inline' https://www.googletagmanager.com https://connect.facebook.net https://cdn.jsdelivr.net https://apis.google.com https://accounts.google.com";

    return [
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
              "connect-src 'self' https://graph.facebook.com https://www.google-analytics.com https://region1.google-analytics.com https://www.googleapis.com https://*.googleapis.com https://accounts.google.com https://googleads.googleapis.com https://api.openai.com https://*.firebaseio.com https://*.firebasedatabase.app https://*.firebaseapp.com https://typebot.io https://*.typebot.io; " +
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
