import { apiUrl, authJsonHeaders } from "./api";

export type PreferenciasUsuario = {
  evitarZonasOscurasNoche: boolean;
  modoMovilidadPredeterminado: string;
  alertasRiesgoTiempoReal: boolean;
  avisoAutomaticoLlegada: boolean;
  actualizadoEn?: string;
  cacheRedisActivo?: boolean;
  servidoDesdeCache?: boolean;
};

export async function fetchPreferencias(
  token: string,
): Promise<PreferenciasUsuario | null> {
  const r = await fetch(apiUrl("/api/preferencias/mias"), {
    headers: authJsonHeaders(token),
    cache: "no-store",
  });
  if (!r.ok) return null;
  return (await r.json()) as PreferenciasUsuario;
}

export async function guardarPreferencias(
  token: string,
  prefs: PreferenciasUsuario,
): Promise<PreferenciasUsuario | null> {
  const r = await fetch(apiUrl("/api/preferencias/mias"), {
    method: "PUT",
    headers: authJsonHeaders(token),
    body: JSON.stringify({
      evitarZonasOscurasNoche: prefs.evitarZonasOscurasNoche,
      modoMovilidadPredeterminado: prefs.modoMovilidadPredeterminado,
      alertasRiesgoTiempoReal: prefs.alertasRiesgoTiempoReal,
      avisoAutomaticoLlegada: prefs.avisoAutomaticoLlegada,
    }),
  });
  if (!r.ok) return null;
  return (await r.json()) as PreferenciasUsuario;
}

export async function avisoSinLlegada(
  token: string,
  destino: string,
): Promise<{ registrado: boolean; mensaje?: string } | null> {
  const r = await fetch(apiUrl("/api/preferencias/aviso-sin-llegada"), {
    method: "POST",
    headers: authJsonHeaders(token),
    body: JSON.stringify({ destino }),
  });
  if (!r.ok) return null;
  return (await r.json()) as { registrado: boolean; mensaje?: string };
}

export function esHorarioNocturno(): boolean {
  const h = new Date().getHours();
  return h >= 19 || h < 6;
}

export function modoToTransport(
  modo: string,
): "pedestrian" | "bike" {
  const m = modo.toLowerCase();
  return m === "bike" || m === "bicicleta" ? "bike" : "pedestrian";
}

/** Reordena y marca la ruta segura cuando aplica preferencia nocturna y peso admin. */
export function aplicarPreferenciaRutasNocturnas<
  T extends { id: string; descripcion: string; tag: string; tagClass: string },
>(
  opciones: T[],
  evitarZonasOscuras: boolean,
  pesoZonasOscurasPct = 40,
): T[] {
  if (!evitarZonasOscuras || !esHorarioNocturno()) return opciones;
  if (pesoZonasOscurasPct < 15) return opciones;

  const safe = opciones.find((o) => o.id === "safe");
  const rest = opciones.filter((o) => o.id !== "safe");
  if (!safe) return opciones;

  const intensidad =
    pesoZonasOscurasPct >= 70
      ? "alta"
      : pesoZonasOscurasPct >= 40
        ? "media"
        : "baja";

  const safeBoost = {
    ...safe,
    tag: "PRIORIDAD NOCHE",
    tagClass: "bg-indigo-600",
    descripcion: `Regla activa (peso zonas oscuras ${pesoZonasOscurasPct}% · ${intensidad}): ${safe.descripcion}`,
  };

  return [safeBoost, ...rest];
}
