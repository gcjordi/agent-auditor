import "./globals.css";

import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  description:
    "Behavioral security auditing for AI agents in a side-effect-free simulation environment.",
  title: {
    default: "Agent Auditor",
    template: "%s | Agent Auditor",
  },
};

const navigation = [
  { href: "/", label: "Home" },
  { href: "/audits/demo", label: "Demo audit" },
] as const;

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <a
          className="fixed left-4 top-3 z-50 -translate-y-24 rounded-md bg-[var(--surface)] px-4 py-2 font-semibold text-[var(--accent)] shadow-lg transition-transform focus:translate-y-0"
          href="#main-content"
        >
          Skip to main content
        </a>
        <header className="border-b bg-[color-mix(in_srgb,var(--surface)_90%,transparent)] backdrop-blur">
          <div className="shell-width flex min-h-18 flex-wrap items-center justify-between gap-4 py-3">
            <Link className="flex items-center gap-3 no-underline" href="/">
              <span
                aria-hidden="true"
                className="grid size-9 place-items-center rounded-lg bg-[var(--accent)] font-black text-white"
              >
                A
              </span>
              <span>
                <span className="block text-base font-bold tracking-tight">Agent Auditor</span>
                <span className="block text-xs text-[var(--text-muted)]">
                  Behavioral security workspace
                </span>
              </span>
            </Link>
            <nav aria-label="Primary navigation">
              <ul className="flex items-center gap-1">
                {navigation.map((item) => (
                  <li key={item.href}>
                    <Link
                      className="rounded-md px-3 py-2 text-sm font-semibold text-[var(--text-muted)] no-underline hover:bg-[var(--surface-strong)] hover:text-[var(--text)]"
                      href={item.href}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </header>
        <main className="shell-width flex-1 py-10" id="main-content">
          {children}
        </main>
        <footer className="mt-14 border-t py-6 text-sm text-[var(--text-muted)]">
          <div className="shell-width flex flex-wrap justify-between gap-3">
            <p>Deterministic, keyless, side-effect-free Demo Mode.</p>
            <p>Apache-2.0 · Copyright 2026 Jordi Garcia Castillón</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
