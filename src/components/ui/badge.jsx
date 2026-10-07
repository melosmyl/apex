import * as React from "react"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  // Workstream L: the mock's pill, a mono label with an ink edge.
  "inline-flex items-center rounded-full border-[1.5px] px-2.5 py-0.5 font-mono text-[0.68rem] uppercase tracking-[0.12em] font-medium transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default:
          "border-brand bg-brand text-brand-foreground hover:bg-brand/85",
        primary:
          "border-primary bg-primary text-primary-foreground hover:bg-primary/85",
        secondary:
          "border-foreground bg-card text-secondary-foreground",
        destructive:
          "border-destructive bg-destructive/10 text-destructive",
        outline: "border-foreground text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  ...props
}) {
  return (<div className={cn(badgeVariants({ variant }), className)} {...props} />);
}

export { Badge, badgeVariants }