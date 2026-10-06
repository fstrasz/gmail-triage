import type { ReactNode } from "react";
import { btnPrimary, input } from "../shell/ui.ts";

/** A titled settings card. Shared shell so every section looks the same. */
export function Card({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-rule bg-paper p-4 sm:p-5">
      <h2 className="title-hand mb-3 text-base font-semibold text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Standard label + control row. */
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex min-h-10 items-center justify-between gap-3 py-1 text-sm text-ink">
      <span>{label}</span>
      {children}
    </label>
  );
}

const INPUT = input;
export const inputClass = INPUT;
export const numberInputClass = `${INPUT} w-20 text-right`;

export const saveBtnClass = `mt-3 ${btnPrimary}`;
