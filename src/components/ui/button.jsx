import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Workstream L: every button is a pill. `primary` is the main
        // action (ink, burgundy offset shadow); `secondaryOutline` the
        // quieter one (ink outline). The rest are for call sites that need
        // a different weight, drawn in the same palette.
        default:
          "btn-room",
        primary:
          "btn-room",
        secondaryOutline:
          "btn-room-line",
        brand:
          "bg-brand text-brand-foreground border-2 border-brand hover:bg-brand/90",
        destructive:
          "bg-destructive text-destructive-foreground border-2 border-destructive hover:bg-destructive/90",
        outline:
          "border-2 border-foreground/80 bg-card/60 hover:bg-card",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-accent",
        ghost: "hover:bg-accent/60 hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline decoration-1 underline-offset-[3px] rounded-none",
      },
      size: {
        default: "h-10 px-5 py-2.5",
        sm: "h-8 px-3.5 text-xs",
        lg: "h-12 px-8 text-[0.95rem]",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const PILL_VARIANTS = new Set(["default", "primary", "secondaryOutline"]);

// The pill shape and the ink/burgundy colours come from the variant, not
// from className: this filter strips shape overrides (rounded-*) and
// brand/live/accent colour utilities (with any opacity, e.g. /40) from the
// pill variants before they reach cn(), and warns in development.
const DISALLOWED_CLASS = /^(rounded(-\w+)?|bg-(brand|live|accent)(-\w+)?(\/\d+)?|text-(brand|live)(-\w+)?(\/\d+)?|border-(brand|live)(-\w+)?(\/\d+)?)$/;

function sanitizeClassName(className) {
  if (!className) return className;
  const kept = [];
  const stripped = [];
  for (const cls of className.split(/\s+/).filter(Boolean)) {
    const base = cls.split(":").pop().replace(/^!/, "");
    (DISALLOWED_CLASS.test(base) ? stripped : kept).push(cls);
  }
  if (stripped.length && import.meta.env.DEV) {
    console.warn(
      `Button: dropped shape/colour override(s) [${stripped.join(", ")}] — shape and accent colour come from \`variant\`, not className. Add a variant if the button genuinely needs a different one.`
    );
  }
  return kept.join(" ");
}

const Button = React.forwardRef(({ className, variant, size, asChild = false, children, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  const isPill = PILL_VARIANTS.has(variant ?? "default");
  const finalClassName = isPill ? sanitizeClassName(className) : className;
  return (
    (<Comp
      className={cn(buttonVariants({ variant, size, className: finalClassName }))}
      ref={ref}
      {...props}>
      {children}
    </Comp>)
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }
