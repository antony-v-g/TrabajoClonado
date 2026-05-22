import {
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import {
  useJsApiLoader,
  GoogleMap,
  Marker,
  InfoWindow,
} from "@react-google-maps/api";
import type { LatLngLiteral } from "../types/maps";
import {
  getGoogleMapsApiKey,
  getGoogleMapsLoaderConfig,
  GOOGLE_MAPS_LOADER_DISABLED,
  hasPlaceholderMapsKey,
} from "../lib/mapsEnv";
import { GoogleMapsKeyTroubleshoot } from "./GoogleMapsKeyTroubleshoot";

const containerStyle = {
  width: "100%",
  height: "100%",
};

const defaultCenter: LatLngLiteral = {
  lat: -12.046374,
  lng: -77.042793,
};

const defaultMarkers: Array<{
  id: string;
  position: LatLngLiteral;
  title: string;
  color: string;
  label: string;
}> = [
  {
    id: "risk",
    position: { lat: -12.0458, lng: -77.0435 },
    title: "Robos recientes",
    color: "#ef4444",
    label: "R",
  },
  {
    id: "user",
    position: { lat: -12.046374, lng: -77.042793 },
    title: "Tú",
    color: "#4338ca",
    label: "T",
  },
];

export const LIMA_CENTRO: LatLngLiteral = defaultCenter;

export type MapaMarcadorDinamico = {
  id: string;
  lat: number;
  lng: number;
  title: string;
  label: string;
  color: string;
  descripcion?: string;
};

type GoogleMapViewProps = {
  center?: LatLngLiteral;
  zoom?: number;
  children?: ReactNode;
  /** Marcador de la última búsqueda (Places). */
  focusPin?: LatLngLiteral | null;
  /**
   * Si se envía y no está vacío, reemplaza los pins por defecto (p. ej. reportes reales con coordenadas).
   */
  marcadoresDinamicos?: MapaMarcadorDinamico[] | null;
};

export function GoogleMapView({
  center,
  zoom,
  children,
  focusPin,
  marcadoresDinamicos,
}: GoogleMapViewProps) {
  const mapKey = getGoogleMapsApiKey();
  const [selectedMarker, setSelectedMarker] = useState<string | null>(null);
  const [apiKeyRejected, setApiKeyRejected] = useState(false);

  const { isLoaded, loadError } = useJsApiLoader(
    mapKey ? getGoogleMapsLoaderConfig(mapKey) : GOOGLE_MAPS_LOADER_DISABLED,
  );

  useEffect(() => {
    if (!isLoaded || !mapKey) return;
    const w = window as Window & { gm_authFailure?: () => void };
    w.gm_authFailure = () => setApiKeyRejected(true);
    return () => {
      w.gm_authFailure = undefined;
    };
  }, [isLoaded, mapKey]);

  const onMarkerClick = useCallback((id: string) => {
    setSelectedMarker(id);
  }, []);

  const mapCenter = useMemo(() => center ?? defaultCenter, [center]);
  const mapZoom = zoom ?? 15;
  const mapRef = useRef<google.maps.Map | null>(null);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !center) return;
    map.panTo(center);
    if (zoom != null) map.setZoom(zoom);
  }, [center, zoom]);

  const marcadoresEnMapa = useMemo(() => {
    if (marcadoresDinamicos != null) {
      if (marcadoresDinamicos.length === 0) return [];
      return marcadoresDinamicos.map((m) => ({
        id: m.id,
        position: { lat: m.lat, lng: m.lng } as LatLngLiteral,
        title: m.title,
        color: m.color,
        label: m.label,
        descripcion: m.descripcion,
      }));
    }
    return defaultMarkers.map((m) => ({
      ...m,
      descripcion:
        m.id === "risk"
          ? "Zona de riesgo (demo) — sin reportes con coordenadas aún."
          : "Punto de referencia (demo).",
    }));
  }, [marcadoresDinamicos]);

  if (hasPlaceholderMapsKey()) {
    return (
      <div className="h-full grid place-items-center text-center px-6">
        <div className="max-w-md rounded-2xl border border-rose-200 bg-rose-50 p-5 text-left text-sm text-rose-900">
          <p className="font-bold text-base mb-2">
            El archivo .env tiene un valor de ejemplo, no una clave real
          </p>
          <p className="mb-3">
            Ahora mismo está algo como{" "}
            <code className="bg-white px-1 rounded">YOUR_GOOGLE_MAPS_API_KEY</code>.
            Debe ser una clave que empiece por{" "}
            <code className="bg-white px-1 rounded">AIza</code>, creada en Google
            Cloud → Credenciales.
          </p>
          <p>
            Después de guardar <code className="bg-white px-1 rounded">.env</code>,
            ejecuta <code className="bg-white px-1 rounded">npm run start:api</code> y
            recarga el mapa.
          </p>
        </div>
      </div>
    );
  }

  if (!mapKey) {
    return (
      <div className="h-full grid place-items-center text-center px-6">
        <div className="max-w-md">
          <p className="text-slate-700 font-bold mb-2">
            Clave de Google Maps no configurada.
          </p>
          <p className="text-sm text-slate-500 mb-4 text-left">
            1) En la raíz del proyecto (junto a <code className="bg-slate-100 px-1 rounded text-xs">package.json</code>), archivo{" "}
            <code className="bg-slate-100 px-1 rounded text-xs">.env</code> con{" "}
            <code className="bg-slate-100 px-1 rounded text-xs">VITE_GOOGLE_MAPS_API_KEY=AIza...</code>
          </p>
          <p className="text-sm text-slate-500 text-left">
            2) Ejecuta <code className="bg-slate-100 px-1 rounded text-xs">npm run start:api</code> (Vite solo lee .env al compilar).
          </p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="h-full grid place-items-center px-4 py-8">
        <GoogleMapsKeyTroubleshoot />
      </div>
    );
  }

  if (apiKeyRejected) {
    return (
      <div className="h-full grid place-items-center overflow-auto px-4 py-8">
        <GoogleMapsKeyTroubleshoot />
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="h-full grid place-items-center text-slate-700">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-3 shadow">
          Cargando mapa…
        </span>
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={mapCenter}
      zoom={mapZoom}
      onLoad={onMapLoad}
      options={{
        streetViewControl: false,
        fullscreenControl: false,
        mapTypeControl: false,
      }}
    >
      {children
        ? children
        : marcadoresEnMapa.map((marker) => (
            <Marker
              key={marker.id}
              position={marker.position}
              onClick={() => onMarkerClick(marker.id)}
              label={{
                text: marker.label,
                color: "white",
                fontWeight: "bold",
              }}
              icon={{
                path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z",
                fillColor: marker.color,
                fillOpacity: 1,
                strokeWeight: 0,
                scale: 1.4,
              }}
            />
          ))}

      {!children && focusPin ? (
        <Marker
          position={focusPin}
          zIndex={50}
          title="Búsqueda"
          label={{ text: "B", color: "white", fontWeight: "bold" }}
          icon={{
            path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z",
            fillColor: "#0d9488",
            fillOpacity: 1,
            strokeWeight: 0,
            scale: 1.5,
          }}
        />
      ) : null}

      {!children && selectedMarker ? (
        <InfoWindow
          position={
            marcadoresEnMapa.find((item) => item.id === selectedMarker)!.position
          }
          onCloseClick={() => setSelectedMarker(null)}
        >
          <div className="max-w-xs">
            <strong className="block text-sm font-bold text-slate-900">
              {marcadoresEnMapa.find((item) => item.id === selectedMarker)!.title}
            </strong>
            <p className="text-xs text-slate-500 mt-1">
              {marcadoresEnMapa.find((item) => item.id === selectedMarker)
                ?.descripcion || "Detalle de ubicación."}
            </p>
          </div>
        </InfoWindow>
      ) : null}
    </GoogleMap>
  );
}
