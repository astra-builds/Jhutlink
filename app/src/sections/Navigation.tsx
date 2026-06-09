import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { timeAgo } from '../utils/formatting';
import { scrollToSection } from '../hooks/useSmoothScroll';

const navLinks = [
  { label: 'Platform', target: '#problem' },
  { label: 'Marketplace', target: '#marketplace' },
  { label: 'Trust', target: '#escrow' },
  { label: 'Logistics', target: '#logistics' },
  { label: 'Analytics', target: '#analytics' },
];

export default function Navigation() {
  const { user } = useAuth();

  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [notifDropdown, setNotifDropdown] = useState(false);
  const [recentNotifs, setRecentNotifs] = useState<any[]>([]);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 100);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!user) { setNotifCount(0); return; }
    const fetchCount = async () => {
      try {
        const { unread } = await api.notifications.getCount();
        setNotifCount(unread);
      } catch { setNotifCount(0); }
    };
    fetchCount();
    const id = setInterval(fetchCount, 30000);
    return () => clearInterval(id);
  }, [user]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const openNotifDropdown = async () => {
    if (!user) return;
    setNotifDropdown(!notifDropdown);
    if (!notifDropdown) {
      try {
        const notifs = await api.notifications.list("unread");
        setRecentNotifs(notifs.slice(0, 5));
      } catch { setRecentNotifs([]); }
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.notifications.markAllRead();
      setNotifCount(0);
      setRecentNotifs([]);
      setNotifDropdown(false);
    } catch { /* ignore */ }
  };

  const handleNav = (target: string) => {
    setMenuOpen(false);
    scrollToSection(target);
  };

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-[1000] h-16 flex items-center justify-between transition-all duration-350 border-b ${
          scrolled ? 'bg-void/75 backdrop-blur-md border-white/5 shadow-lg' : 'bg-transparent border-transparent'
        }`}
        style={{ padding: '0 clamp(1rem, 4vw, 3rem)' }}
      >
        {/* Brand */}
        <Link to="/" className="flex items-center gap-1.5 group">
          <span className="font-display text-xl font-semibold text-text-primary tracking-tight transition-colors duration-300 group-hover:text-cyan" style={{ fontFamily: '"Clash Display", system-ui' }}>
            jhutlink
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald transition-transform duration-300 group-hover:scale-125" />
        </Link>

        {/* Desktop Nav Links */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <button
              key={link.label}
              onClick={() => handleNav(link.target)}
              className="text-sm text-text-primary hover:text-cyan transition-colors duration-300 bg-transparent border-none cursor-pointer"
            >
              {link.label}
            </button>
          ))}
        </div>

        {/* Right CTAs */}
        <div className="flex items-center gap-3">
          {user && (
            <div ref={notifRef} className="relative">
              <button
                onClick={openNotifDropdown}
                className="relative p-2 bg-transparent border-none cursor-pointer text-text-secondary hover:text-cyan transition-colors"
                aria-label="Notifications"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 01-3.46 0" />
                </svg>
                {notifCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[0.55rem] font-bold rounded-full flex items-center justify-center">
                    {notifCount > 9 ? "9+" : notifCount}
                  </span>
                )}
              </button>
              {notifDropdown && (
                <div className="absolute right-0 top-full mt-2 w-80 glass-card p-3 z-50 border border-white/[0.08]">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-text-primary">Notifications</span>
                    <div className="flex gap-2">
                      {notifCount > 0 && (
                        <button onClick={handleMarkAllRead} className="text-[0.6rem] text-cyan hover:underline bg-transparent border-none cursor-pointer">
                          Mark all read
                        </button>
                      )}
                    </div>
                  </div>
                  {recentNotifs.length === 0 ? (
                    <p className="text-xs text-text-tertiary text-center py-3">No new notifications</p>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {recentNotifs.map((n: any) => (
                        <div key={n.notification_id} className="border-b border-white/[0.04] pb-2 last:border-0">
                          <p className="text-xs font-medium text-text-primary">{n.title}</p>
                          <p className="text-[0.65rem] text-text-tertiary line-clamp-2">{n.body}</p>
                          <p className="text-[0.55rem] text-text-tertiary mt-0.5">{timeAgo(n.created_at)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <Link
                    to="/notifications"
                    onClick={() => setNotifDropdown(false)}
                    className="block text-center text-[0.6rem] text-cyan hover:underline mt-2 pt-2 border-t border-white/[0.04]"
                  >
                    View all notifications
                  </Link>
                </div>
              )}
            </div>
          )}
          <Link
            to="/demo"
            className="hidden sm:block text-sm text-text-tertiary hover:text-cyan transition-colors duration-300"
          >
            Demo
          </Link>
          {user ? (
            <Link
              to={user.role === 'buyer' ? '/dashboard/buyer' : '/dashboard/seller'}
              className="hidden sm:block text-sm font-medium text-cyan hover:text-cyan/80 transition-colors duration-300"
            >
              Dashboard
            </Link>
          ) : (
            <Link
              to="/auth"
              className="hidden sm:block text-sm text-text-secondary hover:text-text-primary transition-colors duration-300"
            >
              Sign In
            </Link>
          )}
          <Link
            to="/auth"
            className="text-sm font-medium bg-gradient-to-r from-emerald to-cyan text-void px-5 py-2.5 rounded-full hover:shadow-lg transition-all duration-300 hover:scale-[1.01] hover:brightness-110 active:scale-[0.99]"
          >
            Get Started
          </Link>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden flex flex-col gap-1 p-2 bg-transparent border-none cursor-pointer"
            aria-label="Toggle menu"
          >
            <span className={`w-5 h-px bg-text-primary transition-all duration-300 ${menuOpen ? 'rotate-45 translate-y-[3px]' : ''}`} />
            <span className={`w-5 h-px bg-text-primary transition-all duration-300 ${menuOpen ? '-rotate-45 -translate-y-[3px]' : ''}`} />
          </button>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-[999] bg-void/95 backdrop-blur-2xl flex flex-col items-center justify-center gap-8 md:hidden"
          onClick={() => setMenuOpen(false)}
        >
          {navLinks.map((link, i) => (
            <button
              key={link.label}
              onClick={() => handleNav(link.target)}
              className="text-h2 text-text-primary hover:text-cyan transition-colors duration-300 bg-transparent border-none cursor-pointer"
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              {link.label}
            </button>
          ))}
          <Link
            to="/auth"
            className="text-h2 text-cyan hover:text-cyan/80 transition-colors duration-300"
            onClick={() => setMenuOpen(false)}
          >
            {user ? 'Dashboard' : 'Sign In'}
          </Link>
        </div>
      )}
    </>
  );
}
