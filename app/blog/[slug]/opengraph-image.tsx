import { ImageResponse } from "next/og";
import { getBlogPostBySlug } from "@/lib/blog";

export const runtime = "nodejs";
export const contentType = "image/png";
export const size = {
  width: 1200,
  height: 630,
};

type OgImageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function OpenGraphImage({ params }: OgImageProps) {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);

  const title = post?.meta.title ?? "Blog ALTUM";
  const category = post?.meta.category ?? "blog";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background:
            "radial-gradient(circle at 20% 20%, rgba(245,110,15,0.35), transparent 45%), linear-gradient(135deg, #0b0b0b 0%, #171717 55%, #1f1f1f 100%)",
          color: "#ffffff",
          padding: "56px",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            fontSize: 30,
            letterSpacing: 1.5,
            fontWeight: 700,
          }}
        >
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: "9999px",
              backgroundColor: "#F56E0F",
            }}
          />
          ALTUM
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
          <div
            style={{
              display: "inline-flex",
              alignSelf: "flex-start",
              border: "1px solid rgba(245,110,15,0.45)",
              borderRadius: 9999,
              padding: "10px 18px",
              fontSize: 24,
              textTransform: "uppercase",
              color: "#F56E0F",
              letterSpacing: 1.4,
            }}
          >
            {category}
          </div>
          <div
            style={{
              fontSize: 62,
              lineHeight: 1.1,
              fontWeight: 700,
              maxWidth: 1040,
              textWrap: "balance",
            }}
          >
            {title}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 28,
            color: "rgba(255,255,255,0.82)",
          }}
        >
          <div>Engenharia de vendas com IA</div>
          <div>altumia.com.br</div>
        </div>
      </div>
    ),
    size,
  );
}
