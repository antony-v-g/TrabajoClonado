import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Loader2, X, RefreshCw } from "lucide-react";
import { useLocation } from "react-router";
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
type ModoMapaCalor = "calor" | "pines" | "ambos";

function pesoCalor(estado: string) {
  const n = normalizarEstado(estado);
  if (n === "Aprobado") return 2;
  if (n === "Pendiente") return 1.5;
  return 0.8;
}

function colorPorEstado(estado: string) {
  const n = normalizarEstado(estado);
  if (n === "Aprobado") return "#10b981";
  if (n === "Rechazado") return "#f43f5e";
  if (n === "Pendiente") return "#f59e0b";
  return "#94a3b8";
}

function normalizarEstado(estado: string): FiltroEstado | "otro" {
  const e = estado.trim().toLowerCase();
  if (e === "aprobado") return "Aprobado";
  if (e === "rechazado") return "Rechazado";
  if (e === "pendiente") return "Pendiente";
  return "otro";
}

function etiquetaEstado(estado: string) {
  const n = normalizarEstado(estado);
  if (n === "Aprobado") return "Aprobado";
  if (n === "Rechazado") return "Rechazado";
  if (n === "Pendiente") return "Pendiente";
  return estado.trim() || "Pendiente";
}

function coincideEstado(p: PuntoApi, filtro: FiltroEstado) {
  if (filtro === "todos") return true;
  return normalizarEstado(p.estado) === filtro;
}

function centroDesdePuntos(list: PuntoApi[]): LatLngLiteral {
  if (list.length === 0) return LIMA_CENTRO;
  const lat = list.reduce((s, p) => s + p.lat, 0) / list.length;
  const lng = list.reduce((s, p) => s + p.lng, 0) / list.length;
  return { lat, lng };
}

export default function AdminZones() {
  const { token } = useAuth();
  const location = useLocation();
  const mapKey = getGoogleMapsApiKey();
  const { isLoaded } = useJsApiLoader(
    mapKey ? getGoogleMapsLoaderConfig(mapKey) : GOOGLE_MAPS_LOADER_DISABLED,
  );
  const searchBoxRef = useRef<google.maps.places.SearchBox | null>(null);

  const [puntos, setPuntos] = useState<PuntoApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [hint, setHint] = useState<string | null>(null);
  const [busquedaMapa, setBusquedaMapa] = useState("");
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("todos");
  const [mapCenter, setMapCenter] = useState<LatLngLiteral>(LIMA_CENTRO);
  const [mapZoom, setMapZoom] = useState(12);
  /** Si el admin eligió una dirección en Google, no recentrar el mapa al filtrar pines. */
  const [vistaManual, setVistaManual] = useState(false);
  const [modoMapa, setModoMapa] = useState<ModoMapaCalor>("calor");

  const cargarPuntos = useCallback(() => {
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
          if (!vistaManual) {
            setMapCenter(centroDesdePuntos(list));
            setMapZoom(list.length > 8 ? 12 : 13);
          }
        }
      })
      .catch(() => {
        setPuntos([]);
        setHint("No se pudieron cargar los incidentes del mapa.");
      })
      .finally(() => setLoading(false));
  }, [token, vistaManual]);

  useEffect(() => {
    cargarPuntos();
  }, [cargarPuntos, location.key]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") cargarPuntos();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [cargarPuntos]);

  const puntosFiltrados = useMemo(() => {
    const t = filtroTexto.trim().toLowerCase();
    return puntos.filter((p) => {
      if (!coincideEstado(p, filtroEstado)) return false;
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

  const centrarMapaEnLista = useCallback((lista: PuntoApi[]) => {
    if (lista.length === 0) return;
    setMapCenter(centroDesdePuntos(lista));
    setMapZoom(lista.length === 1 ? 15 : lista.length < 5 ? 14 : 12);
  }, []);

  const aplicarFiltroEstado = useCallback(
    (id: FiltroEstado) => {
      setFiltroEstado(id);
      setVistaManual(false);
      const t = filtroTexto.trim().toLowerCase();
      const lista = puntos.filter((p) => {
        if (!coincideEstado(p, id)) return false;
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
      if (lista.length > 0) centrarMapaEnLista(lista);
    },
    [puntos, filtroTexto, centrarMapaEnLista],
  );

  const heatmapPoints = useMemo(
    () =>
      puntosFiltrados.map((p) => ({
        lat: p.lat,
        lng: p.lng,
        weight: pesoCalor(p.estado),
      })),
    [puntosFiltrados],
  );

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
    setVistaManual(true);
    const nombre =
      place.name?.trim() ||
      place.formatted_address?.trim() ||
      place.vicinity?.trim() ||
      "";
    if (nombre) setBusquedaMapa(nombre);
  }, []);

  const centrarEnIncidentes = () => {
    setVistaManual(false);
    setBusquedaMapa("");
    if (puntosFiltrados.length > 0) centrarMapaEnLista(puntosFiltrados);
    else if (puntos.length > 0) centrarMapaEnLista(puntos);
  };

  const limpiarFiltro = () => {
    setBusquedaMapa("");
    setFiltroTexto("");
    setFiltroEstado("todos");
    setVistaManual(false);
    centrarEnIncidentes();
  };

  const estados: { id: FiltroEstado; label: string; dot?: string }[] = [
    { id: "todos", label: "Todos" },
    { id: "Pendiente", label: "Pendiente", dot: "bg-amber-500" },
    { id: "Aprobado", label: "Aprobado", dot: "bg-emerald-500" },
    { id: "Rechazado", label: "Rechazado", dot: "bg-rose-500" },
  ];

  const estadosEnDatos = useMemo(() => {
    const set = new Set<FiltroEstado>();
    for (const p of puntos) {
      const n = normalizarEstado(p.estado);
      if (n !== "otro") set.add(n);
    }
    return set;
  }, [puntos]);

  const conteoPorEstado = useMemo(() => {
    const counts: Record<"Pendiente" | "Aprobado" | "Rechazado", number> = {
      Pendiente: 0,
      Aprobado: 0,
      Rechazado: 0,
    };
    for (const p of puntos) {
      const n = normalizarEstado(p.estado);
      if (n !== "otro") counts[n] += 1;
    }
    return counts;
  }, [puntos]);

  const estadosAlternativos = useMemo(
    () => [...estadosEnDatos].filter((e) => e !== filtroEstado),
    [estadosEnDatos, filtroEstado],
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-500 pb-10">
      <AdminPageHeader
        title="Mapa de Calor"
        subtitle="Solo aparecen reportes con coordenadas GPS. Al aprobar/rechazar, los contadores Pendiente / Aprobado / Rechazado se actualizan al instante."
        extra={
          <button
            type="button"
            onClick={() => cargarPuntos()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Actualizar mapa
          </button>
        }
      />

      {hint && !loading ? (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
          {hint}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2" aria-label="Modo de visualización">
        {(
          [
            { id: "calor" as const, label: "Mapa de calor" },
            { id: "pines" as const, label: "Solo pines" },
            { id: "ambos" as const, label: "Calor + pines" },
          ] as const
        ).map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setModoMapa(m.id)}
            className={`rounded-2xl px-4 py-2 text-sm font-bold transition ${
              modoMapa === m.id
                ? "bg-indigo-600 text-white"
                : "bg-indigo-50 text-indigo-800 hover:bg-indigo-100"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado del reporte">
          {estados.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => aplicarFiltroEstado(e.id)}
              className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-bold transition ${
                filtroEstado === e.id
                  ? "bg-slate-900 text-white ring-2 ring-slate-900 ring-offset-2"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {e.dot ? (
                <span className={`h-2.5 w-2.5 rounded-full ${e.dot}`} aria-hidden />
              ) : null}
              {e.label}
              {e.id !== "todos" && conteoPorEstado[e.id] > 0 ? (
                <span className="tabular-nums opacity-80">({conteoPorEstado[e.id]})</span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="flex w-full flex-col gap-2 lg:max-w-xl">
          <div className="relative">
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
                  value={busquedaMapa}
                  onChange={(e) => setBusquedaMapa(e.target.value)}
                  placeholder="Buscar dirección en el mapa (Lima)…"
                  className="w-full rounded-3xl border border-slate-200 bg-white py-3 pl-12 pr-10 text-sm font-medium text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                />
              </StandaloneSearchBox>
            ) : (
              <input
                type="text"
                disabled={!mapKey}
                placeholder={
                  mapKey ? "Cargando mapa…" : "Configura VITE_GOOGLE_MAPS_API_KEY"
                }
                className="w-full rounded-3xl border border-slate-200 bg-slate-100 py-3 pl-12 pr-10 text-sm text-slate-600"
              />
            )}
          </div>
          <div className="relative">
            <input
              type="text"
              value={filtroTexto}
              onChange={(e) => setFiltroTexto(e.target.value)}
              placeholder="Opcional: filtrar por calle guardada, tipo o REP-001…"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 px-4 pr-10 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
            {filtroTexto || filtroEstado !== "todos" || busquedaMapa ? (
              <button
                type="button"
                onClick={limpiarFiltro}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Limpiar filtros"
              >
                <X className="w-4 h-4" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-500 -mt-2">
        Los botones de estado <strong>filtran</strong> qué pines ves (no son solo leyenda).
        Buscar dirección arriba solo mueve el mapa; el pin queda donde se reportó con GPS.
      </p>

      <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
        <span>
          <strong className="text-slate-900">{puntosFiltrados.length}</strong>
          {puntosFiltrados.length === 1 ? " incidente" : " incidentes"} en el mapa
          {puntos.length !== puntosFiltrados.length
            ? ` (de ${puntos.length} con GPS)`
            : null}
          {filtroEstado !== "todos" ? (
            <span className="text-slate-500"> · filtro: {filtroEstado}</span>
          ) : null}
        </span>
        <span className="inline-flex items-center gap-1.5 text-slate-500">
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
            marcadoresDinamicos={
              loading || modoMapa === "calor" ? null : marcadoresDinamicos
            }
            heatmapPoints={loading ? null : heatmapPoints}
            showHeatmap={!loading && modoMapa !== "pines"}
            showMarkers={!loading && modoMapa !== "calor"}
          />

          {vistaManual && puntosFiltrados.length > 0 && !loading ? (
            <div className="absolute bottom-4 left-4 right-4 z-10 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={centrarEnIncidentes}
                className="rounded-xl bg-white/95 border border-slate-200 px-4 py-2 text-sm font-bold text-slate-800 shadow-md hover:bg-white"
              >
                Centrar en {puntosFiltrados.length} incidente
                {puntosFiltrados.length === 1 ? "" : "s"}
              </button>
            </div>
          ) : null}

          {puntosFiltrados.length === 0 && !loading && puntos.length > 0 ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 p-6">
              <div className="max-w-md rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-lg text-center space-y-3">
                <p className="text-sm font-semibold text-slate-900">
                  Hay {puntos.length} incidente{puntos.length === 1 ? "" : "s"} con GPS, pero ninguno
                  coincide con el filtro actual.
                </p>
                <ul className="text-left text-xs text-slate-600 space-y-1.5">
                  {puntos.slice(0, 5).map((p) => (
                    <li key={p.id}>
                      <strong>REP-{String(p.id).padStart(3, "0")}</strong> —{" "}
                      {etiquetaEstado(p.estado)}
                      {p.ubicacion?.trim() ? ` · ${p.ubicacion.trim()}` : ""}
                    </li>
                  ))}
                </ul>
                {(filtroEstado !== "todos" || filtroTexto.trim()) && (
                  <p className="text-xs text-slate-500">
                    Filtro activo:{" "}
                    {filtroEstado !== "todos" ? `estado ${filtroEstado}` : ""}
                    {filtroEstado !== "todos" && filtroTexto.trim() ? " · " : ""}
                    {filtroTexto.trim() ? `texto «${filtroTexto.trim()}»` : ""}
                  </p>
                )}
                {filtroEstado !== "todos" && puntos.some((p) => !coincideEstado(p, filtroEstado)) ? (
                  <p className="text-xs text-indigo-700 font-medium">
                    {estadosEnDatos.has(filtroEstado) ? (
                      <>
                        Hay reportes «{filtroEstado}», pero el filtro de texto u otro criterio los oculta.
                        Prueba <strong>Ver todos</strong> o limpia el cuadro de búsqueda.
                      </>
                    ) : (
                      <>
                        No hay ningún reporte con estado «{filtroEstado}».
                        {estadosAlternativos.length > 0 ? (
                          <>
                            {" "}
                            Los que hay con GPS están en:{" "}
                            <strong>{estadosAlternativos.join(", ")}</strong>.
                          </>
                        ) : null}
                      </>
                    )}
                  </p>
                ) : null}
                <div className="flex flex-wrap justify-center gap-2">
                  {estadosAlternativos.includes("Aprobado") ? (
                    <button
                      type="button"
                      onClick={() => aplicarFiltroEstado("Aprobado")}
                      className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
                    >
                      Ver Aprobado ({conteoPorEstado.Aprobado})
                    </button>
                  ) : null}
                  {estadosAlternativos.includes("Pendiente") ? (
                    <button
                      type="button"
                      onClick={() => aplicarFiltroEstado("Pendiente")}
                      className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white hover:bg-amber-600"
                    >
                      Ver Pendiente ({conteoPorEstado.Pendiente})
                    </button>
                  ) : null}
                  {estadosAlternativos.includes("Rechazado") ? (
                    <button
                      type="button"
                      onClick={() => aplicarFiltroEstado("Rechazado")}
                      className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700"
                    >
                      Ver Rechazado ({conteoPorEstado.Rechazado})
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => aplicarFiltroEstado("todos")}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50"
                  >
                    Ver todos
                  </button>
                  <button
                    type="button"
                    onClick={limpiarFiltro}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
                  >
                    Quitar filtros y centrar
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
