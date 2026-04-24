import { notFound } from "next/navigation";

export default function ClienteCrmPreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (process.env.NEXT_PUBLIC_ENABLE_PREVIEW_PAGES !== "true") {
    notFound();
  }

  return <>{children}</>;
}
