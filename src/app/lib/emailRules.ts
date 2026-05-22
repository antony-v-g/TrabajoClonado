/** Misma regla que el API: solo @usuario.com o @admin.com */
export function isAllowedProjectEmail(email: string): boolean {
  const norm = email.trim().toLowerCase();
  return norm.endsWith("@usuario.com") || norm.endsWith("@admin.com");
}

export type DetectedRol = "Usuario" | "Administrador";

/** Rol según dominio del correo (null si aún no es un dominio válido). */
export function detectRolFromEmail(email: string): DetectedRol | null {
  const norm = email.trim().toLowerCase();
  if (norm.endsWith("@admin.com")) return "Administrador";
  if (norm.endsWith("@usuario.com")) return "Usuario";
  return null;
}

export const MSG_EMAIL_INVALID =
  "⚠️ El correo debe terminar en @usuario.com o @admin.com";

export const MSG_EMAIL_EXISTS = "⚠️ El correo ya está registrado";

export const MSG_EMPTY_FIELDS = "⚠️ Completa todos los campos";

export const MSG_REGISTER_SUCCESS =
  "✅ Cuenta creada correctamente. Redirigiendo al sistema...";

export const MSG_LOGIN_SUCCESS = "✅ Bienvenido nuevamente";

export const MSG_USER_NOT_FOUND = "⚠️ Usuario no registrado";

export const MSG_WRONG_PASSWORD = "⚠️ Contraseña incorrecta.";

export function dashboardPathForRol(rol: string): string {
  return rol === "Administrador" ? "/admin/dashboard" : "/home";
}
