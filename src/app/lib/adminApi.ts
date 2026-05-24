import { apiUrl, authJsonHeaders, readApiErrorMessage } from "./api";

export type AdminCacheMeta = {
  cacheRedisActivo: boolean;
  servidoDesdeCache: boolean;
};

export type RedisEstado = {
  habilitado: boolean;
  mensaje: string;
  clavesCacheAdmin: number;
  servidoDesdeCache?: boolean;
};

export async function fetchRedisEstado(
  token: string | null,
): Promise<RedisEstado | null> {
  if (!token) return null;
  try {
    const r = await fetch(apiUrl("/api/Admin/redis-estado"), {
      headers: authJsonHeaders(token),
      cache: "no-store",
    });
    if (!r.ok) return null;
    return (await r.json()) as RedisEstado;
  } catch {
    return null;
  }
}

export async function adminFetchJson<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<{ meta: AdminCacheMeta; data: T }> {
  const r = await fetch(apiUrl(path), {
    ...init,
    headers: { ...authJsonHeaders(token), ...init?.headers },
    cache: "no-store",
  });
  if (!r.ok) {
    throw new Error(await readApiErrorMessage(r, "Error en la API de administración"));
  }
  const raw = (await r.json()) as Record<string, unknown>;
  const meta: AdminCacheMeta = {
    cacheRedisActivo: Boolean(raw.cacheRedisActivo),
    servidoDesdeCache: Boolean(raw.servidoDesdeCache),
  };
  if (raw.datos !== undefined) {
    return { meta, data: raw.datos as T };
  }
  if (raw.alertas !== undefined) {
    return { meta, data: raw.alertas as T };
  }
  if (raw.puntos !== undefined) {
    return { meta, data: raw.puntos as T };
  }
  return { meta, data: raw as T };
}

export type PrediccionZona = {
  ubicacion: string;
  reportes7d: number;
  reportesSemanaAnterior: number;
  deltaPct: number;
  tipoIncidenteDominante: string;
  nivelZonaMl: string;
  etiquetaZona: string;
  indicadorZona: string;
  confianzaMlPct: number;
  riesgoPredichoPct: number;
  mensajePredictivo: string;
  requiereAlerta: boolean;
};

export async function fetchPrediccionesAdmin(
  token: string,
  take = 6,
): Promise<PrediccionZona[]> {
  const r = await fetch(apiUrl(`/api/Admin/predicciones?take=${take}`), {
    headers: authJsonHeaders(token),
    cache: "no-store",
  });
  if (!r.ok) {
    throw new Error(await readApiErrorMessage(r, "No se pudieron cargar predicciones"));
  }
  const j = (await r.json()) as { predicciones?: PrediccionZona[] };
  return Array.isArray(j.predicciones) ? j.predicciones : [];
}

export type AnalisisMlReporte = {
  reporteId: number;
  tipoDeclarado: string;
  nivelConfianzaIaGuardado: number;
  clasificacion: {
    tipoPredicho: string;
    confianzaPct: number;
    coincideConDeclarado: boolean;
  } | null;
  zona: {
    indicadorVisual: string;
    etiqueta: string;
    confianzaPct: number;
    reportesZona30d: number;
  };
  sugerencia: string;
};

export async function fetchAnalisisMlReporte(
  token: string,
  reporteId: number,
): Promise<AnalisisMlReporte> {
  const r = await fetch(apiUrl(`/api/Admin/reportes/${reporteId}/analisis-ml`), {
    headers: authJsonHeaders(token),
    cache: "no-store",
  });
  if (!r.ok) {
    throw new Error(await readApiErrorMessage(r, "No se pudo analizar con ML"));
  }
  return (await r.json()) as AnalisisMlReporte;
}
