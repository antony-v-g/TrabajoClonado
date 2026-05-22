/** Mismo `id` en toda la app: evita cargar el script de Google Maps varias veces. */
export const GOOGLE_MAPS_SCRIPT_ID = "rutasegura-maps";

const PLACEHOLDER_KEY_PATTERN =
  /^(YOUR_|your_|xxx|changeme|api[_-]?key|placeholder|example)/i;

/** Clave de Maps inyectada por Vite (requiere .env en la raíz y `npm run build`). */
export function getGoogleMapsApiKey(): string | undefined {
  const raw = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (raw == null || raw === "") return undefined;
  const t = String(raw).trim();
  if (t.length === 0) return undefined;
  if (PLACEHOLDER_KEY_PATTERN.test(t) || !t.startsWith("AIza")) return undefined;
  return t;
}

/** True si hay texto en .env pero no es una clave real de Google (p. ej. YOUR_GOOGLE_MAPS_API_KEY). */
export function hasPlaceholderMapsKey(): boolean {
  const raw = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (raw == null || raw === "") return false;
  const t = String(raw).trim();
  return t.length > 0 && (PLACEHOLDER_KEY_PATTERN.test(t) || !t.startsWith("AIza"));
}

/** Referencia estable: evita recargar LoadScript en cada render. */
export const GOOGLE_MAPS_LIBRARIES = ["places"] as const;

const loaderStaticOptions = {
  version: "weekly" as const,
  language: "es" as const,
  libraries: GOOGLE_MAPS_LIBRARIES,
};

const loaderConfigByKey = new Map<string, ReturnType<typeof buildLoaderConfig>>();

function buildLoaderConfig(apiKey: string) {
  return {
    id: GOOGLE_MAPS_SCRIPT_ID,
    googleMapsApiKey: apiKey,
    ...loaderStaticOptions,
  };
}

/** Misma referencia de objeto por clave → evita recargas de LoadScript. */
export function getGoogleMapsLoaderConfig(apiKey: string) {
  let cfg = loaderConfigByKey.get(apiKey);
  if (!cfg) {
    cfg = buildLoaderConfig(apiKey);
    loaderConfigByKey.set(apiKey, cfg);
  }
  return cfg;
}

/** Opciones sin clave (misma referencia de `libraries` que el loader activo). */
export const GOOGLE_MAPS_LOADER_DISABLED = {
  id: GOOGLE_MAPS_SCRIPT_ID,
  googleMapsApiKey: "",
  ...loaderStaticOptions,
} as const;
