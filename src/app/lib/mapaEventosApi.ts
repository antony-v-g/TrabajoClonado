import { apiUrl, authJsonHeaders } from "./api";

export type MapaEventoResp = {
  titulo: string;
  mensaje: string;
  contactosNotificados: number;
  nombresContactos: string[];
  cacheRedisActivo: boolean;
  eventoGuardadoEnRedis: boolean;
  indicadorZona?: string;
  etiquetaZona?: string;
  nivelRiesgoContextual?: string;
  motivosRiesgo?: string[];
  climaResumen?: string;
  riesgoEstimadoPct?: number;
};

export type EventoToast = {
  kind: "ok" | "sos" | "info";
  titulo: string;
  mensaje: string;
  extra?: string;
};

export async function postMapaEvento(
  token: string,
  tipo: "llegue-bien" | "sos",
  body: {
    latitud?: number;
    longitud?: number;
    ubicacionTexto: string;
  },
): Promise<MapaEventoResp | null> {
  const r = await fetch(apiUrl(`/api/mapa/${tipo}`), {
    method: "POST",
    headers: authJsonHeaders(token),
    body: JSON.stringify(body),
  });
  if (!r.ok) return null;
  return (await r.json()) as MapaEventoResp;
}

export function toastFromMapaEvento(
  tipo: "llegue-bien" | "sos",
  data: MapaEventoResp,
): EventoToast {
  const redisNote = data.eventoGuardadoEnRedis
    ? " Registrado en caché Redis."
    : data.cacheRedisActivo
      ? ""
      : " (SQLite; Redis no activo)";

  if (tipo === "sos") {
    const motivos =
      data.motivosRiesgo && data.motivosRiesgo.length > 0
        ? ` Motivos: ${data.motivosRiesgo.join(" · ")}.`
        : "";
    const clima = data.climaResumen ? ` Clima: ${data.climaResumen}.` : "";
    const nivel = data.nivelRiesgoContextual
      ? ` Nivel de riesgo: ${data.nivelRiesgoContextual}`
      : "";
    const pct =
      data.riesgoEstimadoPct != null ? ` (${data.riesgoEstimadoPct}%).` : ".";

    return {
      kind: "sos",
      titulo: data.titulo,
      mensaje: data.mensaje + redisNote,
      extra:
        `${nivel}${pct}${clima}${motivos}` ||
        (data.etiquetaZona && data.indicadorZona
          ? `${data.indicadorZona} Zona ML.NET: ${data.etiquetaZona} · ${data.contactosNotificados} contacto(s)`
          : undefined),
    };
  }

  return {
    kind: "ok",
    titulo: data.titulo,
    mensaje: data.mensaje + redisNote,
    extra:
      data.nombresContactos.length > 0
        ? `Contactos: ${data.nombresContactos.join(", ")}`
        : "Agrega contactos en Perfil",
  };
}
