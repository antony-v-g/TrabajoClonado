export const PASSWORD_MIN_LENGTH = 16;

export type PasswordRuleState = {
  length: boolean;
  upper: boolean;
  lower: boolean;
  digit: boolean;
  special: boolean;
};

export const PASSWORD_RULE_LABELS: {
  key: keyof PasswordRuleState;
  label: string;
}[] = [
  { key: "upper", label: "Contiene mayúscula" },
  { key: "lower", label: "Contiene minúscula" },
  { key: "digit", label: "Contiene número" },
  { key: "special", label: "Contiene carácter especial" },
  {
    key: "length",
    label: `Longitud mínima de ${PASSWORD_MIN_LENGTH} caracteres cumplida`,
  },
];

export function getPasswordRuleState(password: string): PasswordRuleState {
  return {
    length: password.length >= PASSWORD_MIN_LENGTH,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    digit: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
}

export function isStrongPassword(password: string): boolean {
  const s = getPasswordRuleState(password);
  return s.length && s.upper && s.lower && s.digit && s.special;
}

export const MSG_PASSWORD_REGISTER_INVALID =
  "⚠️ La contraseña debe tener mínimo 16 caracteres, incluir mayúscula, número y carácter especial.";
