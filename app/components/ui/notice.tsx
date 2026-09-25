import type { ReactNode } from "react";
import { cn } from "~/lib/cn";

export function Notice({
  tone = "info",
  title,
  children
}: {
  tone?: "info" | "warning" | "danger";
  title: string;
  children?: ReactNode;
}) {
  const tones = {
    info: "border-primary/30 bg-primary/5",
    warning: "border-warning/60 bg-warning/10",
    danger: "border-danger/40 bg-danger/5"
  };
  return (
    <div className={cn("rounded-lg border p-4 text-sm", tones[tone])} role={tone === "danger" ? "alert" : "status"}>
      <p className="font-medium">{title}</p>
      {children ? <div className="mt-1 text-muted-foreground">{children}</div> : null}
    </div>
  );
}
