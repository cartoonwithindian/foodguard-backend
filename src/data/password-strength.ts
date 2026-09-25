// Previously imported from `@/lib/validation`, an 81-line module whose only
// live export was this type — the rest was dead code, now removed.
export type PasswordStrength = "none" | "weak" | "medium" | "strong";

export const STRENGTH_CONFIG: Record<
  PasswordStrength,
  { color: string; barColor: string; width: string }
> = {
  none: { color: "text-muted-foreground", barColor: "bg-muted", width: "0%" },
  weak: { color: "text-red-600", barColor: "bg-red-500", width: "33%" },
  medium: { color: "text-amber-600", barColor: "bg-amber-500", width: "66%" },
  strong: { color: "text-green-600", barColor: "bg-green-600", width: "100%" },
};
