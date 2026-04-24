import { notFound } from "next/navigation";

export default function PreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const previewEnabled =
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_ENABLE_PREVIEW_PAGES === "true";

  if (!previewEnabled) {
    notFound();
  }

  return <>{children}</>;
}
