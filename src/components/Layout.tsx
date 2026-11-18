import { NavLink, Outlet } from 'react-router-dom';
import { clsx } from 'clsx';
import { useEffect, useState } from 'react';
import { ArrowLeftRight, Compass, Gift, LayoutDashboard, Map, Moon, Plane, Settings as SettingsIcon, Sun, Luggage, Wallet, WifiOff } from 'lucide-react';
import { useOnline, useProfile } from '../lib/hooks';
import { getCard } from '../data/cards';
import { pts } from '../lib/format';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/explore', label: 'Explore Destinations', short: 'Explore', icon: Compass },
  { to: '/flights', label: 'Flights & Points', short: 'Flights', icon: Plane },
  { to: '/bonuses', label: 'Transfer Bonuses', short: 'Bonuses', icon: Gift },
  { to: '/trips', label: 'My Trips', short: 'Trips', icon: Luggage },
  { to: '/itinerary', label: 'Map & Itinerary', short: 'Map', icon: Map },
  { to: '/budget', label: 'Budget', icon: Wallet },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

const MOBILE = ['/', '/explore', '/flights', '/trips', '/itinerary'];

function useTheme(): [boolean, () => void] {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b1220' : '#0f766e');
  }, [dark]);
  return [
    dark,
    () => {
      setDark((d) => {
        try {
          localStorage.setItem('pp-theme', d ? 'light' : 'dark');
        } catch {
          /* private mode */
        }
        return !d;
      });
    },
  ];
}

export function Layout() {
  const online = useOnline();
  const profile = useProfile();
  const [dark, toggle] = useTheme();
  return (
    <div className="min-h-screen lg:pl-64">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[2000] focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 px-5 py-5">
          <Logo />
          <span className="text-lg font-semibold tracking-tight">PointPilot</span>
        </div>
        <nav className="flex-1 space-y-0.5 px-3" aria-label="Main">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
                  isActive ? 'bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
                )
              }
            >
              <n.icon className="h-4 w-4" aria-hidden />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="m-3 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800/60">
          <div className="text-slate-500 dark:text-slate-400">{getCard(profile.cardId).name}</div>
          <div className="tabular mt-0.5 text-lg font-semibold">{pts(profile.points)} pts</div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-slate-500">Free · local-first</span>
            <button onClick={toggle} className="rounded-md p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700" aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-900/90">
        <div className="flex items-center gap-2">
          <Logo />
          <span className="font-semibold">PointPilot</span>
        </div>
        <div className="flex items-center gap-1">
          <NavLink to="/bonuses" className="rounded-md p-2 text-slate-600 dark:text-slate-300" aria-label="Transfer bonuses"><Gift className="h-5 w-5" /></NavLink>
          <NavLink to="/budget" className="rounded-md p-2 text-slate-600 dark:text-slate-300" aria-label="Budget"><Wallet className="h-5 w-5" /></NavLink>
          <NavLink to="/settings" className="rounded-md p-2 text-slate-600 dark:text-slate-300" aria-label="Settings"><SettingsIcon className="h-5 w-5" /></NavLink>
          <button onClick={toggle} className="rounded-md p-2 text-slate-600 dark:text-slate-300" aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
            {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {!online && (
        <div className="sticky top-0 z-30 flex items-center gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950">
          <WifiOff className="h-4 w-4" /> You’re offline. Saved trips, calculators and comparisons still work; place search, routing, weather and exchange rates need a connection.
        </div>
      )}

      <main id="main" className="mx-auto max-w-7xl px-4 pb-28 pt-5 sm:px-6 lg:pb-12 lg:pt-8">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-24 text-xs text-slate-500 sm:px-6 lg:pb-8">
        PointPilot is an independent personal tool, not affiliated with JPMorgan Chase or any airline or hotel. Map data © OpenStreetMap contributors. Data you enter stays in this browser.
        <span className="ml-1 inline-flex items-center gap-1"><ArrowLeftRight className="h-3 w-3" />Export regularly from Settings.</span>
      </footer>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden dark:border-slate-800 dark:bg-slate-900" aria-label="Main mobile">
        {NAV.filter((n) => MOBILE.includes(n.to)).map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => clsx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-brand-700 dark:text-brand-300' : 'text-slate-500')}
          >
            <n.icon className="h-5 w-5" aria-hidden />
            {n.short ?? n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 64 64" className="h-7 w-7" aria-hidden>
      <rect width="64" height="64" rx="14" fill="#0f766e" />
      <path d="M14 38l36-16-8 22-8-6-6 8v-10l18-12-22 10z" fill="#fff" />
    </svg>
  );
}
