import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-soft hover:bg-primary/90 hover:shadow-card",
        // Metal — the button language: a machined steel surface, neutral,
        // never accent-coloured. This is the one real primary action
        // button; `default`/`brand` stay only for call sites not yet
        // migrated (see the wider design-token pass).
        primary:
          "btn-metal font-mono uppercase tracking-wide",
        // No metal — transparent fill, firm near-black border. Pairs with
        // `primary` as the two-button language; never accent-coloured.
        secondaryOutline:
          "btn-outline-secondary font-mono uppercase tracking-wide",
        brand:
          "bg-brand text-brand-foreground shadow-soft hover:bg-brand/90 hover:shadow-card",
        destructive:
          "bg-destructive text-destructive-foreground shadow-soft hover:bg-destructive/90",
        outline:
          "border border-border bg-card/50 hover:bg-accent/60 hover:text-accent-foreground hover:border-border/70",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/70",
        ghost: "hover:bg-accent/50 hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline decoration-1 underline-offset-[3px]",
      },
      size: {
        default: "h-10 px-5 py-2.5",
        sm: "h-8 rounded-md px-3.5 text-xs",
        lg: "h-11 rounded-lg px-9 text-[0.95rem]",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const METAL_VARIANTS = new Set(["primary", "secondaryOutline"]);

// The metal component is meant to be the only way to get a button — not
// just the default, structurally hard to bypass. Two enforcement layers:
// (1) this filter strips shape overrides (rounded-*) and brand/live/accent
// color utilities out of any incoming className before it ever reaches
// cn(), so a call site literally cannot merge in a pill shape or a
// hand-picked accent fill the way the previous ~48 rounded-full overrides
// did; (2) a lint rule is the natural follow-up (catching this at
// write-time instead of at render), noted here rather than built yet.
const DISALLOWED_CLASS = /^(rounded(-\w+)?|bg-(brand|live|accent)(-\w+)?|text-(brand|live)(-\w+)?|border-(brand|live)(-\w+)?)$/;

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
  const isMetal = METAL_VARIANTS.has(variant);
  // Enforcement is scoped to the metal variants only, for now — the ~48
  // existing rounded-full call sites on the old variants are a separate,
  // explicitly-deferred migration, not something that should silently
  // change shape the moment this component ships. Once that migration
  // happens and everything moves to primary/secondaryOutline, this
  // scoping becomes unconditional and the old variants retire.
  const finalClassName = isMetal ? sanitizeClassName(className) : className;
  return (
    (<Comp
      className={cn(buttonVariants({ variant, size, className: finalClassName }))}
      ref={ref}
      {...props}>
      {isMetal && !asChild ? <span className="btn-metal-label">{children}</span> : children}
    </Comp>)
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }
