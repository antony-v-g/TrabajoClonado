import { apiUrl } from "./api";

export type ReglasSistema = {
  pesoZonasOscurasPct: number;
  caducidadReporteMenorHoras: number;
  mensajePeso: string;
  mensajeCaducidad: string;
};

export async function fetchReglasSistema(): Promise<ReglasSistema | null> {
  try {
    const r = await fetch(apiUrl("/api/config/reglas-sistema"), {
      cache: "no-store",
    });
    if (!r.ok) return null;
    return (await r.json()) as ReglasSistema;
  } catch {
    return null;
  }
}
