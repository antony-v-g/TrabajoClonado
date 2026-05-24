import type { LatLngLiteral } from "../types/maps";
import { apiUrl } from "./api";
import { buildRoutePath, haversineKm, hashString } from "./geo";

export type RutaDirectionsInput = {
  id: string;
  tag: string;
  tagClass: string;
  nombre: string;
  nivel: string;
  nivelClass: string;
  descripcion: string;
  minutos: number;
  km: number;
  color: string;
  path: LatLngLiteral[];
};

const ROUTE_META: Record<
  string,
  { tag: string; tagClass: string; nombre: string; nivel: string; nivelClass: string; color: string }
> = {
  fast: {
    tag: "MÁS RÁPIDA",
    tagClass: "bg-amber-500",
    nombre: "Ruta directa",
    nivel: "Nivel: Medio",
    nivelClass: "text-amber-600",
    color: "#f59e0b",
  },
  balanced: {
    tag: "EQUILIBRADA",
    tagClass: "bg-blue-500",
    nombre: "Ruta intermedia",
    nivel: "Nivel: Medio–Alto",
    nivelClass: "text-blue-600",
    color: "#3b82f6",
  },
  safe: {
    tag: "MÁS SEGURA",
    tagClass: "bg-emerald-500",
    nombre: "Ruta alternativa",
    nivel: "Nivel: Alto",
    nivelClass: "text-emerald-600",
    color: "#10b981",
  },
};

const DESC_BY_ID: Record<string, string> = {
  safe: "Calculada con Google Directions — trayectoria alternativa (suele ser más larga y evita atajos estrechos).",
  fast: "Calculada con Google Directions — la opción más corta en tiempo.",
  balanced: "Calculada con Google Directions — equilibrio entre distancia y tiempo.",
};

function decodeEncodedPolyline(encoded: string): LatLngLiteral[] {
  const points: LatLngLiteral[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

type DirectionsRouteLike = {
  legs?: Array<{
    distance?: { value?: number };
    duration?: { value?: number };
    start_location?: { lat: number; lng: number };
    end_location?: { lat: number; lng: number };
  }>;
  overview_polyline?: { points?: string };
};

function decodeRoutePath(route: DirectionsRouteLike): LatLngLiteral[] {
  const poly = route.overview_polyline?.points;
  if (poly) {
    return decodeEncodedPolyline(poly);
  }
  return [];
}

function routeStats(route: DirectionsRouteLike) {
  let meters = 0;
  let seconds = 0;
  for (const leg of route.legs ?? []) {
    meters += leg.distance?.value ?? 0;
    seconds += leg.duration?.value ?? 0;
  }
  return {
    km: meters / 1000,
    minutos: Math.max(1, Math.round(seconds / 60)),
  };
}

function assignRouteIds(
  routes: DirectionsRouteLike[],
): Array<{ route: DirectionsRouteLike; id: string }> {
  const scored = routes.map((route, index) => {
    const { minutos, km } = routeStats(route);
    return { route, index, minutos, km };
  });
  if (scored.length === 0) return [];
  if (scored.length === 1) {
    return [{ route: scored[0]!.route, id: "balanced" }];
  }

  const byDuration = [...scored].sort((a, b) => a.minutos - b.minutos);
  const fast = byDuration[0]!;
  const slow = byDuration[byDuration.length - 1]!;
  const mid =
    byDuration.find((x) => x.index !== fast.index && x.index !== slow.index) ??
    byDuration[Math.floor(byDuration.length / 2)]!;

  const assigned = new globalThis.Map<number, string>();
  assigned.set(fast.index, "fast");
  assigned.set(slow.index, "safe");
  assigned.set(mid.index, "balanced");

  return scored.map(({ route, index }) => ({
    route,
    id: assigned.get(index) ?? "balanced",
  }));
}

function toRutaOption(
  route: DirectionsRouteLike,
  id: string,
  destinoTexto: string,
): RutaDirectionsInput {
  const meta = ROUTE_META[id] ?? ROUTE_META.balanced;
  const { km, minutos } = routeStats(route);
  const path = decodeRoutePath(route);
  const leg0 = route.legs?.[0];
  const start = leg0?.start_location;
  const end = leg0?.end_location;
  const fallbackPath =
    path.length >= 2
      ? path
      : buildRoutePath(
          start ? { lat: start.lat, lng: start.lng } : { lat: 0, lng: 0 },
          end ? { lat: end.lat, lng: end.lng } : { lat: 0, lng: 0 },
          hashString(id + destinoTexto) % 3,
        );

  return {
    id,
    tag: meta.tag,
    tagClass: meta.tagClass,
    nombre: meta.nombre,
    nivel: meta.nivel,
    nivelClass: meta.nivelClass,
    descripcion: DESC_BY_ID[id] ?? DESC_BY_ID.balanced!,
    minutos,
    km: km > 0 ? km : haversineKm(fallbackPath[0]!, fallbackPath[fallbackPath.length - 1]!),
    color: meta.color,
    path: fallbackPath,
  };
}

function routesFromDirectionsPayload(
  routes: DirectionsRouteLike[],
  destinoTexto: string,
): RutaDirectionsInput[] {
  const assigned = assignRouteIds(routes.slice(0, 3));
  const opts = assigned.map(({ route, id }) => toRutaOption(route, id, destinoTexto));
  const byId = new globalThis.Map<string, RutaDirectionsInput>();
  for (const op of opts) {
    if (!byId.has(op.id)) byId.set(op.id, op);
  }
  const order: Array<"safe" | "fast" | "balanced"> = ["safe", "fast", "balanced"];
  const ordered = order
    .map((id) => byId.get(id))
    .filter((x): x is RutaDirectionsInput => x != null);
  return ordered.length > 0 ? ordered : opts;
}

async function fetchDirectionsViaBackend(
  origin: LatLngLiteral,
  dest: LatLngLiteral,
  mode: "pedestrian" | "bike",
  destinoTexto: string,
): Promise<RutaDirectionsInput[] | null> {
  const travelMode = mode === "bike" ? "bicycling" : "walking";
  const params = new URLSearchParams({
    originLat: String(origin.lat),
    originLng: String(origin.lng),
    destLat: String(dest.lat),
    destLng: String(dest.lng),
    mode: travelMode,
  });
  const r = await fetch(apiUrl(`/api/external/directions?${params}`));
  if (!r.ok) return null;
  const j = (await r.json()) as {
    status: string;
    routes?: DirectionsRouteLike[];
  };
  if (j.status !== "OK" || !j.routes?.length) return null;
  return routesFromDirectionsPayload(j.routes, destinoTexto);
}

/**
 * Obtiene hasta 3 rutas con Google Directions vía backend.
 * Si falla, devuelve null y la UI usa rutas simuladas.
 */
export async function fetchGoogleDirectionsRoutes(
  origin: LatLngLiteral,
  dest: LatLngLiteral,
  mode: "pedestrian" | "bike",
  destinoTexto: string,
): Promise<RutaDirectionsInput[] | null> {
  try {
    return await fetchDirectionsViaBackend(origin, dest, mode, destinoTexto);
  } catch {
    return null;
  }
}
