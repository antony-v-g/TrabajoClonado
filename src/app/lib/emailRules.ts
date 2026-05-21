/** Misma regla que el API: solo @usuario.com o @admin.com */
export function isAllowedProjectEmail(email: string): boolean {
  const norm = email.trim().toLowerCase();
  return norm.endsWith("@usuario.com") || norm.endsWith("@admin.com");
}

export const EMAIL_DOMAIN_HINT =
  "Usa un correo @usuario.com (app) o @admin.com (administrador).";
