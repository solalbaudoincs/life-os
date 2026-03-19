import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium font-mono transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default:
          "border-primary/30 text-primary bg-primary/[0.04]",
        secondary:
          "border-[hsl(var(--foreground)/0.1)] text-muted-foreground bg-transparent",
        destructive:
          "border-destructive/30 text-destructive bg-destructive/[0.04]",
        outline: "border-[hsl(var(--foreground)/0.1)] text-muted-foreground bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
