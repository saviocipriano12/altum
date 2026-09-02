export function HomeStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
          @keyframes altumPulse {
            0%, 100% { opacity: .35; transform: scale(1); }
            50% { opacity: .85; transform: scale(1.04); }
          }

          @keyframes altumFloat {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-10px); }
          }

          @keyframes altumFloatSlow {
            0%, 100% { transform: translate3d(0, 0, 0); }
            50% { transform: translate3d(0, 12px, 0); }
          }

          @keyframes altumGridDrift {
            0% { background-position: 0 0, 0 0; }
            100% { background-position: 58px 0, 0 58px; }
          }

          @keyframes altumSheen {
            0% { transform: translateX(-120%) skewX(-18deg); opacity: 0; }
            20% { opacity: .16; }
            55% { opacity: .08; }
            100% { transform: translateX(220%) skewX(-18deg); opacity: 0; }
          }

          .altum-display {
            font-family: var(--font-altum-display), var(--font-altum-body), sans-serif;
          }

          .altum-pulse {
            animation: altumPulse 4.5s ease-in-out infinite;
          }

          .altum-float {
            animation: altumFloat 5.5s ease-in-out infinite;
          }

          .altum-float-slow {
            animation: altumFloatSlow 7.5s ease-in-out infinite;
          }

          .altum-grid-drift {
            animation: altumGridDrift 22s linear infinite;
          }

          .altum-sheen::before {
            content: "";
            position: absolute;
            inset: 0;
            width: 42%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent);
            filter: blur(12px);
            animation: altumSheen 8s ease-in-out infinite;
          }

          @media (prefers-reduced-motion: reduce) {
            .altum-pulse,
            .altum-float,
            .altum-float-slow,
            .altum-grid-drift,
            .altum-sheen::before {
              animation: none !important;
              opacity: 1 !important;
              transform: none !important;
            }
          }
        `,
      }}
    />
  );
}
