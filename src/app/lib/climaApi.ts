import { apiUrl } from "./api";

export type ClimaImpacto = {
  lluvia: boolean;
  neblina: boolean;
  tormenta: boolean;
  visibilidadBaja: boolean;
  condicionClima: number;
  riesgoMovilidad: string;
  emoji: string;
  advertencias: string[];
  recomendacionRuta: string;
};

export type ResumenClimaInicio = {
  ciudad: string;
  titulo: string;
  subtitulo: string;
  horaLocal: number;
  clima: {
    descripcion: string;
    temperaturaC: number;
    fuente: string;
  };
  impacto: ClimaImpacto;
};

function mapImpacto(raw: Record<string, unknown>): ClimaImpacto {
  const adv = raw.advertencias ?? raw.Advertencias;
  return {
    lluvia: Boolean(raw.lluvia ?? raw.Lluvia),
    neblina: Boolean(raw.neblina ?? raw.Neblina),
    tormenta: Boolean(raw.tormenta ?? raw.Tormenta),
    visibilidadBaja: Boolean(raw.visibilidadBaja ?? raw.VisibilidadBaja),
    condicionClima: Number(raw.condicionClima ?? raw.CondicionClima ?? 0),
    riesgoMovilidad: String(raw.riesgoMovilidad ?? raw.RiesgoMovilidad ?? "Bajo"),
    emoji: String(raw.emoji ?? raw.Emoji ?? "🌤️"),
    advertencias: Array.isArray(adv) ? adv.map(String) : [],
    recomendacionRuta: String(
      raw.recomendacionRuta ?? raw.RecomendacionRuta ?? "",
    ),
  };
}

export async function fetchResumenClimaInicio(): Promise<ResumenClimaInicio | null> {
  try {
    const r = await fetch(apiUrl("/api/external/resumen-inicio"), {
      cache: "no-store",
    });
    if (!r.ok) return null;
    const j = (await r.json()) as Record<string, unknown>;
    const clima = (j.clima ?? j.Clima ?? {}) as Record<string, unknown>;
    const impacto = mapImpacto((j.impacto ?? j.Impacto ?? {}) as Record<string, unknown>);
    return {
      ciudad: String(j.ciudad ?? "Lima"),
      titulo: String(j.titulo ?? j.Titulo ?? "Clima en Lima"),
      subtitulo: String(j.subtitulo ?? j.Subtitulo ?? ""),
      horaLocal: Number(j.horaLocal ?? j.HoraLocal ?? 0),
      clima: {
        descripcion: String(clima.descripcion ?? clima.Descripcion ?? ""),
        temperaturaC: Number(clima.temperaturaC ?? clima.TemperaturaC ?? 0),
        fuente: String(clima.fuente ?? clima.Fuente ?? ""),
      },
      impacto,
    };
  } catch {
    return null;
  }
}

export { mapImpacto };
