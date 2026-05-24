/**
 * URL del API. Por defecto rutas relativas `/api/...` (mismo origen: proxy de Vite
 * en :5173 o `preview` con proxy). Opcional: `VITE_API_URL=http://127.0.0.1:5000` en `.env`
 * para `vite preview` o pruebas sin proxy.
 */
export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const raw = import.meta.env.VITE_API_URL;
  if (raw == null || String(raw).trim() === "") {
    return normalized;
  }
  const base = String(raw).replace(/\/$/, "");
  if (typeof window !== "undefined") {
    try {
      if (new URL(base).origin === window.location.origin) {
        return normalized;
      }
    } catch {
      // base no es URL absoluta
    }
  }
  return `${base}${normalized}`;
}

export function authJsonHeaders(
  token: string | null | undefined,
): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    h.Authorization = `Bearer ${token}`;
  }
  return h;
}

/** Mensaje legible: `message`, ProblemDetails `detail`/`title`, o `errors` (validación ASP.NET). */
export async function readApiErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const withStatus = (msg: string) =>
    response.status ? `${msg} (HTTP ${response.status})` : msg;
  try {
    const text = await response.text();
    if (!text) {
      return withStatus(fallback);
    }
    let body: unknown;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      return withStatus(text.length > 200 ? `${text.slice(0, 200)}…` : text);
    }
    if (body && typeof body === "object") {
      const o = body as Record<string, unknown>;
      if (typeof o.message === "string") return o.message;
      if (typeof o.detail === "string") return o.detail;
      if (typeof o.title === "string" && o.title !== "One or more validation errors occurred.")
        return o.title;
      const err = o.errors;
      if (err && typeof err === "object") {
        for (const key of Object.keys(err as object)) {
          const v = (err as Record<string, unknown>)[key];
          if (Array.isArray(v) && v[0] != null) return String(v[0]);
          if (typeof v === "string") return v;
        }
      }
    }
  } catch {
    // ignore
  }
  return withStatus(fallback);
}
