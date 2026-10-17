import Image from "next/image";
import styles from "@/components/public/public-site.module.css";
type PostHeroProps = {
  title: string;
  description: string;
  coverImage: string;
  category: string;
  date: string;
  readingTime: string;
  author: string;
};
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
export default function PostHero({
  title,
  description,
  coverImage,
  category,
  date,
  readingTime,
  author,
}: PostHeroProps) {
  return (
    <header className={styles.articleHero}>
      <p className={styles.eyebrow}>{category}</p>
      <h1>{title}</h1>
      <p className={styles.heroDescription}>{description}</p>
      <div className={styles.articleMeta}>
        <span>Por {author}</span>
        <time dateTime={date}>{formatDate(date)}</time>
        <span>{readingTime}</span>
      </div>
      <Image
        src={coverImage}
        alt={title}
        width={1600}
        height={900}
        sizes="(min-width: 1100px) 1050px, 94vw"
        preload
      />
    </header>
  );
}
