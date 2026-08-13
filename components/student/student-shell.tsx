"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import {
  LuBell,
  LuBookHeart,
  LuBookOpen,
  LuHeart,
  LuHouse,
  LuLogOut,
  LuMenu,
  LuSearch,
  LuShoppingBag,
  LuUserRound,
  LuX,
} from "react-icons/lu";
import { Brand } from "@/components/ui/brand";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { cn, formatDate, initials } from "@/lib/utils";
import { useLibrary } from "@/components/student/library-provider";

const navItems = [
  { href: "/library", label: "Discover", icon: LuHouse },
  { href: "/library#catalog", label: "Book catalogue", icon: LuBookOpen },
  { href: "/basket", label: "Borrow basket", icon: LuShoppingBag, badge: true },
  { href: "/loans", label: "My loans", icon: LuBookHeart },
  { href: "/saved", label: "Saved books", icon: LuHeart },
  { href: "/profile", label: "My profile", icon: LuUserRound },
];

export function StudentShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { basket, profile, isDemo, loading, settings, notifications, markNotificationRead } = useLibrary();
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const unreadNotifications = notifications.filter((item) => !item.readAt);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    router.push("/library?query=" + encodeURIComponent(query));
    setMenuOpen(false);
  };

  const signOut = async () => {
    const supabase = getSupabaseBrowserClient();
    if (supabase && !isDemo) await supabase.auth.signOut();
    router.push("/sign-in");
    router.refresh();
  };

  const activeFor = (href: string) => {
    if (href.includes("#")) return false;
    const route = href.split("#")[0];
    if (route === "/library") return pathname === "/library";
    return pathname.startsWith(route);
  };

  if (loading) {
    return <div className="app-loading" role="status"><Brand /><span className="app-loading__mark"><i /><i /><i /></span><strong>Opening your library</strong><p>Fetching your books, loans, and account securely…</p></div>;
  }

  return (
    <div className="student-app">
      <aside className={cn("student-sidebar", menuOpen && "student-sidebar--open")}>
        <div className="student-sidebar__top">
          <Brand />
          <button className="icon-button student-sidebar__close" onClick={() => setMenuOpen(false)} aria-label="Close navigation"><LuX /></button>
        </div>

        <nav className="student-nav" aria-label="Student navigation">
          <span className="nav-label">MY LIBRARY</span>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.label} href={item.href} className={cn("student-nav__item", activeFor(item.href) && "is-active")} onClick={() => setMenuOpen(false)}>
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
                {item.badge && basket.length > 0 && <b>{basket.length}</b>}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-help-card">
          <span aria-hidden="true">?</span>
          <strong>Need help?</strong>
          <p>Ask a librarian or review borrowing rules.</p>
          <a href={"mailto:" + settings.supportEmail}>Contact library</a>
        </div>

        <button className="student-logout" onClick={signOut} type="button"><LuLogOut aria-hidden="true" /><span>Sign out</span></button>
      </aside>

      {menuOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}

      <div className="student-main">
        <header className="student-header">
          <button className="icon-button mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><LuMenu /></button>
          <form className="global-search" onSubmit={submitSearch}>
            <LuSearch aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by title, author, ISBN…" aria-label="Search the library" />
          </form>
          <div className="student-header__actions">
            <Link href="/basket" className="header-basket" aria-label={basket.length + " books in borrow basket"}>
              <LuShoppingBag aria-hidden="true" />
              {basket.length > 0 && <span>{basket.length}</span>}
            </Link>
            <button className="icon-button notification-button" aria-label={unreadNotifications.length + " unread notifications"} aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen((value) => !value)}><LuBell />{unreadNotifications.length > 0 && <span />}</button>
            {notificationsOpen && <div className="notification-popover">
              <div><span>NOTIFICATIONS</span><strong>{unreadNotifications.length ? unreadNotifications.length + " unread" : "You’re all caught up"}</strong></div>
              {notifications.length ? <div className="notification-popover__list">{notifications.slice(0, 6).map((item) => <button key={item.id} className={item.readAt ? "" : "is-unread"} onClick={() => void markNotificationRead(item.id)}><i /><p><strong>{item.title}</strong><span>{item.body}</span><small>{formatDate(item.createdAt, { weekday: "short" })}</small></p></button>)}</div> : <p className="notification-popover__empty">Loan confirmations and return reminders will appear here.</p>}
              {unreadNotifications.length > 0 && <button className="notification-popover__mark" onClick={() => void Promise.all(unreadNotifications.map((item) => markNotificationRead(item.id)))}>Mark all as read</button>}
            </div>}
            <Link href="/profile" className="profile-chip" aria-label="Open student profile">
              <span className="avatar">{initials(profile.fullName)}</span>
              <span className="profile-chip__copy">
                <strong>{profile.fullName}</strong>
                <small title={profile.indexNumber}>{profile.studentEmail || profile.email}</small>
              </span>
            </Link>
          </div>
        </header>

        <main className="student-content">{children}</main>
      </div>

      <nav className="student-bottom-nav" aria-label="Mobile student navigation">
        {[
          { href: "/library", label: "Home", icon: LuHouse },
          { href: "/saved", label: "Saved", icon: LuHeart },
          { href: "/basket", label: "Basket", icon: LuShoppingBag, badge: basket.length },
          { href: "/loans", label: "Loans", icon: LuBookHeart },
          { href: "/profile", label: "Profile", icon: LuUserRound },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className={cn(activeFor(item.href) && "is-active")}>
              <span><Icon aria-hidden="true" />{item.badge ? <b>{item.badge}</b> : null}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
