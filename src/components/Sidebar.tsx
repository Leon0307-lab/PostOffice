"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { NavItem } from "@/lib/permissions";

interface Props {
  items: NavItem[];
  userName: string;
  roleLabel: string;
  unread: number;
  signOut: () => Promise<void>;
}

export default function Sidebar({ items, userName, roleLabel, unread, signOut }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/shipments") return pathname === "/shipments" || /^\/shipments\/(?!new)/.test(pathname);
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const nav = (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Hauptnavigation">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setOpen(false)}
          aria-current={isActive(item.href) ? "page" : undefined}
          className={`flex min-h-[44px] items-center justify-between rounded-lg px-3 text-sm font-semibold transition-colors ${
            isActive(item.href)
              ? "bg-brand-yellow text-brand-anthracite"
              : "text-gray-200 hover:bg-brand-anthracite-soft"
          }`}
        >
          <span>{item.label}</span>
          {item.href === "/notifications" && unread > 0 && (
            <span className="rounded-full bg-bad px-2 py-0.5 text-xs text-white">{unread}</span>
          )}
        </Link>
      ))}
    </nav>
  );

  return (
    <>
      {/* Mobile Kopfleiste */}
      <header className="no-print sticky top-0 z-30 flex items-center justify-between bg-brand-anthracite px-4 py-2 text-white lg:hidden">
        <Link href="/dashboard" className="text-lg font-extrabold">
          <span className="text-brand-yellow">Post</span>Office
        </Link>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          className="btn-secondary !min-h-[44px] !bg-brand-anthracite-soft !text-white !border-transparent"
        >
          {open ? "Schließen" : "Menü"}
          {unread > 0 && !open && (
            <span className="rounded-full bg-bad px-2 py-0.5 text-xs">{unread}</span>
          )}
        </button>
      </header>

      {open && (
        <div
          id="mobile-nav"
          className="no-print fixed inset-0 top-[57px] z-20 flex flex-col bg-brand-anthracite text-white lg:hidden"
        >
          {nav}
          <div className="border-t border-brand-anthracite-soft p-4">
            <p className="text-sm font-semibold">{userName}</p>
            <p className="mb-3 text-xs text-gray-400">{roleLabel}</p>
            <form action={signOut}>
              <button type="submit" className="btn-primary w-full">
                Abmelden
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Desktop/iPad-Seitenleiste */}
      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-brand-anthracite text-white lg:flex">
        <div className="px-5 py-5">
          <Link href="/dashboard" className="text-2xl font-extrabold tracking-tight">
            <span className="text-brand-yellow">Post</span>Office
          </Link>
          <div className="mt-2 h-1 w-12 rounded bg-brand-yellow" />
        </div>
        {nav}
        <div className="border-t border-brand-anthracite-soft p-4">
          <p className="truncate text-sm font-semibold">{userName}</p>
          <p className="mb-3 text-xs text-gray-400">{roleLabel}</p>
          <form action={signOut}>
            <button type="submit" className="btn w-full bg-brand-anthracite-soft text-white hover:bg-gray-600">
              Abmelden
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
