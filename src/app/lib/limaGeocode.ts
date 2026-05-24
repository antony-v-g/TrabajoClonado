import type { LatLngBoundsLiteral } from "../types/maps";

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Caja aproximada de Lima y Callao (sesgo; no excluye resultados fuera).
 * Incluye p. ej. La Molina, Miraflores, norte/sur.
 */
export const LIMA_METRO_BOUNDS: LatLngBoundsLiteral = {
  south: -12.55,
  west: -77.3,
  north: -11.6,
  east: -76.6,
};

const DISTRITOS_O_ZONAS = [
  "La Molina",
  "Miraflores",
  "San Isidro",
  "Ate",
  "Surco",
  "Chorrillos",
  "Magdalena",
  "Cercado",
  "Breña",
  "Lince",
  "Rímac",
  "Callao",
  "Comas",
  "Lurigancho",
  "Los Olivos",
  "Independencia",
  "San Martín de Porres",
  "Jesús María",
  "Balconcillo",
  "Cieneguilla",
  "Pachacámac",
  "Pueblo Libre",
  "Puente Piedra",
  "Punta Negra",
  "Lurin",
  "Lurín",
  "Lima",
  "Canta",
  "Vitarte",
  "Ancón",
  "Chaclacayo",
  "Santiago de Surco",
  "Santa Maria del Mar",
  "Villa el Salvador",
];

function contieneZonaLima(s: string): boolean {
  const t = s.toLowerCase();
  for (const d of DISTRITOS_O_ZONAS) {
    if (t.includes(d.toLowerCase())) return true;
  }
  if (/\b(150\d{2,3}|153\d{2,3}\b|151\d{2,3})/.test(s)) {
    // códigos postales típicos de Lima/Perú
    return true;
  }
  if (/\blima\s+\d{4,5}\b/i.test(s)) {
    // "Lima 15024"
    return true;
  }
  return false;
}

/**
 * Evita duplicar "Lima" o "Perú" y alinea con cómo resuelve bien Google las direcciones
 * en el área metropolitana.
 */
export function buildPeruGeocodeQuery(address: string): string {
  const t = address
    .trim()
    .replace(/[\u00a0\n\r\t]+/g, " ")
    .replace(/,(,| )+/, ", ")
    .replace(/\s+/g, " ");
  if (!t) return t;
  if (/(?:Perú|Peru)\s*$/i.test(t)) return t;
  if (contieneZonaLima(t)) {
    return `${t}, Perú`;
  }
  return `${t}, Lima, Perú`;
}

/**
 * true si el campo de origen es el texto reservado para "solo GPS", no una dirección escrita.
 */
export function origenPideGpsFijo(text: string): boolean {
  const t = stripAccents(text.trim().toLowerCase().replace(/\s+/g, " "));
  if (!t) return false;
  if (t === "gps" || t === "aqui" || t === "here" || t === "aca") {
    return true;
  }
  if (/^mi(\s+)?ubicacion(\s+actual)?$/.test(t)) return true;
  if (/^ubicacion(\s+actual)?$/.test(t)) return true;
  return false;
}

/**
 * El primer resultado del Geocoder a menudo es "Lima" (zona extensa) en APPROXIMATE;
 * se prefiere calle/número con ROOFTOP o comparable.
 * @param userInput texto de búsqueda (sin el sufijo "Perú") para bonificar el distrito
 */
export function pickBestGeocodeResult(
  results: google.maps.GeocoderResult[],
  userInput = "",
): google.maps.GeocoderResult {
  if (results.length === 0) {
    throw new Error("Geocodificación sin resultados");
  }
  if (results.length === 1) return results[0]!;

  const readCoord = (p: google.maps.LatLng | { lat: number; lng: number }) => {
    if (typeof (p as google.maps.LatLng).lat === "function") {
      const ll = p as google.maps.LatLng;
      return { lat: ll.lat(), lng: ll.lng() };
    }
    const o = p as { lat: number; lng: number };
    return { lat: Number(o.lat), lng: Number(o.lng) };
  };

  const inBounds = (r: google.maps.GeocoderResult) => {
    const p = r.geometry?.location;
    if (!p) return false;
    const { lat, lng } = readCoord(p);
    return (
      lat >= LIMA_METRO_BOUNDS.south &&
      lat <= LIMA_METRO_BOUNDS.north &&
      lng >= LIMA_METRO_BOUNDS.west &&
      lng <= LIMA_METRO_BOUNDS.east
    );
  };

  const userNorm = stripAccents(userInput.toLowerCase());
  const score = (r: google.maps.GeocoderResult) => {
    const lt = (r.geometry?.location_type ?? "APPROXIMATE") as string;
    let s = 0;
    if (lt === "ROOFTOP") s += 100;
    else if (lt === "RANGE_INTERPOLATED") s += 85;
    else if (lt === "GEOMETRIC_CENTER") s += 55;
    else s += 28; // APPROXIMATE
    const types = r.types ?? [];
    for (const k of ["street_address", "intersection", "route"] as const) {
      if (types.includes(k)) s += 32;
    }
    if (types.includes("subpremise") || types.includes("street_number")) s += 8;
    if (types.includes("premise") || types.includes("establishment")) s += 22;
    if (types.includes("point_of_interest") || types.includes("park")) s += 10;
    if (r.partial_match) s -= 5;
    if (types.length === 2 && types.includes("locality") && types.includes("political")) {
      s -= 30;
    }
    if (types.length <= 1 && (types[0] === "locality" || types[0] === "administrative_area_level_1")) {
      s -= 25;
    }
    if (inBounds(r)) s += 10;
    const fa = stripAccents((r.formatted_address ?? "").toLowerCase());
    for (const d of DISTRITOS_O_ZONAS) {
      const raw = d.trim();
      if (raw.length < 3 || raw.toLowerCase() === "lima") continue;
      const dl = stripAccents(d.toLowerCase());
      if (userNorm.length > 2 && userNorm.includes(dl) && fa.includes(dl)) s += 20;
    }
    if (/^lima,?\s+per(ú|u)\s*$/i.test(fa.split(",").map((x) => x.trim()).join(", "))) {
      s -= 35;
    }
    if (/^per(ú|u),?\s*lima$/i.test(fa.replace(/\s/g, " "))) s -= 25;
    if (types.includes("locality") && !types.some((t) => t === "route" || t === "street_address") && s < 90) {
      s -= 12;
    }
    return s;
  };

  return [...results].sort((a, b) => score(b) - score(a))[0]!;
}
