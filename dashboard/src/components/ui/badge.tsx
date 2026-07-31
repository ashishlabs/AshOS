import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[image:var(--gradient-brand)] text-primary-foreground shadow-[0_0_12px_-3px_var(--glow-primary)]",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive/15 text-destructive shadow-[0_0_10px_-4px_var(--destructive)]",
        success: "border-transparent bg-success/15 text-success shadow-[0_0_10px_-4px_var(--success)]",
        warning: "border-transparent bg-warning/20 text-warning shadow-[0_0_10px_-4px_var(--warning)]",
        outline: "border-border/80 text-foreground"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
