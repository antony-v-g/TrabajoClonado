import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Loader2, X } from "lucide-react";
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
import { useAuth } from "../contexts/AuthContext";
import { adminFetchJson } from "../lib/adminApi";
import { AdminPageHeader } from "../components/AdminPageHeader";
import type { LatLngLiteral } from "../types/maps";

const LIMA_SEARCH_BOUNDS = {
  north: -11.75,
  south: -12.55,
  west: -77.25,
  east: -76.65,
} as const;

type PuntoApi = {
  id: number;
  tipoIncidente: string;
  ubicacion?: string;
  descripcion?: string | null;
  lat: number;
  lng: number;
  estado: string;
  fechaReporte?: string;
  esReporteMenor?: boolean;
  etiquetaReciente?: string | null;
};

type FiltroEstado = "todos" | "Pendiente" | "Aprobado" | "Rechazado";

function colorPorEstado(estado: string) {
  if (estado === "Aprobado") return "#10b981";
  if (estado === "Rechazado") return "#f43f5e";
  return "#f59e0b";
}

function etiquetaEstado(estado: string) {
  if (estado === "Aprobado") return "Aprobado";
  if (estado === "Rechazado") return "Rechazado";
  return "Pendiente";
}

function centroDesdePuntos(list: PuntoApi[]): LatLngLiteral {
  if (list.length === 0) return LIMA_CENTRO;
  const lat = list.reduce((s, p) => s + p.lat, 0) / list.length;
  const lng = list.reduce((s, p) => s + p.lng, 0) / list.length;
  return { lat, lng };
}

export default function AdminZones() {
  const { token } = useAuth();
  const mapKey = getGoogleMapsApiKey();
  const { isLoaded } = useJsApiLoader(
    mapKey ? getGoogleMapsLoaderConfig(mapKey) : GOOGLE_MAPS_LOADER_DISABLED,
  );
  const searchBoxRef = useRef<google.maps.places.SearchBox | null>(null);

  const [puntos, setPuntos] = useState<PuntoApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [hint, setHint] = useState<string | null>(null);
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("todos");
  const [mapCenter, setMapCenter] = useState<LatLngLiteral>(LIMA_CENTRO);
  const [mapZoom, setMapZoom] = useState(12);
  const [focusPin, setFocusPin] = useState<LatLngLiteral | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    adminFetchJson<PuntoApi[]>("/api/Admin/puntos-mapa?maxDias=60", token)
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : [];
        setPuntos(list);
        if (!list.length) {
          setHint(
            "No hay reportes con coordenadas GPS. Los incidentes deben guardarse con latitud y longitud al reportar.",
          );
        } else {
          setHint(null);
          setMapCenter(centroDesdePuntos(list));
          setMapZoom(list.length > 8 ? 12 : 13);
        }
      })
      .catch(() => {
        setPuntos([]);
        setHint("No se pudieron cargar los incidentes del mapa.");
      })
      .finally(() => setLoading(false));
  }, [token]);

  const puntosFiltrados = useMemo(() => {
    const t = filtroTexto.trim().toLowerCase();
    return puntos.filter((p) => {
      if (filtroEstado !== "todos" && p.estado !== filtroEstado) return false;
      if (!t) return true;
      const ubic = (p.ubicacion ?? "").toLowerCase();
      const desc = (p.descripcion ?? "").toLowerCase();
      return (
        p.tipoIncidente.toLowerCase().includes(t) ||
        ubic.includes(t) ||
        desc.includes(t) ||
        p.estado.toLowerCase().includes(t) ||
        String(p.id).includes(t) ||
        `rep-${p.id}`.includes(t)
      );
    });
  }, [puntos, filtroTexto, filtroEstado]);

  useEffect(() => {
    if (puntosFiltrados.length === 0) return;
    setMapCenter(centroDesdePuntos(puntosFiltrados));
    setMapZoom(puntosFiltrados.length === 1 ? 15 : puntosFiltrados.length < 5 ? 14 : 12);
  }, [puntosFiltrados]);

  const marcadoresDinamicos: MapaMarcadorDinamico[] = useMemo(() => {
    return puntosFiltrados.map((p) => {
      const reciente = Boolean(p.esReporteMenor);
      return {
        id: `r-${p.id}`,
        lat: p.lat,
        lng: p.lng,
        title: reciente
          ? `· Reciente — ${p.tipoIncidente} · REP-${String(p.id).padStart(3, "0")}`
          : `${p.tipoIncidente} · REP-${String(p.id).padStart(3, "0")}`,
        label: reciente ? "·" : String(p.id),
        color: reciente ? "#94a3b8" : colorPorEstado(p.estado),
        descripcion: [
          reciente ? p.etiquetaReciente ?? "Reciente" : etiquetaEstado(p.estado),
          p.ubicacion?.trim() || "Sin dirección",
          p.descripcion?.trim(),
        ]
          .filter(Boolean)
          .join(" · "),
      };
    });
  }, [puntosFiltrados]);

  const onPlacesChanged = useCallback(() => {
    const places = searchBoxRef.current?.getPlaces();
    const place = places?.[0];
    if (!place?.geometry?.location) return;
    const lat = place.geometry.location.lat();
    const lng = place.geometry.location.lng();
    setMapCenter({ lat, lng });
    setMapZoom(14);
    setFocusPin({ lat, lng });
    const nombre =
      place.name?.trim() ||
      place.formatted_address?.trim() ||
      place.vicinity?.trim() ||
      "";
    if (nombre) setFiltroTexto(nombre);
  }, []);

  const limpiarFiltro = () => {
    setFiltroTexto("");
    setFiltroEstado("todos");
    setFocusPin(null);
    if (puntos.length > 0) {
      setMapCenter(centroDesdePuntos(puntos));
      setMapZoom(12);
    }
  };

  const estados: { id: FiltroEstado; label: string }[] = [
    { id: "todos", label: "Todos" },
    { id: "Pendiente", label: "Pendiente" },
    { id: "Aprobado", label: "Aprobado" },
    { id: "Rechazado", label: "Rechazado" },
  ];

  return (
    <div className="space-y-5 animate-in fade-in duration-500 pb-10">
      <AdminPageHeader
        title="Mapa de Calor"
        subtitle="Ubicación de incidentes reportados en los últimos 60 días."
      />

      {hint && !loading ? (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
          {hint}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {estados.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setFiltroEstado(e.id)}
              className={`rounded-2xl px-4 py-2 text-sm font-bold transition ${
                filtroEstado === e.id
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {e.label}
            </button>
          ))}
        </div>

        <div className="relative w-full lg:max-w-md">
          <Search className="pointer-events-none absolute left-4 top-1/2 z-10 w-5 h-5 -translate-y-1/2 text-slate-400" />
          {isLoaded && mapKey ? (
            <StandaloneSearchBox
              onLoad={(ref) => {
                searchBoxRef.current = ref;
              }}
              onPlacesChanged={onPlacesChanged}
              bounds={LIMA_SEARCH_BOUNDS}
            >
              <input
                type="text"
                value={filtroTexto}
                onChange={(e) => setFiltroTexto(e.target.value)}
                placeholder="Buscar distrito, calle o tipo de incidente…"
                className="w-full rounded-3xl border border-slate-200 bg-white py-3 pl-12 pr-10 text-sm font-medium text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
            </StandaloneSearchBox>
          ) : (
            <input
              type="text"
              value={filtroTexto}
              onChange={(e) => setFiltroTexto(e.target.value)}
              disabled={!mapKey}
              placeholder={
                mapKey ? "Cargando búsqueda…" : "Configura VITE_GOOGLE_MAPS_API_KEY"
              }
              className="w-full rounded-3xl border border-slate-200 bg-slate-100 py-3 pl-12 pr-10 text-sm text-slate-600"
            />
          )}
          {filtroTexto || filtroEstado !== "todos" ? (
            <button
              type="button"
              onClick={limpiarFiltro}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Limpiar filtro"
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
        <span>
          <strong className="text-slate-900">{puntosFiltrados.length}</strong>
          {puntosFiltrados.length === 1 ? " incidente" : " incidentes"} en el mapa
          {puntos.length !== puntosFiltrados.length
            ? ` (de ${puntos.length} con GPS)`
            : null}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-amber-500" /> Pendiente
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-emerald-500" /> Aprobado
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-rose-500" /> Rechazado
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-slate-400" /> Reciente (caducidad)
        </span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500 py-8">
          <Loader2 className="w-5 h-5 animate-spin" />
          Cargando incidentes…
        </div>
      ) : null}

      <div className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-100 shadow-sm">
        <div className="relative h-[560px]">
          <GoogleMapView
            center={mapCenter}
            zoom={mapZoom}
            focusPin={focusPin}
            marcadoresDinamicos={loading ? null : marcadoresDinamicos}
          />

          {puntosFiltrados.length === 0 && !loading && puntos.length > 0 ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 p-6">
              <p className="max-w-sm text-center text-sm font-medium text-slate-700">
                Ningún incidente coincide con el filtro. Prueba otro distrito,
                calle o estado.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
