"use client";

import { useState } from "react";

type FAQItem = {
  q: string;
  a: string;
};

type FAQAccordionProps = {
  items: FAQItem[];
};

export default function FAQAccordion({ items }: FAQAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  if (!items || items.length === 0) return null;

  return (
    <section className="my-10 rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
      <h3 className="mb-4 text-xl font-semibold text-white">Perguntas frequentes</h3>
      <div className="space-y-3">
        {items.map((item, index) => {
          const isOpen = openIndex === index;

          return (
            <article key={`${item.q}-${index}`} className="overflow-hidden rounded-xl border border-white/10">
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : index)}
                className="flex w-full items-center justify-between gap-3 bg-black/20 px-4 py-3 text-left"
              >
                <span className="font-semibold text-white/90">{item.q}</span>
                <span className="text-[#F56E0F]">{isOpen ? "−" : "+"}</span>
              </button>
              {isOpen ? <div className="px-4 py-3 text-white/80">{item.a}</div> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
