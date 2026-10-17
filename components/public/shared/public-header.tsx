"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import styles from "../public-site.module.css";
const navigation = [
  ["Plataforma", "/plataforma"],
  ["Soluções", "/solucoes"],
  ["Integrações", "/integracoes"],
  ["Planos", "/precos"],
  ["Conteúdos", "/blog"],
] as const;
export function PublicHeader() {
  const pathname = usePathname();
  const header = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);
  useEffect(() => {
    const update = () => {
      if (header.current)
        header.current.dataset.scrolled = String(window.scrollY > 32);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  const close = () => dialog.current?.close();
  const active = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);
  return (
    <header ref={header} className={styles.header}>
      <div className={styles.headerInner}>
        <Link
          prefetch={false}
          href="/"
          className={styles.brand}
          aria-label="Altum — página inicial"
        >
          <Image src="/logo-a.png" alt="" width={34} height={34} preload />
          <span>
            altum<span className={styles.brandDot}>.</span>
          </span>
        </Link>
        <nav className={styles.desktopNav} aria-label="Navegação principal">
          {navigation.map(([label, href]) => (
            <Link
              prefetch={false}
              key={href}
              href={href}
              aria-current={active(href) ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className={styles.headerActions}>
          <Link href="/cliente/login" prefetch={false} className={styles.login}>
            Entrar
          </Link>
          <Link
            prefetch={false}
            href="/contato?interest=demonstracao"
            className={`${styles.button} ${styles.headerCta}`}
          >
            Agendar demonstração{" "}
            <span>
              <ArrowRight size={16} />
            </span>
          </Link>
        </div>
        <button
          ref={toggle}
          className={styles.menuToggle}
          type="button"
          aria-label="Abrir menu"
          aria-expanded={open}
          aria-controls="menu-publico"
          onClick={() => {
            dialog.current?.showModal();
            setOpen(true);
          }}
        >
          <Menu size={22} />
        </button>
      </div>
      <dialog
        ref={dialog}
        id="menu-publico"
        className={styles.mobileMenu}
        aria-label="Menu de navegação"
        onClose={() => {
          setOpen(false);
          toggle.current?.focus();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className={styles.mobileMenuInner}>
          <div className={styles.mobileMenuTop}>
            <span className={styles.brand}>
              altum<span className={styles.brandDot}>.</span>
            </span>
            <button type="button" onClick={close} aria-label="Fechar menu">
              <X size={22} />
            </button>
          </div>
          <nav aria-label="Navegação móvel">
            {navigation.map(([label, href]) => (
              <Link
                prefetch={false}
                key={href}
                href={href}
                onClick={close}
                aria-current={active(href) ? "page" : undefined}
              >
                {label}
                <ArrowRight size={19} />
              </Link>
            ))}
            <Link href="/sobre" prefetch={false} onClick={close}>
              Sobre a Altum
              <ArrowRight size={19} />
            </Link>
          </nav>
          <Link
            prefetch={false}
            href="/contato?interest=demonstracao"
            onClick={close}
            className={styles.button}
          >
            Agendar demonstração{" "}
            <span>
              <ArrowRight size={18} />
            </span>
          </Link>
          <Link
            prefetch={false}
            href="/cliente/login"
            onClick={close}
            className={styles.mobileLogin}
          >
            Entrar na minha conta
          </Link>
        </div>
      </dialog>
    </header>
  );
}
