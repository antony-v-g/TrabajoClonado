import { apiUrl } from "./api";
import { mapImpacto, type ClimaImpacto } from "./climaApi";

export type ClimaZona = {
  lat: number;
  lon: number;
  temperaturaC: number;
  descripcion: string;
  fuente: string;
};

export type ClasificacionZona = {
  zona: string;
  riesgo: string;
  confianza: number;
  indicadorVisual: string;
  etiqueta: string;
  motor?: string;
  servidoDesdeCache?: boolean;
};

export type RiesgoFranja = {
  franja: string;
  hora: number;
  riesgo: string;
  confianza: number;
  indicadorVisual: string;
  etiqueta: string;
};

export type ContextoZonaCompleto = {
  zona: string;
  lat: number;
  lon: number;
  clima: ClimaZona;
  climaImpacto: ClimaImpacto;
  clasificacion: ClasificacionZona;
  riesgoHorario: RiesgoFranja[];
};

function horaLocalPeru(): number {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
}

function mapClasificacion(raw: Record<string, unknown>): ClasificacionZona {
  return {
    zona: String(raw.zona ?? raw.Zona ?? ""),
    riesgo: String(raw.riesgo ?? raw.Riesgo ?? raw.nivel ?? "Moderada"),
    confianza: Number(raw.confianza ?? raw.Confianza ?? 0),
    indicadorVisual: String(raw.indicadorVisual ?? raw.IndicadorVisual ?? ""),
    etiqueta: String(raw.etiqueta ?? raw.Etiqueta ?? ""),
    motor: raw.motor != null ? String(raw.motor) : undefined,
    servidoDesdeCache: Boolean(raw.servidoDesdeCache ?? raw.ServidoDesdeCache),
  };
}

function mapClima(raw: Record<string, unknown>): ClimaZona {
  return {
    lat: Number(raw.lat ?? raw.Lat ?? 0),
    lon: Number(raw.lon ?? raw.Lon ?? 0),
    temperaturaC: Number(raw.temperaturaC ?? raw.TemperaturaC ?? 0),
    descripcion: String(raw.descripcion ?? raw.Descripcion ?? ""),
    fuente: String(raw.fuente ?? raw.Fuente ?? ""),
  };
}

function mapFranja(raw: Record<string, unknown>): RiesgoFranja {
  return {
    franja: String(raw.franja ?? raw.Franja ?? ""),
    hora: Number(raw.hora ?? raw.Hora ?? 0),
    riesgo: String(raw.riesgo ?? raw.Riesgo ?? ""),
    confianza: Number(raw.confianza ?? raw.Confianza ?? 0),
    indicadorVisual: String(raw.indicadorVisual ?? raw.IndicadorVisual ?? ""),
    etiqueta: String(raw.etiqueta ?? raw.Etiqueta ?? ""),
  };
}

/** ML + WeatherAPI + riesgo por franja horaria para Mapa / Rutas. */
export async function fetchContextoZonaCompleto(
  zona: string,
  lat: number,
  lon: number,
): Promise<ContextoZonaCompleto | null> {
  const params = new URLSearchParams({
    zona: zona.trim() || "Lima, Perú",
    lat: String(lat),
    lon: String(lon),
    hora_local: String(horaLocalPeru()),
  });
  try {
    const r = await fetch(apiUrl(`/api/Ml/contexto-zona?${params}`), {
      cache: "no-store",
    });
    if (!r.ok) return null;
    const j = (await r.json()) as Record<string, unknown>;
    const clasRaw = (j.clasificacion ?? j.Clasificacion) as Record<
      string,
      unknown
    >;
    const horarioRaw = (j.riesgoHorario ?? j.RiesgoHorario) as
      | Record<string, unknown>[]
      | undefined;
    const impactoRaw = (j.climaImpacto ?? j.ClimaImpacto ?? {}) as Record<
      string,
      unknown
    >;
    return {
      zona: String(j.zona ?? zona),
      lat: Number(j.lat ?? lat),
      lon: Number(j.lon ?? lon),
      clima: mapClima((j.clima ?? j.Clima ?? {}) as Record<string, unknown>),
      climaImpacto: mapImpacto(impactoRaw),
      clasificacion: mapClasificacion(clasRaw ?? {}),
      riesgoHorario: Array.isArray(horarioRaw)
        ? horarioRaw.map((x) => mapFranja(x))
        : [],
    };
  } catch {
    return null;
  }
}

export type MlRutaClimaResult = {
  recomendaciones: Array<{
    varianteId: string;
    nombre: string;
    preferenceScore: number;
    seguridadPct: number;
  }>;
  influidoPorClima: boolean;
  advertenciasClima: string[];
};

export async function fetchRecomendacionesMlConClima(
  token: string,
  origen: string,
  destino: string,
  origLat?: number,
  origLng?: number,
  destLat?: number,
  destLng?: number,
): Promise<MlRutaClimaResult | null> {
  const params = new URLSearchParams({ origen, destino });
  if (destLat != null && destLng != null) {
    params.set("dest_lat", String(destLat));
    params.set("dest_lon", String(destLng));
  }
  if (origLat != null && origLng != null) {
    params.set("orig_lat", String(origLat));
    params.set("orig_lon", String(origLng));
  }
  const r = await fetch(apiUrl(`/api/Ml/recomendar-rutas?${params}`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const j = (await r.json()) as Record<string, unknown>;
  const recs = (j.recomendaciones ?? j.Recomendaciones ?? []) as Record<
    string,
    unknown
  >[];
  const adv = j.advertenciasClima ?? j.AdvertenciasClima;
  return {
    influidoPorClima: Boolean(j.influidoPorClima ?? j.InfluidoPorClima),
    advertenciasClima: Array.isArray(adv) ? adv.map(String) : [],
    recomendaciones: recs.map((rec) => ({
      varianteId: String(rec.varianteId ?? rec.VarianteId ?? ""),
      nombre: String(rec.nombre ?? rec.Nombre ?? ""),
      preferenceScore: Number(rec.preferenceScore ?? rec.PreferenceScore ?? 0),
      seguridadPct: Number(rec.seguridadPct ?? rec.SeguridadPct ?? 0),
    })),
  };
}
