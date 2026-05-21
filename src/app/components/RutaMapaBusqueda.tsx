import { useCallback, useRef, useEffect, useState } from "react";
import { useJsApiLoader, GoogleMap, Marker, Polyline } from "@react-google-maps/api";
import type { LatLngLiteral } from "../types/maps";
import {
  getGoogleMapsApiKey,
  getGoogleMapsLoaderConfig,
  GOOGLE_MAPS_LOADER_DISABLED,
} from "../lib/mapsEnv";
import { GoogleMapsKeyTroubleshoot } from "./GoogleMapsKeyTroubleshoot";
import { LIMA_CENTRO } from "./GoogleMap";

const mapContainer = (h: number) => ({
  width: "100%",
  height: `${h}px`,
  borderRadius: "1.5rem",
});

type PathLayer = {
  id: string;
  color: string;
  path: LatLngLiteral[];
  opacity?: number;
  strokeWeight?: number;
};

type RutaMapaBusquedaProps = {
  origin: LatLngLiteral | null;
  dest: LatLngLiteral | null;
  paths: PathLayer[];
  height?: number;
  highlightId?: string | null;
};

export function RutaMapaBusqueda({
  origin,
  dest,
  paths,
  height = 340,
  highlightId,
}: RutaMapaBusquedaProps) {
  const mapKey = getGoogleMapsApiKey();
  const mapRef = useRef<google.maps.Map | null>(null);
  const [apiKeyRejected, setApiKeyRejected] = useState(false);
  const { isLoaded, loadError } = useJsApiLoader(
    mapKey
      ? getGoogleMapsLoaderConfig(mapKey)
      : GOOGLE_MAPS_LOADER_DISABLED,
  );

  useEffect(() => {
    if (!isLoaded || !mapKey) return;
    const w = window as Window & { gm_authFailure?: () => void };
    w.gm_authFailure = () => setApiKeyRejected(true);
    return () => {
      w.gm_authFailure = undefined;
    };
  }, [isLoaded, mapKey]);

  const onMapLoad = useCallback(
    (map: google.maps.Map) => {
      mapRef.current = map;
    },
    [],
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !origin || !dest) return;
    const b = new google.maps.LatLngBounds();
    b.extend(origin);
    b.extend(dest);
    paths.forEach((p) => p.path.forEach((pt) => b.extend(pt)));
    map.fitBounds(b, 64);
  }, [origin, dest, paths]);

  if (!mapKey) {
    return (
      <div
        className="grid place-items-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500 p-8"
        style={{ minHeight: height }}
      >
        Configura <code className="mx-1">VITE_GOOGLE_MAPS_API_KEY</code> para ver el mapa.
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        className="grid place-items-center p-4 overflow-auto"
        style={{ minHeight: height }}
      >
        <GoogleMapsKeyTroubleshoot />
      </div>
    );
  }

  if (apiKeyRejected) {
    return (
      <div
        className="grid place-items-center p-4 overflow-auto"
        style={{ minHeight: height }}
      >
        <GoogleMapsKeyTroubleshoot />
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div
        className="grid place-items-center rounded-3xl border border-slate-200 bg-slate-50"
        style={{ minHeight: height }}
      >
        Cargando mapa…
      </div>
    );
  }

  const center = origin ?? dest ?? LIMA_CENTRO;

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 shadow-sm">
      <GoogleMap
        mapContainerStyle={mapContainer(height)}
        center={center}
        zoom={13}
        onLoad={onMapLoad}
        options={{
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: true,
        }}
      >
        {origin ? (
          <Marker
            position={origin}
            label={{ text: "A", color: "white", fontWeight: "bold" }}
            title="Origen"
          />
        ) : null}
        {dest ? (
          <Marker
            position={dest}
            label={{ text: "B", color: "white", fontWeight: "bold" }}
            title="Destino"
          />
        ) : null}
        {paths.map((layer) => {
          const isHi = highlightId === layer.id;
          return (
            <Polyline
              key={layer.id}
              path={layer.path}
              options={{
                strokeColor: layer.color,
                strokeOpacity: layer.opacity ?? (isHi ? 0.95 : 0.45),
                strokeWeight: layer.strokeWeight ?? (isHi ? 6 : 4),
                zIndex: isHi ? 3 : 1,
              }}
            />
          );
        })}
      </GoogleMap>
    </div>
  );
}
