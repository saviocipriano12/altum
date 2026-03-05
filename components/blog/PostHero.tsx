import Image from "next/image";

type PostHeroProps = {
  title: string;
  description: string;
  coverImage: string;
  category: string;
  date: string;
  readingTime: string;
  author: string;
};

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
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
    <header className="mx-auto mb-12 w-full max-w-5xl">
      <div className="mb-6 overflow-hidden rounded-3xl border border-white/10">
        <Image
          src={coverImage}
          alt={title}
          width={1600}
          height={900}
          className="h-auto w-full object-cover"
          priority
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.12em] text-white/70">
        <span className="rounded-full border border-[#F56E0F]/50 bg-[#F56E0F]/10 px-3 py-1 font-semibold text-[#F56E0F]">
          {category}
        </span>
        <span>{formatDate(date)}</span>
        <span>{readingTime}</span>
        <span>por {author}</span>
      </div>

      <h1 className="mb-4 text-4xl font-bold leading-tight md:text-5xl">{title}</h1>
      <p className="max-w-3xl text-lg leading-8 text-white/80">{description}</p>
    </header>
  );
}
