// /web/components/ui/Primitives.tsx
"use client";

import React from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/ui-utils";

export type ButtonProps = HTMLMotionProps<"button"> & {
  variant?: "default" | "outline" | "ghost" | "glass" | "secondary";
  size?: "sm" | "default" | "lg" | "icon";
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const variants = {
      default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_rgba(59,130,246,0.2)]",
      secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/90",
      outline: "border border-input bg-background/50 hover:bg-accent hover:text-accent-foreground",
      ghost: "hover:bg-accent hover:text-accent-foreground",
      glass:
        "bg-white/[0.05] border border-white/[0.08] text-foreground hover:bg-white/[0.08] hover:border-white/[0.12] backdrop-blur-md shadow-sm transition-all duration-300",
    } as const;
    const sizes = {
      sm: "h-9 rounded-lg px-3 text-xs",
      default: "h-10 px-5 py-2 rounded-lg text-sm",
      lg: "h-12 rounded-xl px-8 text-base",
      icon: "h-10 w-10 p-2 rounded-lg",
    } as const;

    return (
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-2xl border border-white/[0.06] bg-[#0F1219]/80 text-card-foreground shadow-sm backdrop-blur-sm",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-sans transition-all focus:border-primary/50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export const Badge = ({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  variant?: "default" | "secondary" | "outline" | "success" | "neutral";
}) => {
  const variants = {
    default: "border-transparent bg-primary/15 text-primary hover:bg-primary/25",
    secondary: "border-transparent bg-secondary/20 text-secondary-foreground hover:bg-secondary/30",
    outline: "text-foreground border-border",
    success: "border-transparent bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
    neutral: "border-transparent bg-white/5 text-muted-foreground border border-white/5",
  };
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
};

export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn("animate-pulse rounded-md bg-muted/30", className)} />
);

export const buttonClasses = (
  variant: ButtonProps["variant"] = "default",
  size: ButtonProps["size"] = "default",
) => {
  const variants = {
    default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_rgba(59,130,246,0.2)]",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/90",
    outline: "border border-input bg-background/50 hover:bg-accent hover:text-accent-foreground",
    ghost: "hover:bg-accent hover:text-accent-foreground",
    glass:
      "bg-white/[0.05] border border-white/[0.08] text-foreground hover:bg-white/[0.08] hover:border-white/[0.12] backdrop-blur-md shadow-sm transition-all duration-300",
  } as const;

  const sizes = {
    sm: "h-9 rounded-lg px-3 text-xs",
    default: "h-10 px-5 py-2 rounded-lg text-sm",
    lg: "h-12 rounded-xl px-8 text-base",
    icon: "h-10 w-10 p-2 rounded-lg",
  } as const;

  return cn(
    "inline-flex items-center justify-center whitespace-nowrap font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    sizes[size],
  );
};
