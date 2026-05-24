import {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  lazy,
  Suspense,
} from "react";
import { useSearchParams } from "react-router";
import { useAuth } from "../contexts/AuthContext";
import { apiUrl, authJsonHeaders } from "../lib/api";
import {
  Navigation,
  MapPin,
  Search,
  ShieldCheck,
  Clock,
  Activity,
  Footprints,
  Bike,
  CheckCircle2,
  ShieldAlert,
  Map,
  Loader2,
} from "lucide-react";
import { MapaEventoToast } from "../components/MapaEventoToast";
import {
  postMapaEvento,
  toastFromMapaEvento,
  type EventoToast,
} from "../lib/mapaEventosApi";
import {
  fetchPreferencias,
  avisoSinLlegada,
  modoToTransport,
  aplicarPreferenciaRutasNocturnas,
  type PreferenciasUsuario,
} from "../lib/preferenciasUsuario";
import { fetchReglasSistema, type ReglasSistema } from "../lib/reglasSistema";
const RutaMapaBusqueda = lazy(() =>
  import("../components/RutaMapaBusqueda").then((m) => ({
    default: m.RutaMapaBusqueda,
  })),
);
import { buildRoutePath, haversineKm, hashString } from "../lib/geo";
import {
  getGoogleMapsApiKey,
} from "../lib/mapsEnv";
import {
  origenPideGpsFijo,
} from "../lib/limaGeocode";
import { fetchGoogleDirectionsRoutes } from "../lib/googleDirections";
import { geocodificarDireccionGoogle } from "../lib/googleGeocode";
import {
  fetchContextoZonaCompleto,
  fetchRecomendacionesMlConClima,
  type ContextoZonaCompleto,
} from "../lib/zonaMlApi";
import { ZonaInteligenciaPanel } from "../components/ZonaInteligenciaPanel";
import type { LatLngLiteral } from "../types/maps";

type RutaOpcion = {
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

const descSeguras = [
  "Evita callejones y prioriza avenidas con buena iluminación y presencia de serenazgo.",
  "Rodea el parque reportado y pasa cerca de estaciones de policía y comercio abierto.",
  "Usa vías con más cámaras municipales; el recorrido es un poco más largo pero más expuesto.",
];

const descRapidas = [
  "Atajo directo: menos metros, cruza cerca de una zona con reportes de iluminación baja.",
  "Tramo más corto; incluye 1 pasaje estrecho — úsalo solo de día si te sientes inseguro.",
  "Corta por una ciclovía con poco tráfico; revisa el pavimento cerca de la berma.",
];

const descEquilibradas = [
  "Balance entre distancia y seguridad: mezcla avenida principal con calle secundaria con cámaras.",
  "Alterna entre zona comercial (más gente) y tramo residencial con buen alumbrado.",
  "Pasa frente a un mercado (ambiente concurrido) y luego reincorpora a avenida amplia.",
];

function geocodificarDireccion(address: string): Promise<LatLngLiteral> {
  return geocodificarDireccionGoogle(address);
}

/**
 * Si el origen es la plantilla "Mi ubicación…" y el usuario quiere GPS → coordenadas reales.
 * Si escribió calle, urbanización, distrito → geocodificar (no forzar el centro de Lima).
 */
function resolverOrigen(
  origenTexto: string,
  usarGpsOrigen: boolean,
): Promise<LatLngLiteral> {
  const raw = origenTexto.trim();
  const soloGps = origenPideGpsFijo(raw);

  if (usarGpsOrigen && soloGps) {
    if (!navigator.geolocation) {
      return Promise.reject(
        new Error(
          "Tu navegador no soporta GPS. Escribe el origen como dirección en el campo, o desmarca la casilla e indica calle y distrito en Lima.",
        ),
      );
    }
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        },
        () => {
          reject(
            new Error(
              "No se pudo leer el GPS. Activa el permiso de ubicación, o escribe el origen como calle, distrito, Lima/Perú.",
            ),
          );
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
      );
    });
  }

  if (soloGps && !usarGpsOrigen) {
    return Promise.reject(
      new Error(
        "Marca «Usar mi ubicación (GPS)» y acepta el permiso, o reemplaza el texto por la dirección de partida (calle, urbanización, distrito, Lima).",
      ),
    );
  }

  if (!raw) {
    return Promise.reject(
      new Error(
        "Indica un origen: deja «Mi ubicación actual» y GPS, o escribe una dirección o lugar en el área de Lima y Callao.",
      ),
    );
  }

  return geocodificarDireccion(raw);
}

function generarRutas(
  origin: LatLngLiteral,
  dest: LatLngLiteral,
  mode: "pedestrian" | "bike",
  destinoTexto: string,
): RutaOpcion[] {
  const h = hashString(destinoTexto + mode);
  const baseDist = Math.max(0.35, haversineKm(origin, dest));
  const speed = mode === "bike" ? 14 : 5;
  const minBase = (baseDist / speed) * 60;

  const jitter = (i: number) => 1 + ((h >> (i * 3)) % 13) / 100;
  const pick = (arr: string[], i: number) => arr[(h + i) % arr.length];

  const d1 = baseDist * 1.08 * jitter(1);
  const d2 = baseDist * 0.92 * jitter(2);
  const d3 = baseDist * 1.0 * jitter(3);

  const t1 = Math.max(5, Math.round((d1 / speed) * 60 * jitter(4)));
  const t2 = Math.max(4, Math.round((d2 / speed) * 60 * jitter(5)));
  const t3 = Math.max(4, Math.round((d3 / speed) * 60 * jitter(6)));

  return [
    {
      id: "safe",
      tag: "MÁS SEGURA",
      tagClass: "bg-emerald-500",
      nombre: h % 2 === 0 ? "Ruta Resguardada" : "Ruta Iluminada",
      nivel: "Nivel: Alto",
      nivelClass: "text-emerald-600",
      descripcion: pick(descSeguras, 0),
      minutos: t1,
      km: d1,
      color: "#10b981",
      path: buildRoutePath(origin, dest, 0),
    },
    {
      id: "fast",
      tag: "MÁS RÁPIDA",
      tagClass: "bg-amber-500",
      nombre: h % 3 === 0 ? "Atajo Norte" : h % 3 === 1 ? "Conexión Miraflores" : "Atajo Sur",
      nivel: "Nivel: Medio",
      nivelClass: "text-amber-600",
      descripcion: pick(descRapidas, 1),
      minutos: t2,
      km: d2,
      color: "#f59e0b",
      path: buildRoutePath(origin, dest, 1),
    },
    {
      id: "balanced",
      tag: "EQUILIBRADA",
      tagClass: "bg-blue-500",
      nombre: h % 2 === 0 ? "Ruta Mixta" : "Ruta de Corredor",
      nivel: "Nivel: Medio–Alto",
      nivelClass: "text-blue-600",
      descripcion: pick(descEquilibradas, 2),
      minutos: t3,
      km: d3,
      color: "#3b82f6",
      path: buildRoutePath(origin, dest, 2),
    },
  ];
}

async function resolverOpcionesRuta(
  origin: LatLngLiteral,
  dest: LatLngLiteral,
  mode: "pedestrian" | "bike",
  destinoTexto: string,
): Promise<{ opts: RutaOpcion[]; fromGoogle: boolean }> {
  const simulated = generarRutas(origin, dest, mode, destinoTexto);
  const fromGoogle = await fetchGoogleDirectionsRoutes(
    origin,
    dest,
    mode,
    destinoTexto,
  );
  if (!fromGoogle?.length) {
    return { opts: simulated, fromGoogle: false };
  }
  const byId = new globalThis.Map(fromGoogle.map((r) => [r.id, r as RutaOpcion]));
  for (const sim of simulated) {
    if (!byId.has(sim.id)) byId.set(sim.id, sim);
  }
  const order: Array<"safe" | "fast" | "balanced"> = ["safe", "fast", "balanced"];
  const merged = order
    .map((id) => byId.get(id))
    .filter((x): x is RutaOpcion => x != null);
  return {
    opts: merged.length >= 3 ? merged : simulated,
    fromGoogle: true,
  };
}

const ML_VARIANT_TO_ROUTE: Record<string, string> = {
  segura: "safe",
  rapida: "fast",
  equilibrada: "balanced",
};

type MlRecomendacion = {
  varianteId: string;
  nombre: string;
  preferenceScore: number;
  seguridadPct: number;
};

async function cargarRecomendacionesMl(
  token: string,
  origen: string,
  destino: string,
  origLat?: number,
  origLng?: number,
  destLat?: number,
  destLng?: number,
): Promise<{ recs: MlRecomendacion[]; advertenciasClima: string[]; influidoPorClima: boolean }> {
  const data = await fetchRecomendacionesMlConClima(
    token,
    origen,
    destino,
    origLat,
    origLng,
    destLat,
    destLng,
  );
  if (!data) return { recs: [], advertenciasClima: [], influidoPorClima: false };
  return {
    recs: data.recomendaciones,
    advertenciasClima: data.advertenciasClima,
    influidoPorClima: data.influidoPorClima,
  };
}

function ordenarRutasConMl(
  opts: RutaOpcion[],
  recs: MlRecomendacion[],
  influidoPorClima = false,
): RutaOpcion[] {
  if (recs.length === 0) return opts;
  const order = recs
    .map((rec) => ML_VARIANT_TO_ROUTE[rec.varianteId] ?? rec.varianteId)
    .filter((id) => opts.some((o) => o.id === id));
  if (order.length === 0) return opts;

  const byId = new globalThis.Map(opts.map((o) => [o.id, o]));
  const sorted: RutaOpcion[] = [];
  for (const id of order) {
    const op = byId.get(id);
    if (op && !sorted.some((s) => s.id === id)) sorted.push(op);
  }
  for (const o of opts) {
    if (!sorted.some((s) => s.id === o.id)) sorted.push(o);
  }

  const top = recs[0];
  const topId = top ? ML_VARIANT_TO_ROUTE[top.varianteId] : null;
  return sorted.map((op) => {
    if (op.id !== topId) return op;
    const extraClima = influidoPorClima
      ? " ☔ Priorizada por condiciones climáticas adversas."
      : "";
    return {
      ...op,
      tag: "RECOMENDADA",
      tagClass: "bg-indigo-600",
      descripcion: `${op.descripcion}${extraClima}`,
    };
  });
}

export default function Rutas() {
  const [searchParams] = useSearchParams();
  const { token } = useAuth();
  const [navToast, setNavToast] = useState<EventoToast | null>(null);
  const [navAccionando, setNavAccionando] = useState<"llegue" | "sos" | null>(
    null,
  );
  const mapKey = getGoogleMapsApiKey();

  const [step, setStep] = useState<"buscar" | "alternativas" | "navegando">(
    "buscar",
  );
  const [isSearching, setIsSearching] = useState(false);
  const [mode, setMode] = useState<"pedestrian" | "bike">("pedestrian");
  const [origenTexto, setOrigenTexto] = useState("Mi ubicación actual");
  const [destinoTexto, setDestinoTexto] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);

  const [origen, setOrigen] = useState<LatLngLiteral | null>(null);
  const [dest, setDest] = useState<LatLngLiteral | null>(null);
  const [opciones, setOpciones] = useState<RutaOpcion[]>([]);
  const [rutaElegida, setRutaElegida] = useState<RutaOpcion | null>(null);
  const [usarGpsOrigen, setUsarGpsOrigen] = useState(true);
  const [prefs, setPrefs] = useState<PreferenciasUsuario | null>(null);
  const [reglas, setReglas] = useState<ReglasSistema | null>(null);
  const [zonaDestino, setZonaDestino] = useState<ContextoZonaCompleto | null>(
    null,
  );
  const [zonaDestinoLoading, setZonaDestinoLoading] = useState(false);
  const [rutasGoogle, setRutasGoogle] = useState(false);
  const [advertenciasClima, setAdvertenciasClima] = useState<string[]>([]);
  const llegueBienOkRef = useRef(false);
  const prevStepRef = useRef(step);

  useEffect(() => {
    const d = searchParams.get("destino")?.trim();
    if (d) setDestinoTexto(d);
  }, [searchParams]);

  useEffect(() => {
    if (!token) return;
    void fetchPreferencias(token).then((p) => {
      if (!p) return;
      setPrefs(p);
      setMode(modoToTransport(p.modoMovilidadPredeterminado));
    });
  }, [token]);

  useEffect(() => {
    void fetchReglasSistema().then(setReglas);
  }, []);

  useEffect(() => {
    const prev = prevStepRef.current;
    if (
      prev === "navegando" &&
      step !== "navegando" &&
      !llegueBienOkRef.current &&
      prefs?.avisoAutomaticoLlegada &&
      token
    ) {
      void avisoSinLlegada(token, destinoTexto.trim()).then((res) => {
        if (res?.registrado && res.mensaje) {
          setNavToast({
            kind: "info",
            titulo: "Aviso automático de llegada",
            mensaje: res.mensaje,
          });
        }
      });
    }
    prevStepRef.current = step;
  }, [step, token, prefs?.avisoAutomaticoLlegada, destinoTexto]);

  const startNavigation = useCallback((r: RutaOpcion) => {
    llegueBienOkRef.current = false;
    setRutaElegida(r);
    setStep("navegando");
    setNavToast(null);
  }, []);

  const enviarEventoNavegacion = useCallback(
    async (tipo: "llegue-bien" | "sos") => {
      if (!token) {
        setNavToast({
          kind: "info",
          titulo: "Sesión requerida",
          mensaje: "Inicia sesión para usar SOS o Llegué bien.",
        });
        return;
      }
      setNavAccionando(tipo === "llegue-bien" ? "llegue" : "sos");
      try {
        const ubicacionTexto =
          destinoTexto.trim() ||
          `Destino de ruta (${rutaElegida?.nombre ?? "en curso"})`;
        const data = await postMapaEvento(token, tipo, {
          latitud: dest?.lat,
          longitud: dest?.lng,
          ubicacionTexto,
        });
        if (!data) {
          setNavToast({
            kind: "info",
            titulo: "No se pudo registrar",
            mensaje: "Revisa que el servidor esté activo e intenta de nuevo.",
          });
          return;
        }
        setNavToast(toastFromMapaEvento(tipo, data));
        if (tipo === "llegue-bien") {
          llegueBienOkRef.current = true;
          setTimeout(() => {
            setStep("buscar");
            setRutaElegida(null);
            setNavToast(null);
          }, 4500);
        }
      } catch {
        setNavToast({
          kind: "info",
          titulo: "Error de conexión",
          mensaje: "No se pudo contactar al servidor.",
        });
      } finally {
        setNavAccionando(null);
      }
    },
    [token, destinoTexto, dest, rutaElegida],
  );

  const registrarBusquedaEnHistorial = useCallback(
    async (
      opts: RutaOpcion[],
      origenT: string,
      destT: string,
      transportMode: "pedestrian" | "bike",
    ) => {
      if (!token) return;
      const ref = opts.find((x) => x.id === "safe") ?? opts[0]!;
      try {
        const r = await fetch(apiUrl("/api/RutasHistorial/mias"), {
          method: "POST",
          headers: authJsonHeaders(token),
          body: JSON.stringify({
            OrigenTexto: origenT,
            DestinoTexto: destT,
            Modo: transportMode === "pedestrian" ? "peaton" : "bike",
            MinutosAprox: ref.minutos,
            KmAprox: ref.km,
            RutaReferencia: ref.nombre,
          }),
        });
        if (!r.ok) {
          // historial no bloquea la búsqueda
          return;
        }
      } catch {
        // red / servidor no bloquea la búsqueda
      }
    },
    [token],
  );

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mapKey) {
      setSearchError("Configura VITE_GOOGLE_MAPS_API_KEY en .env");
      return;
    }
    if (!destinoTexto.trim()) {
      setSearchError("Escribe un destino en Lima.");
      return;
    }
    setIsSearching(true);
    setSearchError(null);
    setZonaDestino(null);
    try {
      const o = await resolverOrigen(origenTexto, usarGpsOrigen);
      const d = await geocodificarDireccion(destinoTexto.trim());
      setOrigen(o);
      setDest(d);
      const { opts: baseOpts, fromGoogle } = await resolverOpcionesRuta(
        o,
        d,
        mode,
        destinoTexto,
      );
      setRutasGoogle(fromGoogle);
      let opts = baseOpts;
      setAdvertenciasClima([]);
      if (token) {
        const { recs, advertenciasClima: adv, influidoPorClima } =
          await cargarRecomendacionesMl(
            token,
            origenTexto.trim() || "Origen",
            destinoTexto.trim(),
            o.lat,
            o.lng,
            d.lat,
            d.lng,
          );
        setAdvertenciasClima(adv);
        opts = ordenarRutasConMl(opts, recs, influidoPorClima);
      }
      opts = aplicarPreferenciaRutasNocturnas(
        opts,
        prefs?.evitarZonasOscurasNoche ?? true,
        reglas?.pesoZonasOscurasPct ?? 40,
      );
      setOpciones(opts);
      setStep("alternativas");
      setZonaDestinoLoading(true);
      void fetchContextoZonaCompleto(destinoTexto.trim(), d.lat, d.lng).then(
        (ctx) => {
          setZonaDestino(ctx);
          setZonaDestinoLoading(false);
        },
      );
      void registrarBusquedaEnHistorial(
        opts,
        origenTexto.trim() || "Origen",
        destinoTexto.trim(),
        mode,
      );
    } catch (err) {
      setSearchError(
        err instanceof Error ? err.message : "Error al buscar la ruta.",
      );
    } finally {
      setIsSearching(false);
    }
  };

  const capasMapa = useMemo(() => {
    if (step !== "alternativas" || !origen || !dest || opciones.length === 0) {
      return [];
    }
    return opciones.map((op) => ({
      id: op.id,
      color: op.color,
      path: op.path,
      opacity: 0.5,
    }));
  }, [step, origen, dest, opciones]);

  if (step === "navegando" && rutaElegida && origen && dest) {
    return (
      <div className="h-[calc(100vh-120px)] flex flex-col animate-in fade-in zoom-in-95 duration-500 relative">
        <div className="bg-indigo-600 text-white p-4 rounded-t-3xl shadow-lg z-10 flex items-center gap-4">
          <div className="bg-indigo-800 p-3 rounded-xl">
            <Navigation className="w-8 h-8 text-indigo-200" />
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-black">Navegando: {rutaElegida.nombre}</h2>
            <p className="text-indigo-200 font-medium text-sm">
              ~{rutaElegida.minutos} min estimados · {rutaElegida.km.toFixed(2)} km
            </p>
            {prefs?.avisoAutomaticoLlegada && (
              <p className="text-indigo-100/90 text-xs mt-1 max-w-md">
                Si sales sin «Llegué bien», se avisará a tus contactos (preferencia
                activa).
              </p>
            )}
          </div>
          <div className="bg-emerald-500 px-3 py-1 rounded-lg border border-emerald-400">
            <span className="text-xs font-bold block text-center">Score</span>
            <span className="text-lg font-black">
              {80 + (hashString(rutaElegida.id) % 19)}%
            </span>
          </div>
        </div>

        <div className="flex-1 min-h-[280px] relative">
          {mapKey ? (
            <Suspense
              fallback={
                <div className="grid place-items-center rounded-3xl border border-slate-200 bg-slate-50 min-h-[280px] text-slate-500">
                  Cargando mapa…
                </div>
              }
            >
              <RutaMapaBusqueda
                origin={origen}
                dest={dest}
                paths={[
                  {
                    id: "nav",
                    color: rutaElegida.color,
                    path: rutaElegida.path,
                    opacity: 0.9,
                  },
                ]}
                height={400}
                highlightId="nav"
              />
            </Suspense>
          ) : (
            <div className="h-full bg-slate-200 grid place-items-center p-4">
              Sin clave de mapa
            </div>
          )}
        </div>

        <div className="bg-white p-6 rounded-b-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] border-t border-slate-200 z-10 flex gap-4">
          <button
            type="button"
            disabled={navAccionando !== null}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 text-lg transition-all disabled:opacity-60"
            onClick={() => void enviarEventoNavegacion("sos")}
          >
            {navAccionando === "sos" ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <ShieldAlert className="w-6 h-6" />
            )}
            SOS
          </button>
          <button
            type="button"
            disabled={navAccionando !== null}
            className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 text-lg transition-all disabled:opacity-60"
            onClick={() => void enviarEventoNavegacion("llegue-bien")}
          >
            {navAccionando === "llegue" ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <CheckCircle2 className="w-6 h-6" />
            )}
            Llegué Bien
          </button>
          <button
            type="button"
            onClick={() => setStep("alternativas")}
            className="bg-slate-100 text-slate-600 p-4 rounded-2xl hover:bg-slate-200"
          >
            <Map className="w-6 h-6" />
          </button>
        </div>

        {navToast && (
          <MapaEventoToast toast={navToast} onClose={() => setNavToast(null)} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 h-full flex flex-col">
      <header>
        <h1 className="text-3xl font-black text-slate-900">
          {step === "buscar" ? "Buscar Ruta Segura" : "Rutas alternativas"}
        </h1>
        <p className="text-slate-500 mt-2 font-medium">
          {step === "buscar"
            ? "Escribe cualquier dirección o lugar en Lima. Calculamos 3 alternativas distintas (seguridad, tiempo y equilibrio)."
            : "Compara y elige. El mapa muestra las tres trayectorias sugeridas."}
        </p>
      </header>

      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative z-10">
        <form onSubmit={handleSearch} className="space-y-5">
          <div className="relative pl-8 space-y-4">
            <div className="absolute left-3.5 top-5 bottom-5 w-0.5 bg-slate-200 rounded-full"></div>
            <div className="relative">
              <div className="absolute -left-[27px] top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-4 border-indigo-600 bg-white"></div>
              <input
                type="text"
                value={origenTexto}
                onChange={(e) => setOrigenTexto(e.target.value)}
                aria-label="Origen"
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex items-center gap-2 pl-1">
              <input
                id="gps-origen"
                type="checkbox"
                checked={usarGpsOrigen}
                onChange={(e) => setUsarGpsOrigen(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="gps-origen" className="text-sm text-slate-600">
                GPS solo para &quot;Mi ubicación actual&quot;; si escribes otra dirección en
                Origen, se busca en el mapa (no se usa GPS con texto de calle).
              </label>
            </div>
            <div className="relative">
              <div className="absolute -left-[27px] top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-red-500 border-2 border-white shadow-sm"></div>
              <input
                type="text"
                value={destinoTexto}
                onChange={(e) => setDestinoTexto(e.target.value)}
                placeholder="Ej: Av. Larco 123, Miraflores  /  Parque Kennedy  /  UNI"
                aria-label="Destino"
                required
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {searchError && (
            <p className="text-sm text-red-600 font-medium">{searchError}</p>
          )}

          {step === "buscar" && (
            <div className="flex items-center gap-4 border-t border-slate-100 pt-5">
              <div className="flex bg-slate-100 p-1 rounded-xl flex-1 md:flex-none">
                <button
                  type="button"
                  onClick={() => setMode("pedestrian")}
                  className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg font-bold transition-all ${mode === "pedestrian" ? "bg-white shadow-sm text-indigo-700" : "text-slate-500"}`}
                >
                  <Footprints className="w-5 h-5" /> Peatón
                </button>
                <button
                  type="button"
                  onClick={() => setMode("bike")}
                  className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg font-bold transition-all ${mode === "bike" ? "bg-white shadow-sm text-indigo-700" : "text-slate-500"}`}
                >
                  <Bike className="w-5 h-5" /> Bicicleta
                </button>
              </div>
              <button
                type="submit"
                disabled={isSearching}
                className="ml-auto bg-indigo-600 text-white font-bold px-8 py-3.5 rounded-xl hover:bg-indigo-700 flex items-center gap-2 shadow-md"
              >
                {isSearching ? (
                  <Activity className="w-5 h-5 animate-spin" />
                ) : (
                  <Search className="w-5 h-5" />
                )}
                Buscar
              </button>
            </div>
          )}
        </form>
      </div>

      {step === "alternativas" && origen && dest && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
            <div className="space-y-4">
          {mapKey ? (
            <Suspense
              fallback={
                <div className="grid place-items-center rounded-3xl border border-slate-200 bg-slate-50 min-h-[300px] text-slate-500">
                  Cargando mapa…
                </div>
              }
            >
              <RutaMapaBusqueda
                origin={origen}
                dest={dest}
                paths={capasMapa}
                height={300}
              />
            </Suspense>
          ) : null}

          <div className="flex flex-wrap justify-between items-center gap-2">
            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
              Resultados{" "}
              <span className="text-sm font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                3 opciones
              </span>
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {rutasGoogle ? (
                <span className="text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 px-3 py-1">
                  Google Directions API
                </span>
              ) : (
                <span className="text-xs font-bold rounded-full bg-slate-100 text-slate-600 px-3 py-1">
                  Rutas estimadas (fallback)
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  setStep("buscar");
                  setOpciones([]);
                  setZonaDestino(null);
                  setAdvertenciasClima([]);
                }}
                className="text-sm font-bold text-slate-500 hover:text-indigo-600"
              >
                Nueva búsqueda
              </button>
            </div>
          </div>

          {advertenciasClima.length > 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 mb-5 space-y-1">
              <p className="text-xs font-black text-amber-950 uppercase tracking-wide">
                Condiciones climáticas en el trayecto
              </p>
              {advertenciasClima.map((a) => (
                <p key={a} className="text-sm text-amber-900 font-medium">
                  {a}
                </p>
              ))}
            </div>
          ) : null}

          <div className="grid md:grid-cols-3 gap-5">
            {opciones.map((op) => {
              const esRecomendada = op.tag === "RECOMENDADA";
              const borderClass = esRecomendada
                ? "border-2 border-indigo-500 shadow-[0_8px_30px_rgba(79,70,229,0.12)]"
                : op.id === "safe"
                  ? "border-2 border-emerald-500 shadow-[0_8px_30px_rgba(16,185,129,0.12)]"
                  : "border border-slate-200";
              return (
                <div
                  key={op.id}
                  className={`bg-white rounded-3xl ${borderClass} shadow-sm p-1 overflow-hidden relative`}
                >
                  <div
                    className={`absolute top-0 right-0 ${op.tagClass} text-white text-xs font-black px-3 py-1 rounded-bl-xl z-10`}
                  >
                    {op.tag}
                  </div>
                  <div className="p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className="p-2.5 rounded-xl"
                        style={{
                          backgroundColor: `${op.color}22`,
                          color: op.color,
                        }}
                      >
                        {op.id === "safe" ? (
                          <ShieldCheck className="w-6 h-6" />
                        ) : op.id === "fast" ? (
                          <Clock className="w-6 h-6" />
                        ) : (
                          <Navigation className="w-6 h-6" />
                        )}
                      </div>
                      <div>
                        <h3 className="font-black text-slate-900 text-lg">
                          {op.nombre}
                        </h3>
                        <p
                          className={`text-xs font-bold ${op.nivelClass}`}
                        >
                          {op.nivel}
                        </p>
                      </div>
                    </div>
                    <p className="text-slate-500 text-sm font-medium mb-6 min-h-[48px]">
                      {op.descripcion}
                    </p>
                    <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl mb-4">
                      <span className="font-bold text-sm flex items-center gap-1">
                        <Clock className="w-4 h-4" /> {op.minutos} min
                      </span>
                      <span className="font-bold text-sm flex items-center gap-1">
                        <Activity className="w-4 h-4" /> {op.km.toFixed(2)} km
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => startNavigation(op)}
                      className={
                        esRecomendada || op.id === "safe"
                          ? "w-full bg-indigo-600 text-white font-bold py-3.5 rounded-xl flex justify-center gap-2"
                          : "w-full bg-slate-900 text-white font-bold py-3.5 rounded-xl flex justify-center gap-2"
                      }
                    >
                      Iniciar navegación <Navigation className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
            </div>

            <ZonaInteligenciaPanel
              titulo="Riesgo en destino"
              data={zonaDestino}
              loading={zonaDestinoLoading}
              compact
            />
          </div>
        </div>
      )}
    </div>
  );
}
