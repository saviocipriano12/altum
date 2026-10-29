import Link from "next/link";
import { buildBreadcrumbSchema, toJsonLdScript } from "@/lib/schema";
import styles from "../public-site.module.css";

export type PublicCrumb = { name: string; href: string };
export function PublicBreadcrumbs({
  items,
}: {
  items: readonly PublicCrumb[];
}) {
  return (
    <>
      <nav className={styles.breadcrumbs} aria-label="Você está aqui">
        <ol>
          {items.map((item, index) => (
            <li key={item.href}>
              {index < items.length - 1 ? (
                <Link href={item.href}>{item.name}</Link>
              ) : (
                <span aria-current="page">{item.name}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={toJsonLdScript(buildBreadcrumbSchema(items))}
      />
    </>
  );
}
