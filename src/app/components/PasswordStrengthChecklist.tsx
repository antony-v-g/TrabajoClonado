import { Check, X } from "lucide-react";
import { getPasswordRuleState, PASSWORD_RULE_LABELS } from "../lib/passwordRules";

type Props = {
  password: string;
  variant?: "dark" | "light";
};

export default function PasswordStrengthChecklist({
  password,
  variant = "dark",
}: Props) {
  const state = getPasswordRuleState(password);
  const show = password.length > 0;

  if (!show) return null;

  const pending =
    variant === "dark" ? "text-slate-500" : "text-slate-400";
  const okCls =
    variant === "dark" ? "text-emerald-400" : "text-emerald-600";
  const failCls = variant === "dark" ? "text-rose-400/90" : "text-rose-500";

  return (
    <ul
      className="mt-3 space-y-2 rounded-xl border px-3 py-3 text-sm transition-all duration-300 animate-in fade-in slide-in-from-top-1"
      role="list"
      aria-live="polite"
      aria-label="Requisitos de contraseña"
      style={{
        borderColor:
          variant === "dark"
            ? "rgba(100,116,139,0.4)"
            : "rgba(226,232,240,1)",
        background:
          variant === "dark"
            ? "rgba(15,23,42,0.5)"
            : "rgba(248,250,252,0.9)",
      }}
    >
      {PASSWORD_RULE_LABELS.map(({ key, label }) => {
        const ok = state[key];
        const displayLabel =
          key === "length" && !ok
            ? `Longitud mínima de 16 caracteres (llevas ${password.length})`
            : label;

        return (
          <li
            key={key}
            className={`flex items-center gap-2 transition-colors duration-200 ${
              ok ? okCls : password.length > 0 ? failCls : pending
            }`}
          >
            {ok ? (
              <Check className="h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <X className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
            )}
            <span>{displayLabel}</span>
          </li>
        );
      })}
    </ul>
  );
}
