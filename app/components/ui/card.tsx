import type { HTMLAttributes } from "react";
import { cn } from "~/lib/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-(--radius-card) border border-border bg-white p-5", className)} {...props} />;
}
