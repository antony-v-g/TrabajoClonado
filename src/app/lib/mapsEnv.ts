/** Mismo `id` en toda la app: evita cargar el script de Google Maps varias veces. */
export const GOOGLE_MAPS_SCRIPT_ID = "rutasegura-maps";

/** Clave de Maps inyectada por Vite (requiere .env en la raíz y reiniciar `npm run dev`). */
export function getGoogleMapsApiKey(): string | undefined {
  const raw = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (raw == null || raw === "") return undefined;
  const t = String(raw).trim();
  return t.length > 0 ? t : undefined;
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
