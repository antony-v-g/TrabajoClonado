import { formatDistanceToNow, isToday, isYesterday } from "date-fns";
import { es } from "date-fns/locale";

/** Fechas de la API (.NET UTC) → Date correcto en el navegador. */
export function parseApiDate(iso: string): Date {
  const t = iso?.trim();
  if (!t) return new Date();
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(t)) {
    return new Date(t);
  }
  return new Date(`${t.endsWith("Z") ? t.slice(0, -1) : t}Z`);
}

/** Hora real de envío: relativo reciente o fecha+hora local (Perú). */
export function formatoTiempoEnvio(iso: string): string {
  try {
    const d = parseApiDate(iso);
    if (Number.isNaN(d.getTime())) return "Reciente";

    const diffMs = Date.now() - d.getTime();
    if (diffMs >= 0 && diffMs < 90_000) {
      return "Ahora mismo";
    }
    if (diffMs >= 0 && diffMs < 86_400_000 * 2) {
      const rel = formatDistanceToNow(d, { addSuffix: true, locale: es });
      if (isToday(d)) {
        const hora = d.toLocaleTimeString("es-PE", {
          hour: "numeric",
          minute: "2-digit",
        });
        return `Hoy, ${hora} (${rel})`;
      }
      if (isYesterday(d)) {
        const hora = d.toLocaleTimeString("es-PE", {
          hour: "numeric",
          minute: "2-digit",
        });
        return `Ayer, ${hora} (${rel})`;
      }
      return rel;
    }

    return d.toLocaleString("es-PE", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "Reciente";
  }
}

export function formatoFechaPerfil(iso: string): string {
  try {
    return parseApiDate(iso).toLocaleString("es-PE", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}
