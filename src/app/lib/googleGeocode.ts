import type { LatLngLiteral } from "../types/maps";
import { apiUrl, readApiErrorMessage } from "./api";
import {
  buildPeruGeocodeQuery,
  pickBestGeocodeResult,
} from "./limaGeocode";

/** Geocodificación vía backend (sin CORS ni constructores JS de Maps). */
async function geocodeViaBackend(address: string): Promise<LatLngLiteral> {
  const q = buildPeruGeocodeQuery(address);
  const r = await fetch(
    apiUrl(`/api/external/geocode?address=${encodeURIComponent(q)}`),
  );
  if (!r.ok) {
    throw new Error(
      await readApiErrorMessage(r, "No se pudo geocodificar la dirección."),
    );
  }
  const j = (await r.json()) as {
    status: string;
    results?: google.maps.GeocoderResult[];
  };
  if (j.status !== "OK" || !j.results?.length) {
    throw new Error(
      "No se encontró esa dirección. Incluye distrito o referencia en Lima.",
    );
  }
  const best = pickBestGeocodeResult(j.results, address);
  const loc = best.geometry.location;
  const lat =
    typeof loc.lat === "function" ? loc.lat() : Number((loc as { lat: number }).lat);
  const lng =
    typeof loc.lng === "function" ? loc.lng() : Number((loc as { lng: number }).lng);
  return { lat, lng };
}

export async function geocodificarDireccionGoogle(
  address: string,
): Promise<LatLngLiteral> {
  const trimmed = address.trim();
  if (!trimmed) {
    throw new Error("Escribe una dirección o lugar en Lima.");
  }

  return geocodeViaBackend(trimmed);
}
