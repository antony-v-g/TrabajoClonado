import { useRef, useState, useCallback, useEffect } from "react";
import {
  MapPin,
  Search,
  Navigation2,
  Loader2,
  AlertTriangle,
  Layers,
  Route,
  FileWarning,
} from "lucide-react";
import { Link } from "react-router";
import { useJsApiLoader, StandaloneSearchBox } from "@react-google-maps/api";
import {
  GoogleMapView,
  LIMA_CENTRO,
  type MapaMarcadorDinamico,
} from "../components/GoogleMap";
import {
  getGoogleMapsApiKey,
  getGoogleMapsLoaderConfig,
  GOOGLE_MAPS_LOADER_DISABLED,
} from "../lib/mapsEnv";
import type { LatLngLiteral } from "../types/maps";
import { useAuth } from "../contexts/AuthContext";
import { apiUrl, authJsonHeaders } from "../lib/api";
import {
  fetchPreferencias,
  type PreferenciasUsuario,
} from "../lib/preferenciasUsuario";
import { fetchReglasSistema, type ReglasSistema } from "../lib/reglasSistema";

const LIMA_SEARCH_BOUNDS = {
  north: -11.75,
  south: -12.55,
  west: -77.25,
  east: -76.65,
} as const;

type MapaContexto = {
  cacheRedisActivo: boolean;
  servidoDesdeCache: boolean;
  nivelZonaMl: string;
  indicadorZona: string;
  etiquetaZona: string;
  confianzaMlPct?: number;
  reportesZona30d: number;
  pesoZonasOscurasPct?: number;
  caducidadReporteMenorHoras?: number;
};

type MapaIncidentesResponse = {
  incidentes: Array<{
    id: number;
    tipo: string;
    lat: number;
    lng: number;
    ubicacion: string;
    descripcion?: string | null;
    color: string;
    label: string;
    esMenor?: boolean;
  }>;
  total: number;
  cacheRedisActivo: boolean;
  servidoDesdeCache: boolean;
};

function rutaDesdeMapa(destino: string) {
  const d = destino.trim();
  if (!d || d === "Lima, Perú" || d === "Mi ubicación actual")
    return "/rutas";
  return `/rutas?destino=${encodeURIComponent(d)}`;
}

function reportarDesdeMapa(ubicacion: string, pin: LatLngLiteral | null) {
  const q = new URLSearchParams({ ubicacion });
  if (pin) {
    q.set("lat", String(pin.lat));
    q.set("lng", String(pin.lng));
  }
  return `/reportar?${q}`;
}

export default function Mapa() {
  const { token } = useAuth();
  const mapKey = getGoogleMapsApiKey();
  const { isLoaded } = useJsApiLoader(
    mapKey
      ? getGoogleMapsLoaderConfig(mapKey)
      : GOOGLE_MAPS_LOADER_DISABLED,
  );
  const searchBoxRef = useRef<google.maps.places.SearchBox | null>(null);
  const [mapCenter, setMapCenter] = useState<LatLngLiteral>(LIMA_CENTRO);
  const [mapZoom, setMapZoom] = useState(14);
  const [focusPin, setFocusPin] = useState<LatLngLiteral | null>(null);
  const [ubicacionTexto, setUbicacionTexto] = useState("Lima, Perú");
  const [contexto, setContexto] = useState<MapaContexto | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [capaIncidentes, setCapaIncidentes] = useState(true);
  const [incidentes, setIncidentes] = useState<MapaMarcadorDinamico[] | null>(
    null,
  );
  const [cargandoIncidentes, setCargandoIncidentes] = useState(false);
  const [prefs, setPrefs] = useState<PreferenciasUsuario | null>(null);
  const [reglas, setReglas] = useState<ReglasSistema | null>(null);

  const onPlacesChanged = useCallback(() => {
    const sb = searchBoxRef.current;
    if (!sb) return;
    const places = sb.getPlaces();
    const p = places?.[0];
    if (!p?.geometry?.location) return;
    const lat = p.geometry.location.lat();
    const lng = p.geometry.location.lng();
    const nombre = p.name || p.formatted_address || "Ubicación seleccionada";
    setMapCenter({ lat, lng });
    setMapZoom(16);
    setFocusPin({ lat, lng });
    setUbicacionTexto(nombre);
  }, []);

  const cargarContexto = useCallback(async () => {
    if (!token) return;
    setAnalizando(true);
    try {
      const q = new URLSearchParams({ ubicacion: ubicacionTexto });
      const r = await fetch(apiUrl(`/api/mapa/contexto?${q}`), {
        headers: authJsonHeaders(token),
        cache: "no-store",
      });
      if (r.ok) setContexto((await r.json()) as MapaContexto);
    } finally {
      setAnalizando(false);
    }
  }, [token, ubicacionTexto]);

  const cargarIncidentes = useCallback(async () => {
    setCargandoIncidentes(true);
    try {
      const r = await fetch(
        apiUrl("/api/mapa/incidentes?maxDays=30&take=40"),
        { cache: "no-store" },
      );
      if (!r.ok) {
        setIncidentes([]);
        return;
      }
      const data = (await r.json()) as MapaIncidentesResponse;
      const marcadores: MapaMarcadorDinamico[] = (data.incidentes ?? []).map(
        (i) => ({
          id: String(i.id),
          lat: i.lat,
          lng: i.lng,
          title: i.esMenor
            ? `· Reciente — ${i.tipo}: ${i.ubicacion}`
            : `${i.tipo}: ${i.ubicacion}`,
          label: i.label,
          color: i.color,
          descripcion: i.descripcion?.trim() || i.ubicacion,
        }),
      );
      setIncidentes(marcadores);
    } catch {
      setIncidentes([]);
    } finally {
      setCargandoIncidentes(false);
    }
  }, []);

  useEffect(() => {
    void cargarIncidentes();
  }, [cargarIncidentes]);

  useEffect(() => {
    void cargarContexto();
  }, [cargarContexto]);

  useEffect(() => {
    if (!token) return;
    void fetchPreferencias(token).then(setPrefs);
  }, [token]);

  useEffect(() => {
    void fetchReglasSistema().then(setReglas);
  }, []);

  const showSearch = Boolean(mapKey && isLoaded);
  const zonaPeligrosa =
    prefs?.alertasRiesgoTiempoReal &&
    contexto &&
    (contexto.nivelZonaMl.toLowerCase().includes("peligro") ||
      contexto.nivelZonaMl.toLowerCase().includes("moder"));

  return (
    <div className="space-y-5 animate-in fade-in duration-500 h-full flex flex-col">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between bg-white p-5 rounded-3xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-3xl font-black text-slate-900">Explorar mapa</h1>
          <p className="text-slate-500 text-sm mt-1 max-w-lg">
            Consulta incidentes de la comunidad y el nivel de seguridad del lugar
            que buscas. Para ir de un punto A a B con rutas, usa Buscar ruta.
          </p>
        </div>
        <div className="relative w-full lg:w-[400px] shrink-0">
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
                placeholder="Buscar en Lima: calles, plazas…"
                className="w-full rounded-3xl border border-slate-200 bg-slate-100 py-3 pl-14 pr-4 text-sm font-medium text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
            </StandaloneSearchBox>
          ) : (
            <input
              type="text"
              disabled
              placeholder={
                !mapKey
                  ? "Configura VITE_GOOGLE_MAPS_API_KEY"
                  : "Cargando Google Maps…"
              }
              className="w-full cursor-not-allowed rounded-3xl border border-slate-200 bg-slate-100 py-3 pl-14 pr-4 text-sm text-slate-500"
            />
          )}
        </div>
      </header>

      {zonaPeligrosa && (
        <div
          className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 flex items-start gap-3"
          role="alert"
        >
          <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-amber-950">
              Alerta de riesgo en tiempo real
            </p>
            <p className="text-sm text-amber-900 mt-1">
              {contexto!.indicadorZona} {contexto!.etiquetaZona} en{" "}
              <strong>{ubicacionTexto}</strong>. Tienes activada esta
              notificación en Configuración.
            </p>
          </div>
        </div>
      )}

      <Link
        to={rutaDesdeMapa(ubicacionTexto)}
        className="flex items-center justify-between gap-4 rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-4 transition hover:border-indigo-300 hover:bg-indigo-100/80"
      >
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-600 p-2.5 text-white">
            <Route className="w-5 h-5" />
          </div>
          <div>
            <p className="font-bold text-indigo-950">¿Vas a algún sitio?</p>
            <p className="text-sm text-indigo-800/90">
              Calcula rutas seguras, alternativas y SOS durante el trayecto
            </p>
          </div>
        </div>
        <span className="text-sm font-black text-indigo-600 shrink-0">
          Buscar ruta →
        </span>
      </Link>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px] flex-1 min-h-0">
        <div className="min-h-[480px] overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-100 shadow-sm relative">
          <div className="absolute inset-0">
            <GoogleMapView
              center={mapCenter}
              zoom={mapZoom}
              focusPin={focusPin}
              marcadoresDinamicos={
                capaIncidentes ? incidentes : null
              }
            />
          </div>

          <div className="absolute top-4 right-4 z-20 flex flex-col gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-bold text-indigo-700 shadow-lg hover:bg-slate-50"
              onClick={() => {
                if (!navigator.geolocation) return;
                navigator.geolocation.getCurrentPosition((pos) => {
                  const lat = pos.coords.latitude;
                  const lng = pos.coords.longitude;
                  setMapCenter({ lat, lng });
                  setFocusPin({ lat, lng });
                  setMapZoom(16);
                  setUbicacionTexto("Mi ubicación actual");
                });
              }}
            >
              <Navigation2 className="w-4 h-4" />
              Centrar en mí
            </button>
            <button
              type="button"
              onClick={() => {
                setCapaIncidentes((v) => !v);
                if (!incidentes?.length) void cargarIncidentes();
              }}
              className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold shadow-lg ${
                capaIncidentes
                  ? "bg-amber-500 text-white hover:bg-amber-600"
                  : "bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Layers className="w-4 h-4" />
              {capaIncidentes ? "Capa incidentes ON" : "Capa incidentes OFF"}
            </button>
          </div>

          {cargandoIncidentes && (
            <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2 rounded-xl bg-white/95 px-3 py-2 text-xs font-medium text-slate-600 shadow">
              <Loader2 className="w-4 h-4 animate-spin" />
              Cargando incidentes…
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide mb-3">
              Seguridad del lugar
            </h2>
            {contexto ? (
              <div className="space-y-2">
                <p className="text-3xl" aria-hidden>
                  {contexto.indicadorZona}
                </p>
                <p className="font-bold text-slate-900">{contexto.etiquetaZona}</p>
                <p className="text-xs text-slate-500">
                  {contexto.reportesZona30d} reporte(s) similares (30 d)
                </p>
                {(contexto.pesoZonasOscurasPct ?? reglas?.pesoZonasOscurasPct) !=
                null ? (
                  <p className="text-xs text-indigo-700 bg-indigo-50 rounded-xl px-3 py-2 mt-2">
                    Peso zonas oscuras activo:{" "}
                    <strong>
                      {contexto.pesoZonasOscurasPct ??
                        reglas?.pesoZonasOscurasPct}
                      %
                    </strong>{" "}
                    (afecta el análisis de iluminación de esta zona).
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                Busca un lugar o pulsa analizar.
              </p>
            )}
            <button
              type="button"
              disabled={analizando || !token}
              onClick={() => void cargarContexto()}
              className="mt-4 w-full rounded-2xl bg-indigo-600 py-2.5 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {analizando ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analizando…
                </span>
              ) : (
                "Analizar esta zona"
              )}
            </button>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide mb-2">
              Capa de incidentes
            </h2>
            <p className="text-xs text-slate-500 mb-3">
              Pines reales (30 d). Gris con «·» = reporte reciente según caducidad
              admin
              {reglas?.caducidadReporteMenorHoras
                ? ` (${reglas.caducidadReporteMenorHoras} h)`
                : ""}
              .
            </p>
            <p className="text-2xl font-black text-slate-900">
              {incidentes?.length ?? 0}
              <span className="text-sm font-medium text-slate-500 ml-1">
                en el mapa
              </span>
            </p>
            <button
              type="button"
              onClick={() => void cargarIncidentes()}
              className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100"
            >
              Actualizar capa
            </button>
          </div>

          <Link
            to={reportarDesdeMapa(ubicacionTexto, focusPin)}
            className="flex items-center gap-3 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 font-bold text-amber-950 hover:bg-amber-100/80 transition"
          >
            <FileWarning className="w-5 h-5 shrink-0" />
            <span className="text-sm leading-snug">
              Reportar incidente en este punto
            </span>
          </Link>

          <p className="text-[11px] text-slate-400 leading-relaxed px-1">
            SOS y Llegué bien están en{" "}
            <Link to="/rutas" className="font-bold text-indigo-600 hover:underline">
              Buscar ruta
            </Link>{" "}
            mientras navegas un trayecto.
          </p>
        </aside>
      </div>
    </div>
  );
}
