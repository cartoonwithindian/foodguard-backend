import type { PasswordStrength } from "@/lib/validation";

export const STRENGTH_CONFIG: Record<
  PasswordStrength,
  { color: string; barColor: string; width: string }
> = {
  none: { color: "text-muted-foreground", barColor: "bg-muted", width: "0%" },
  weak: { color: "text-red-600", barColor: "bg-red-500", width: "33%" },
  medium: { color: "text-amber-600", barColor: "bg-amber-500", width: "66%" },
  strong: { color: "text-green-600", barColor: "bg-green-600", width: "100%" },
};
