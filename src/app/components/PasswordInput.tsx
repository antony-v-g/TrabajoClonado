import { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";

type Variant = "dark" | "light";

type Props = {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  variant?: Variant;
  minLength?: number;
  maxLength?: number;
  /** Bloquea autofill del navegador hasta el primer foco */
  preventAutofill?: boolean;
};

const styles: Record<
  Variant,
  { input: string; icon: string; toggle: string }
> = {
  dark: {
    input:
      "w-full rounded-2xl border border-slate-700/80 bg-slate-950/70 pl-12 pr-12 py-3 text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20",
    icon: "text-slate-400",
    toggle: "text-slate-400 hover:text-slate-200",
  },
  light: {
    input:
      "pl-10 pr-12 block w-full border-slate-200 bg-slate-50 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 py-3",
    icon: "text-slate-400",
    toggle: "text-slate-400 hover:text-slate-600",
  },
};

export default function PasswordInput({
  id,
  name,
  value,
  onChange,
  placeholder,
  autoComplete,
  variant = "dark",
  minLength,
  maxLength,
  preventAutofill = false,
}: Props) {
  const [show, setShow] = useState(false);
  const [autofillUnlocked, setAutofillUnlocked] = useState(!preventAutofill);
  const s = styles[variant];

  const unlockAutofill = () => {
    if (!autofillUnlocked) setAutofillUnlocked(true);
  };

  return (
    <div className="relative">
      <div
        className={`pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 ${s.icon}`}
      >
        <Lock className="h-5 w-5" />
      </div>
      <input
        id={id}
        name={name}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete ?? (preventAutofill ? "new-password" : undefined)}
        readOnly={preventAutofill && !autofillUnlocked}
        onFocus={unlockAutofill}
        data-lpignore={preventAutofill ? "true" : undefined}
        data-1p-ignore={preventAutofill ? "true" : undefined}
        data-form-type={preventAutofill ? "other" : undefined}
        minLength={minLength}
        maxLength={maxLength}
        className={s.input}
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={() => setShow((prev) => !prev)}
        className={`absolute inset-y-0 right-0 flex items-center pr-3 ${s.toggle}`}
        aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
      >
        {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </div>
  );
}
