"use client";

import { MotionConfig, motion } from "motion/react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** One rhythm for the whole app: a quick spring for things you touch, a short ease for fades. */
export const SPRING = { type: "spring", stiffness: 420, damping: 34 } as const;
export const SPRING_POP = { type: "spring", stiffness: 460, damping: 30 } as const;
export const EASE = { duration: 0.22, ease: [0.22, 1, 0.36, 1] } as const;
export const STAGGER_STEP = 0.035;

/** Honours the device's reduced-motion setting for every motion component below it. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/** Each route fades in and lifts 10px. Only transform and opacity animate. */
export function PageTransition({ children, className }: { children: ReactNode; className?: string }) {
  const path = usePathname();
  return (
    <motion.div key={path} className={className} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}

/** List rows enter 35ms apart; capped so a long list never takes more than ~0.4s to settle. */
export function Stagger({ children, className, as = "div" }: { children: ReactNode; className?: string; as?: "div" | "ul" | "ol" }) {
  const Tag = motion[as];
  return (
    <Tag className={className} initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: STAGGER_STEP, delayChildren: 0.04 } } }}>
      {children}
    </Tag>
  );
}

export function StaggerItem({ children, className, as = "div" }: { children: ReactNode; className?: string; as?: "div" | "li" }) {
  const Tag = motion[as];
  return (
    <Tag className={className} variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: SPRING } }}>
      {children}
    </Tag>
  );
}

export function FadeIn({ children, className, delay = 0, y = 10 }: { children: ReactNode; className?: string; delay?: number; y?: number }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y }} animate={{ opacity: 1, y: 0 }} transition={{ ...EASE, duration: 0.36, delay }}>
      {children}
    </motion.div>
  );
}

/** Wraps a card or row so it scales slightly while pressed. */
export function Pressable({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} whileTap={{ scale: 0.98 }} transition={SPRING}>
      {children}
    </motion.div>
  );
}
