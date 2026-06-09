import { useRef } from "react";
import { useScrollFade } from "@/hooks/useScrollReveal";

const footerLinks = {
  Platform: ['Marketplace', 'Auction Engine', 'Smart Matching', 'Escrow'],
  Company: ['About', 'Careers', 'Blog', 'Press'],
  Legal: ['Terms of Service', 'Privacy Policy', 'Seller Agreement', 'Buyer Agreement'],
};

function LinkedInIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function TwitterIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

export default function Footer() {
  const sectionRef = useRef<HTMLElement>(null);

  useScrollFade(sectionRef, [".footer-content"]);

  return (
    <footer ref={sectionRef} className="relative bg-base-elevated pt-16 pb-8 border-t border-white/[0.04]">
      <div className="footer-content max-w-[1280px] mx-auto px-6 md:px-12">
        {/* Main grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand column */}
          <div>
            <span className="font-display text-lg font-semibold text-text-primary" style={{ fontFamily: '"Clash Display", system-ui' }}>
              jhutlink
            </span>
            <p className="text-[0.8125rem] text-text-tertiary mt-3 max-w-[240px]" style={{ lineHeight: 1.6 }}>
              Transforming textile waste into trade across Bangladesh.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([header, links]) => (
            <div key={header}>
              <h3 className="text-[0.875rem] font-medium text-text-primary mb-4">{header}</h3>
              <ul className="flex flex-col gap-2.5">
                {links.map((link) => (
                  <li key={link}>
                    <span className="text-[0.8125rem] text-text-secondary hover:text-text-primary transition-colors duration-300 cursor-pointer">
                      {link}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="border-t border-white/[0.04] mt-12" />

        {/* Bottom row */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-8">
          <span className="text-[0.75rem] text-text-tertiary">
            2026 Jhutlink. All rights reserved.
          </span>
          <div className="flex items-center gap-4 text-text-tertiary">
            <span className="hover:text-text-secondary transition-colors duration-300 cursor-pointer">
              <LinkedInIcon />
            </span>
            <span className="hover:text-text-secondary transition-colors duration-300 cursor-pointer">
              <TwitterIcon />
            </span>
            <span className="hover:text-text-secondary transition-colors duration-300 cursor-pointer">
              <FacebookIcon />
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
