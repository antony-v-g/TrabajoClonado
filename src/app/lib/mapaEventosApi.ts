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
    return {
      kind: "sos",
      titulo: data.titulo,
      mensaje: data.mensaje + redisNote,
      extra:
        data.etiquetaZona && data.indicadorZona
          ? `${data.indicadorZona} Zona ML.NET: ${data.etiquetaZona} · ${data.contactosNotificados} contacto(s)`
          : undefined,
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
