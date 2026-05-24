import { useEffect } from "react";

export type HeatmapPoint = { lat: number; lng: number; weight?: number };

/**
 * Capa de calor sin HeatmapLayer (Google lo eliminó en Maps JS API 3.65+).
 * Usa círculos semitransparentes superpuestos.
 */
export function useMapHeatmapOverlay(
  map: google.maps.Map | null,
  points: HeatmapPoint[] | null | undefined,
  enabled: boolean,
) {
  useEffect(() => {
    if (!map || !enabled || !points?.length) return;

    const circles: google.maps.Circle[] = [];

    for (const p of points) {
      const w = Math.max(0.5, Math.min(p.weight ?? 1, 3));
      const rings = [
        { radius: 220, opacity: 0.07 * w, color: "#fbbf24" },
        { radius: 150, opacity: 0.11 * w, color: "#f97316" },
        { radius: 90, opacity: 0.16 * w, color: "#ef4444" },
        { radius: 45, opacity: 0.22 * w, color: "#dc2626" },
      ];
      for (const ring of rings) {
        circles.push(
          new google.maps.Circle({
            map,
            center: { lat: p.lat, lng: p.lng },
            radius: ring.radius,
            fillColor: ring.color,
            fillOpacity: Math.min(ring.opacity, 0.5),
            strokeWeight: 0,
            clickable: false,
            zIndex: 1,
          }),
        );
      }
    }

    return () => {
      for (const c of circles) c.setMap(null);
    };
  }, [map, points, enabled]);
}
