import { useRef, useState, useCallback } from "react";
import {
  MapPin,
  Search,
  Navigation2,
  CheckCircle2,
  ShieldAlert,
} from "lucide-react";
import { useJsApiLoader, StandaloneSearchBox } from "@react-google-maps/api";
import { GoogleMapView, LIMA_CENTRO } from "../components/GoogleMap";
import {
  getGoogleMapsApiKey,
  getGoogleMapsLoaderConfig,
  GOOGLE_MAPS_LOADER_DISABLED,
} from "../lib/mapsEnv";
import type { LatLngLiteral } from "../types/maps";

/** Sesgo hacia Lima/Callao para predicciones del buscador. */
const LIMA_SEARCH_BOUNDS = {
  north: -11.75,
  south: -12.55,
  west: -77.25,
  east: -76.65,
} as const;

export default function Mapa() {
  const mapKey = getGoogleMapsApiKey();
  const { isLoaded } = useJsApiLoader(
    mapKey
      ? getGoogleMapsLoaderConfig(mapKey)
      : GOOGLE_MAPS_LOADER_DISABLED,
  );
  const searchBoxRef = useRef<google.maps.places.SearchBox | null>(null);
  const [mapCenter, setMapCenter] = useState<LatLngLiteral>(LIMA_CENTRO);
  const [mapZoom, setMapZoom] = useState(15);
  const [focusPin, setFocusPin] = useState<LatLngLiteral | null>(null);

  const onPlacesChanged = useCallback(() => {
    const sb = searchBoxRef.current;
    if (!sb) return;
    const places = sb.getPlaces();
    const p = places?.[0];
    if (!p?.geometry?.location) return;
    const lat = p.geometry.location.lat();
    const lng = p.geometry.location.lng();
    setMapCenter({ lat, lng });
    setMapZoom(16);
    setFocusPin({ lat, lng });
  }, []);

  const showSearch = Boolean(mapKey && isLoaded);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 h-full flex flex-col">
      <header className="flex flex-col gap-4 md:flex-row md:items-center justify-between bg-white p-5 rounded-3xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-3xl font-black text-slate-900">Tu Ubicación</h1>
          <p className="text-slate-500 text-sm mt-1">
            Zonas de riesgo en tiempo real
          </p>
        </div>
        <div className="relative w-full md:w-[420px]">
          <Search className="pointer-events-none absolute left-4 top-1/2 z-10 w-5 h-5 -translate-y-1/2 text-slate-400" />
          {showSearch ? (
            <StandaloneSearchBox
              onLoad={(ref) => {
                searchBoxRef.current = ref;
              }}
              onPlacesChanged={onPlacesChanged}
              bounds={LIMA_SEARCH_BOUNDS}
            >
              <input
                type="text"
                placeholder="Buscar en Lima: calles, plazas, colegios…"
                className="w-full rounded-3xl border border-slate-200 bg-slate-100 py-3 pl-14 pr-4 text-sm font-medium text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
            </StandaloneSearchBox>
          ) : (
            <input
              type="text"
              disabled
              placeholder={
                !mapKey
                  ? "Configura VITE_GOOGLE_MAPS_API_KEY en .env"
                  : "Cargando búsqueda con Google…"
              }
              className="w-full cursor-not-allowed rounded-3xl border border-slate-200 bg-slate-100 py-3 pl-14 pr-4 text-sm text-slate-500"
            />
          )}
        </div>
      </header>

      <div className="flex-1 min-h-[520px] overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-100 shadow-sm relative">
        <div className="absolute inset-0 bg-gradient-to-r from-slate-100 via-white to-slate-100 opacity-80 pointer-events-none" />
        <div className="absolute inset-0">
          <GoogleMapView
            center={mapCenter}
            zoom={mapZoom}
            focusPin={focusPin}
          />
        </div>

        <div className="absolute top-6 right-6 z-20 flex flex-col gap-3">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-indigo-700 shadow-lg shadow-slate-200 transition hover:bg-slate-50"
          >
            <Navigation2 className="w-5 h-5" />
            <span className="hidden md:inline">Compartir Trayecto</span>
          </button>
        </div>

        <div className="pointer-events-none absolute bottom-6 left-6 right-6 z-20 flex items-end justify-between">
          <button
            type="button"
            className="pointer-events-auto inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3.5 text-sm font-black text-white shadow-lg shadow-emerald-200 transition hover:-translate-y-0.5 hover:bg-emerald-600"
          >
            <CheckCircle2 className="w-5 h-5" /> Llegué Bien
          </button>

          <div className="pointer-events-auto flex flex-col items-end gap-4">
            <button
              type="button"
              className="rounded-xl bg-white p-3.5 text-slate-700 shadow-lg shadow-slate-200 transition hover:bg-slate-50"
            >
              <MapPin className="h-6 w-6" />
            </button>
            <button
              type="button"
              className="flex items-center gap-2 rounded-[1.75rem] bg-red-600 px-5 py-3 text-white font-black shadow-lg shadow-red-200 transition hover:scale-[1.02] hover:bg-red-700"
            >
              <ShieldAlert className="h-6 w-6" /> SOS
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
