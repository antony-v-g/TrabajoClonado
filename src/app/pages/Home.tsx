import { useCallback, useEffect, useState } from "react";
import {
  Navigation,
  MapPin,
  AlertTriangle,
  Clock,
  ShieldAlert,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Link } from "react-router";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useAuth } from "../contexts/AuthContext";
import { apiUrl, authJsonHeaders } from "../lib/api";
type AlertaRecienteApi = {
  id: number;
  titulo: string;
  descripcion: string;
  ubicacion: string;
  tipoIncidente: string;
  fechaReporte: string;
  nivelSeguridad: string;
  indicadorVisual: string;
  etiquetaSeguridad: string;
  confianzaMlPct?: number | null;
  fuenteMl: string;
  esReporteMenor?: boolean;
};

type AlertasRecientesResponse = {
  alertas: AlertaRecienteApi[];
  total: number;
  cacheRedisActivo: boolean;
  servidoDesdeCache: boolean;
};

type LugarFrecuenteApi = {
  nombre: string;
  icono: string;
  minutosAprox: number;
  usos: number;
};

type LugaresFrecuentesResponse = {
  lugares: LugarFrecuenteApi[];
  total: number;
  cacheRedisActivo: boolean;
  servidoDesdeCache: boolean;
};

function truncar(s: string, max: number) {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

function classAlerta(tipo: string, nivel: string) {
  const n = (nivel || "").toLowerCase();
  if (n.includes("segura") && !n.includes("moder")) {
    return {
      box: "border border-emerald-100 bg-emerald-50",
      iconBg: "bg-emerald-500",
      title: "text-emerald-950",
      body: "text-emerald-800",
      time: "text-emerald-600",
    };
  }
  if (n.includes("moder")) {
    return {
      box: "border border-amber-100 bg-amber-50",
      iconBg: "bg-amber-500",
      title: "text-amber-950",
      body: "text-amber-800",
      time: "text-amber-600",
    };
  }
  if (n.includes("peligro")) {
    return {
      box: "border border-red-100 bg-red-50",
      iconBg: "bg-red-500",
      title: "text-red-900",
      body: "text-red-700",
      time: "text-red-600",
    };
  }

  if (!tipo || typeof tipo !== "string") {
    return {
      box: "border border-slate-200 bg-slate-50",
      iconBg: "bg-slate-600",
      title: "text-slate-900",
      body: "text-slate-600",
      time: "text-slate-500",
    };
  }
  const t = stripAccents(tipo.toLowerCase());
  if (t.includes("robo")) {
    return {
      box: "border border-red-100 bg-red-50",
      iconBg: "bg-red-500",
      title: "text-red-900",
      body: "text-red-700",
      time: "text-red-600",
    };
  }
  if (t.includes("accidente")) {
    return {
      box: "border border-orange-100 bg-orange-50",
      iconBg: "bg-orange-500",
      title: "text-orange-950",
      body: "text-orange-800",
      time: "text-orange-600",
    };
  }
  return {
    box: "border border-indigo-100 bg-indigo-50/80",
    iconBg: "bg-indigo-600",
    title: "text-indigo-950",
    body: "text-indigo-800/90",
    time: "text-indigo-600",
  };
}

function stripAccents(s: string) {
  if (!s || typeof s !== "string") return "";
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function usarIconoEscudo(tipo: string) {
  if (!tipo || typeof tipo !== "string") return false;
  const t = stripAccents(tipo.toLowerCase());
  return (
    t.includes("robo") ||
    t.includes("acoso") ||
    t.includes("accidente") ||
    t.includes("otro")
  );
}

function textoRelativo(fechaIso: string) {
  try {
    return formatDistanceToNow(new Date(fechaIso), {
      addSuffix: true,
      locale: es,
    });
  } catch {
    return "Reciente";
  }
}

function rutaConDestino(nombre: string) {
  return `/rutas?destino=${encodeURIComponent(nombre)}`;
}

export default function Home() {
  const { user, token } = useAuth();
  const [alertas, setAlertas] = useState<AlertaRecienteApi[]>([]);
  const [cargandoAlertas, setCargandoAlertas] = useState(true);
  const [errorAlertas, setErrorAlertas] = useState<string | null>(null);
  const [lugares, setLugares] = useState<LugarFrecuenteApi[]>([]);
  const [cargandoLugares, setCargandoLugares] = useState(true);
  const [errorLugares, setErrorLugares] = useState<string | null>(null);

  const saludo = user?.nombre?.trim().split(/\s+/)[0] ?? "explorador";

  const fetchAlertas = useCallback(async () => {
    setCargandoAlertas(true);
    setErrorAlertas(null);
    try {
      const r = await fetch(
        apiUrl("/api/alertas/recientes?take=8&maxDays=30"),
        { cache: "no-store" },
      );
      if (!r.ok) {
        setErrorAlertas("No se pudieron cargar las alertas.");
        setAlertas([]);
        return;
      }
      const data: AlertasRecientesResponse = await r.json();
      setAlertas(Array.isArray(data.alertas) ? data.alertas : []);
    } catch {
      setErrorAlertas(
        "Revisa la conexión; no se pudo cargar el listado de alertas.",
      );
      setAlertas([]);
    } finally {
      setCargandoAlertas(false);
    }
  }, []);

  const fetchLugares = useCallback(async () => {
    if (!token) {
      setLugares([]);
      setCargandoLugares(false);
      return;
    }
    setCargandoLugares(true);
    setErrorLugares(null);
    try {
      const r = await fetch(apiUrl("/api/dashboard/lugares-frecuentes"), {
        headers: authJsonHeaders(token),
        cache: "no-store",
      });
      if (!r.ok) {
        setErrorLugares("No se pudieron cargar tus lugares frecuentes.");
        setLugares([]);
        return;
      }
      const data: LugaresFrecuentesResponse = await r.json();
      setLugares(Array.isArray(data.lugares) ? data.lugares : []);
    } catch {
      setErrorLugares("Error de conexión al cargar destinos.");
      setLugares([]);
    } finally {
      setCargandoLugares(false);
    }
  }, [token]);

  const recargar = useCallback(() => {
    void fetchAlertas();
    void fetchLugares();
  }, [fetchAlertas, fetchLugares]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <header className="relative overflow-hidden rounded-[2rem] bg-gradient-to-r from-indigo-700 via-violet-700 to-fuchsia-700 p-8 shadow-[0_30px_70px_rgba(67,56,202,0.18)] text-white">
        <div className="absolute inset-x-0 top-0 h-48 bg-white/10 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-4xl sm:text-5xl font-black tracking-tight">
                Hola, {saludo}
              </h1>
              <p className="mt-2 text-lg text-indigo-100 font-medium">
                ¿Hacia dónde te diriges hoy?
              </p>
            </div>
            <button
              type="button"
              onClick={recargar}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/25 bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/20"
            >
              <RefreshCw className="w-4 h-4" />
              Actualizar
            </button>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 max-w-2xl">
            <Link
              to="/rutas"
              className="flex-1 rounded-3xl bg-white px-6 py-4 text-indigo-700 font-bold shadow-lg transition hover:-translate-y-0.5 hover:bg-slate-50 text-center"
            >
              <span className="inline-flex items-center justify-center gap-2">
                <Navigation className="w-5 h-5" /> Buscar Ruta Segura
              </span>
            </Link>
            <Link
              to="/mapa"
              className="flex-1 rounded-3xl bg-indigo-900/90 border border-white/20 px-6 py-4 text-white font-bold shadow-lg transition hover:-translate-y-0.5 hover:bg-indigo-800 text-center"
            >
              <span className="inline-flex items-center justify-center gap-2">
                <MapPin className="w-5 h-5" /> Ver Mapa
              </span>
            </Link>
          </div>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
            <div>
              <h2 className="text-xl font-black text-slate-900">
                Alertas Recientes
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Las marcadas como recientes tienen menor prioridad según la
                caducidad configurada en admin.
              </p>
            </div>
            <Link
              to="/mapa"
              className="text-sm font-bold text-indigo-600 hover:text-indigo-700"
            >
              Ver en mapa
            </Link>
          </div>

          {cargandoAlertas ? (
            <div className="flex items-center justify-center gap-2 py-10 text-slate-500 text-sm">
              <Loader2 className="w-5 h-5 animate-spin" />
              Cargando alertas…
            </div>
          ) : errorAlertas ? (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
              {errorAlertas}
            </p>
          ) : alertas.length === 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-slate-50 px-6 py-10 text-center">
              <p className="text-sm font-semibold text-slate-800">
                No hay alertas recientes en tu zona.
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Cuando existan reportes de la comunidad, aparecerán aquí con
                nivel de seguridad (ML.NET).
              </p>
              <Link
                to="/reportar"
                className="mt-4 inline-flex rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-500"
              >
                Reportar un incidente
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {alertas.map((a) => {
                const tipo = String(a.tipoIncidente || "Otro");
                const esMenor = Boolean(a.esReporteMenor);
                const st = esMenor
                  ? {
                      box: "border border-slate-200 bg-slate-50/90 opacity-95",
                      iconBg: "bg-slate-400",
                      title: "text-slate-700",
                      body: "text-slate-600",
                      time: "text-slate-500",
                    }
                  : classAlerta(tipo, a.nivelSeguridad);
                const titulo = a.titulo || `${tipo}: ${a.ubicacion}`;
                const cuerpo = a.descripcion?.trim() || a.ubicacion;
                const Icono = usarIconoEscudo(tipo)
                  ? ShieldAlert
                  : AlertTriangle;
                return (
                  <div
                    key={a.id}
                    className={`rounded-3xl p-4 shadow-sm ${st.box}`}
                  >
                    <div className="flex gap-4 items-start">
                      <div
                        className={`shrink-0 rounded-3xl p-3 text-white shadow-lg ${st.iconBg}`}
                      >
                        <Icono className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          {esMenor ? (
                            <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-700">
                              Reciente
                            </span>
                          ) : null}
                          <span className="text-base" aria-hidden>
                            {a.indicadorVisual}
                          </span>
                          <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                            {a.etiquetaSeguridad}
                          </span>
                        </div>
                        <h3
                          className={`text-base font-bold leading-snug ${st.title}`}
                        >
                          {truncar(titulo, 120)}
                        </h3>
                        <p
                          className={`mt-2 text-sm leading-6 line-clamp-3 ${st.body}`}
                        >
                          {cuerpo}
                        </p>
                        <span
                          className={`mt-3 inline-block text-xs font-bold ${st.time}`}
                        >
                          {textoRelativo(a.fechaReporte)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-6">
          <div className="mb-5">
            <h2 className="text-xl font-black text-slate-900">
              Ir a un Lugar Frecuente
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Desde tu historial de rutas o ubicaciones guardadas.
            </p>
          </div>

          {cargandoLugares ? (
            <div className="flex items-center justify-center gap-2 py-10 text-slate-500 text-sm">
              <Loader2 className="w-5 h-5 animate-spin" />
              Cargando lugares…
            </div>
          ) : errorLugares ? (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
              {errorLugares}
            </p>
          ) : lugares.length === 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-8 text-center">
              <p className="text-sm font-medium text-slate-700">
                Aún no tienes destinos frecuentes.
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Busca una ruta o guarda ubicaciones en Perfil.
              </p>
              <Link
                to="/rutas"
                className="mt-4 inline-block text-sm font-bold text-indigo-600 hover:underline"
              >
                Buscar ruta
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {lugares.map((lugar) => (
                <Link
                  to={rutaConDestino(lugar.nombre)}
                  key={lugar.nombre}
                  className="group rounded-[1.75rem] border border-slate-200 bg-slate-50 px-4 py-5 text-center transition hover:border-indigo-300 hover:shadow-lg"
                >
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white text-3xl shadow-sm group-hover:bg-indigo-50">
                    {lugar.icono}
                  </div>
                  <h3 className="text-base font-bold text-slate-900">
                    {lugar.nombre}
                  </h3>
                  <p className="mt-2 text-xs text-slate-500 font-medium flex items-center justify-center gap-1">
                    <Clock className="w-3 h-3" />
                    {lugar.minutosAprox > 0
                      ? `${lugar.minutosAprox} min`
                      : "Buscar ruta"}
                    {lugar.usos > 0 && (
                      <span className="text-slate-400"> · {lugar.usos} usos</span>
                    )}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
