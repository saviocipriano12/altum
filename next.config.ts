const nextConfig = {
  poweredByHeader: false,
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    const isDev = process.env.NODE_ENV !== "production";
    const scriptSrc = isDev
      ? "'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://connect.facebook.net"
      : "'self' 'unsafe-inline' https://www.googletagmanager.com https://connect.facebook.net";

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
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
              "img-src 'self' data: blob: https://images.unsplash.com https://www.facebook.com https://www.google.com; " +
              "font-src 'self' https://fonts.gstatic.com data:; " +
              "connect-src 'self' https://graph.facebook.com https://www.google-analytics.com https://region1.google-analytics.com https://www.googleapis.com https://*.googleapis.com https://googleads.googleapis.com https://api.openai.com https://*.firebaseio.com https://*.firebasedatabase.app https://*.firebaseapp.com; " +
              "frame-src 'self' https://*.firebaseapp.com https://*.google.com; " +
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
    ],
  },
} as const;

export default nextConfig;
