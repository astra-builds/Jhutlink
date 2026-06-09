import React, { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export type AnimConfig = {
  selector: string;
  from: gsap.TweenVars;
  to: gsap.TweenVars;
  position?: number;
};

export type PinOptions = {
  start?: string;
  end?: string;
  scrub?: number;
  pinSpacing?: boolean;
  markers?: boolean;
  disabled?: boolean;
};

type CounterOptions = {
  prefix?: string;
  suffix?: string;
  duration?: number;
  start?: string;
  format?: (val: number) => string;
};

type FadeOptions = {
  from?: gsap.TweenVars;
  to?: gsap.TweenVars;
  stagger?: number;
  start?: string;
};

export function useSectionPin(
  sectionRef: React.RefObject<HTMLElement | null>,
  animations: AnimConfig[],
  options: PinOptions = {}
) {
  const cfgRef = useRef({ animations, options });
  cfgRef.current = { animations, options };

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const { animations: anims, options: opts } = cfgRef.current;
    if (!anims.length || opts.disabled) return;

    const { start = "top top", end = "+=400", scrub = 1, pinSpacing = true } = opts;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start,
          end,
          pin: true,
          anticipatePin: 1,
          scrub,
          pinSpacing,
        },
      });

      anims.forEach(({ selector, from, to, position }) => {
        const els = section.querySelectorAll<HTMLElement>(selector);
        if (!els.length) return;
        tl.fromTo(els, from, to, position ?? 0);
      });
    }, section);

    return () => ctx.revert();
  }, [sectionRef]);
}

export function useScrollFade(
  sectionRef: React.RefObject<HTMLElement | null>,
  selectors: string[],
  options: FadeOptions = {}
) {
  const cfgRef = useRef({ selectors, options });
  cfgRef.current = { selectors, options };

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const { selectors: sels, options: opts } = cfgRef.current;
    const {
      from = { opacity: 0, y: 30 },
      to = { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" },
      stagger = 0.1,
      start = "top 75%",
    } = opts;
    if (!sels.length) return;

    const ctx = gsap.context(() => {
      sels.forEach((sel) => {
        const els = section.querySelectorAll<HTMLElement>(sel);
        if (!els.length) return;
        gsap.fromTo(els, from, {
          ...to,
          stagger,
          scrollTrigger: {
            trigger: section,
            start,
            toggleActions: "play none none none",
          },
        });
      });
    }, section);

    return () => ctx.revert();
  }, [sectionRef]);
}

export function useCounter(
  elRef: React.RefObject<HTMLElement | null>,
  targetValue: number,
  options: CounterOptions = {}
) {
  const optsRef = useRef(options);
  optsRef.current = options;

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    const { prefix = "", suffix = "", duration = 2, start = "top 85%", format } = optsRef.current;

    const ctx = gsap.context(() => {
      const obj = { val: 0 };
      gsap.to(obj, {
        val: targetValue,
        duration,
        ease: "power2.out",
        onUpdate: () => {
          if (format) {
            el.textContent = format(Math.round(obj.val));
          } else {
            const formatted = Math.round(obj.val).toLocaleString("en-BD");
            el.textContent = `${prefix}${formatted}${suffix}`;
          }
        },
        scrollTrigger: {
          trigger: el,
          start,
          toggleActions: "play none none none",
        },
      });
    }, el);

    return () => ctx.revert();
  }, [elRef, targetValue]);
}

export function splitText(
  text: string,
  className = "reveal-word",
  wordColors?: Record<number, string>
): React.ReactElement[] {
  const words = text.split(" ");
  return words.map((word, i) => (
    <span
      key={i}
      className={`${className} inline-block`}
      style={{
        color: wordColors?.[i],
        marginRight: i < words.length - 1 ? "0.3em" : undefined,
      }}
    >
      {word}
    </span>
  ));
}

export function isMobile(): boolean {
  return typeof window !== "undefined" && window.innerWidth < 768;
}
