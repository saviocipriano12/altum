"use client";
import Image from "next/image";
import { useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { publicPortfolio } from "@/data/public-portfolio";
import styles from "./public-site.module.css";
export function PublicPortfolio() {
  const [category, setCategory] = useState<string>(publicPortfolio[0].slug);
  const [index, setIndex] = useState(0);
  const current =
    publicPortfolio.find((item) => item.slug === category) ??
    publicPortfolio[0];
  const project = current.projects[index] ?? current.projects[0];
  const move = (direction: number) =>
    setIndex(
      (value) =>
        (value + direction + current.projects.length) % current.projects.length,
    );
  return (
    <section id="projetos" className={styles.section}>
      <div className={styles.container}>
        <div className={styles.blogFilters} aria-label="Categorias de projetos">
          {publicPortfolio.map((item) => (
            <button
              key={item.slug}
              aria-pressed={category === item.slug}
              type="button"
              onClick={() => {
                setCategory(item.slug);
                setIndex(0);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <article className={styles.blogFeatured}>
          <a
            href={project.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Abrir projeto ${project.name} em outra aba`}
          >
            <Image
              src={project.image}
              alt={`Página do projeto ${project.name}, com identidade visual e apresentação da oferta`}
              width={1000}
              height={700}
              sizes="(min-width: 768px) 600px, 94vw"
            />
          </a>
          <div>
            <p className={styles.eyebrow}>
              {project.badge} · {project.niche}
            </p>
            <h2>{project.name}</h2>
            <p>{project.description}</p>
            <div className={styles.actions} style={{ justifyContent: "start" }}>
              <a
                href={project.href}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.textLink}
              >
                Ver projeto <ArrowRight size={16} />
              </a>
            </div>
            <div className={styles.portfolioControls}>
              <button
                type="button"
                onClick={() => move(-1)}
                aria-label="Projeto anterior"
              >
                <ChevronLeft size={20} />
              </button>
              <span aria-live="polite">
                {index + 1} de {current.projects.length}
              </span>
              <button
                type="button"
                onClick={() => move(1)}
                aria-label="Próximo projeto"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        </article>
        <div className={styles.portfolioThumbs} aria-label="Selecionar projeto">
          {current.projects.map((item, i) => (
            <button
              key={item.name}
              type="button"
              aria-pressed={index === i}
              onClick={() => setIndex(i)}
            >
              <Image
                src={item.image}
                alt=""
                width={140}
                height={90}
                sizes="140px"
              />
              <span>{item.name}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
