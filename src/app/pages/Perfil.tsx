import {
  Settings,
  Phone,
  MapPin,
  FileText,
  ChevronRight,
  LogOut,
  HeartPulse,
  History,
  ShieldAlert,
  Navigation,
  Trash2,
  Loader2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  fetchPreferencias,
  guardarPreferencias,
  type PreferenciasUsuario,
} from "../lib/preferenciasUsuario";
import { useNavigate } from "react-router";
import { useAuth } from "../contexts/AuthContext";
import { apiUrl, authJsonHeaders, readApiErrorMessage } from "../lib/api";
import { formatoFechaPerfil } from "../lib/fechaUi";

type ContactoApi = {
  id: number;
  nombre: string;
  telefono: string;
  email?: string | null;
  parentesco?: string | null;
  prioridad: number;
  esPrincipal: boolean;
};

type UbicacionApi = {
  id: number;
  etiqueta: string;
  direccion: string;
  latitud?: string | null;
  longitud?: string | null;
  icono?: string | null;
  orden: number;
};

type ReporteApi = {
  id: number;
  tipoIncidente: string;
  ubicacion: string;
  estado: string;
  fechaReporte: string;
  esAnonimo: boolean;
  descripcion?: string | null;
};

type RutaHistorialApi = {
  id: number;
  origenTexto: string;
  destinoTexto: string;
  modo: string;
  minutosAprox: number;
  kmAprox: number;
  rutaReferencia?: string | null;
  creadoEn: string;
};

function labelModoRuta(m: string) {
  const v = m.toLowerCase();
  if (v === "bike" || v === "bicicleta") return "Bicicleta";
  if (v === "peaton" || v === "peatón" || v === "pedestrian")
    return "Peatón";
  return m;
}

function initialsFromNombre(nombre: string) {
  const p = nombre.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return (p[0]![0] + p[p.length - 1]![0]).toUpperCase();
}

function fmtFecha(iso: string) {
  return formatoFechaPerfil(iso);
}

function estadoStyle(estado: string) {
  const e = estado.toLowerCase();
  if (e.includes("aprob") || e.includes("valid") || e.includes("resuel"))
    return "text-emerald-600 bg-emerald-50 border-emerald-200";
  if (e.includes("revis") || e.includes("pend"))
    return "text-amber-600 bg-amber-50 border-amber-200";
  return "text-blue-600 bg-blue-50 border-blue-200";
}

const iconosUbi = ["🏠", "🎓", "💼", "📍", "⭐"];

export default function Perfil() {
  const navigate = useNavigate();
  const { user, token, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<
    "principal" | "reportes" | "historial" | "configuracion"
  >("principal");

  const [contactos, setContactos] = useState<ContactoApi[]>([]);
  const [ubicaciones, setUbicaciones] = useState<UbicacionApi[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  const [showAddContact, setShowAddContact] = useState(false);
  const [ncNombre, setNcNombre] = useState("");
  const [ncTelefono, setNcTelefono] = useState("");
  const [ncEmail, setNcEmail] = useState("");
  const [ncParentesco, setNcParentesco] = useState("");
  const [ncPrioridad, setNcPrioridad] = useState(1);
  const [ncPrincipal, setNcPrincipal] = useState(false);
  const [savingContact, setSavingContact] = useState(false);

  const [showAddUbi, setShowAddUbi] = useState(false);
  const [nuEtiqueta, setNuEtiqueta] = useState("");
  const [nuDireccion, setNuDireccion] = useState("");
  const [nuIcono, setNuIcono] = useState("📍");
  const [savingUbi, setSavingUbi] = useState(false);

  const [prefs, setPrefs] = useState<PreferenciasUsuario | null>(null);
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsMsg, setPrefsMsg] = useState<string | null>(null);

  const [reportes, setReportes] = useState<ReporteApi[]>([]);
  const [loadingReportes, setLoadingReportes] = useState(false);

  const [rutasHistorial, setRutasHistorial] = useState<RutaHistorialApi[]>([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [historialError, setHistorialError] = useState<string | null>(null);

  const loadLists = useCallback(async () => {
    if (!token) {
      setLoadingData(false);
      return;
    }
    setDataError(null);
    setLoadingData(true);
    try {
      const [cRes, uRes] = await Promise.all([
        fetch(apiUrl("/api/Contactos/mios"), { headers: authJsonHeaders(token) }),
        fetch(apiUrl("/api/Ubicaciones/mias"), { headers: authJsonHeaders(token) }),
      ]);
      if (cRes.status === 401 || uRes.status === 401) {
        setDataError("Sesión expirada. Vuelve a iniciar sesión.");
        setContactos([]);
        setUbicaciones([]);
        return;
      }
      if (!cRes.ok) throw new Error("No se pudieron cargar los contactos.");
      if (!uRes.ok) throw new Error("No se pudieron cargar las ubicaciones.");
      setContactos(await cRes.json());
      setUbicaciones(await uRes.json());
    } catch (e) {
      setDataError(e instanceof Error ? e.message : "Error al cargar perfil.");
    } finally {
      setLoadingData(false);
    }
  }, [token]);

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  useEffect(() => {
    if (activeTab !== "reportes" || !token) return;
    let cancel = false;
    (async () => {
      setLoadingReportes(true);
      try {
        const r = await fetch(apiUrl("/api/Reportes/mios"), {
          headers: authJsonHeaders(token),
        });
        if (!r.ok) return;
        const j = await r.json();
        if (!cancel) setReportes(j);
      } finally {
        if (!cancel) setLoadingReportes(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [activeTab, token]);

  useEffect(() => {
    if (activeTab !== "configuracion" || !token) return;
    let cancel = false;
    (async () => {
      setPrefsLoading(true);
      setPrefsMsg(null);
      const p = await fetchPreferencias(token);
      if (!cancel) {
        setPrefs(
          p ?? {
            evitarZonasOscurasNoche: true,
            modoMovilidadPredeterminado: "peaton",
            alertasRiesgoTiempoReal: true,
            avisoAutomaticoLlegada: true,
          },
        );
        setPrefsLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [activeTab, token]);

  const handleGuardarPrefs = async () => {
    if (!token || !prefs) return;
    setPrefsSaving(true);
    setPrefsMsg(null);
    const saved = await guardarPreferencias(token, prefs);
    setPrefsSaving(false);
    if (saved) {
      setPrefs(saved);
      setPrefsMsg("Preferencias guardadas correctamente.");
    } else {
      setPrefsMsg("No se pudieron guardar. Intenta de nuevo.");
    }
  };

  useEffect(() => {
    if (activeTab !== "historial" || !token) {
      if (activeTab !== "historial") setHistorialError(null);
      return;
    }
    let cancel = false;
    (async () => {
      setLoadingHistorial(true);
      setHistorialError(null);
      try {
        const r = await fetch(apiUrl("/api/RutasHistorial/mias"), {
          headers: authJsonHeaders(token),
        });
        if (r.status === 401) {
          if (!cancel) {
            setRutasHistorial([]);
            setHistorialError("Sesión expirada. Vuelve a iniciar sesión.");
          }
          return;
        }
        if (!r.ok) {
          if (!cancel) {
            setHistorialError("No se pudo cargar el historial. Intenta de nuevo.");
            setRutasHistorial([]);
          }
          return;
        }
        const j: RutaHistorialApi[] = await r.json();
        if (!cancel) setRutasHistorial(j);
      } finally {
        if (!cancel) setLoadingHistorial(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [activeTab, token]);

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSavingContact(true);
    try {
      const r = await fetch(apiUrl("/api/Contactos/mios"), {
        method: "POST",
        headers: authJsonHeaders(token),
        body: JSON.stringify({
          Nombre: ncNombre.trim(),
          Telefono: ncTelefono.trim(),
          Email: ncEmail.trim() || null,
          Parentesco: ncParentesco.trim() || null,
          Prioridad: ncPrioridad,
          EsPrincipal: ncPrincipal,
        }),
      });
      if (r.status === 401) {
        logout();
        navigate("/", { replace: true });
        throw new Error(
          "Tu sesión ya no es válida en el servidor. Inicia sesión de nuevo.",
        );
      }
      if (!r.ok) {
        throw new Error(
          await readApiErrorMessage(r, "No se pudo guardar el contacto."),
        );
      }
      setShowAddContact(false);
      setNcNombre("");
      setNcTelefono("");
      setNcEmail("");
      setNcParentesco("");
      setNcPrioridad(1);
      setNcPrincipal(false);
      await loadLists();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Error");
    } finally {
      setSavingContact(false);
    }
  };

  const handleDeleteContact = async (id: number) => {
    if (!token) return;
    if (!window.confirm("¿Eliminar este contacto?")) return;
    const r = await fetch(apiUrl(`/api/Contactos/mios/${id}`), {
      method: "DELETE",
      headers: authJsonHeaders(token),
    });
    if (r.ok) loadLists();
    else window.alert("No se pudo eliminar.");
  };

  const handleAddUbi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSavingUbi(true);
    try {
      const orden =
        ubicaciones.length > 0
          ? Math.max(...ubicaciones.map((u) => u.orden)) + 1
          : 0;
      const r = await fetch(apiUrl("/api/Ubicaciones/mias"), {
        method: "POST",
        headers: authJsonHeaders(token),
        body: JSON.stringify({
          Etiqueta: nuEtiqueta.trim(),
          Direccion: nuDireccion.trim(),
          Latitud: null,
          Longitud: null,
          Icono: nuIcono,
          Orden: orden,
        }),
      });
      if (r.status === 401) {
        logout();
        navigate("/", { replace: true });
        throw new Error(
          "Tu sesión ya no es válida en el servidor. Inicia sesión de nuevo.",
        );
      }
      if (!r.ok) {
        throw new Error(
          await readApiErrorMessage(r, "No se pudo guardar la ubicación."),
        );
      }
      setShowAddUbi(false);
      setNuEtiqueta("");
      setNuDireccion("");
      setNuIcono("📍");
      await loadLists();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Error");
    } finally {
      setSavingUbi(false);
    }
  };

  const handleDeleteRutaHistorial = async (id: number) => {
    if (!token) return;
    if (!window.confirm("¿Quitar esta búsqueda del historial?")) return;
    const r = await fetch(`/api/RutasHistorial/mias/${id}`, {
      method: "DELETE",
      headers: authJsonHeaders(token),
    });
    if (r.ok) {
      setRutasHistorial((prev) => prev.filter((x) => x.id !== id));
    } else {
      window.alert("No se pudo eliminar la entrada.");
    }
  };

  const handleDeleteUbi = async (id: number) => {
    if (!token) return;
    if (!window.confirm("¿Eliminar esta ubicación?")) return;
    const r = await fetch(apiUrl(`/api/Ubicaciones/mias/${id}`), {
      method: "DELETE",
      headers: authJsonHeaders(token),
    });
    if (r.ok) loadLists();
    else window.alert("No se pudo eliminar.");
  };

  const onLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  if (activeTab === "reportes") {
    return (
      <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
        <button
          type="button"
          onClick={() => setActiveTab("principal")}
          className="flex items-center gap-2 text-indigo-600 font-bold mb-4 hover:bg-indigo-50 px-3 py-1.5 rounded-lg w-fit transition-colors"
        >
          <ChevronRight className="w-4 h-4 rotate-180" /> Volver al Perfil
        </button>
        <h1 className="text-2xl font-black text-slate-900">Mis reportes</h1>
        <p className="text-slate-500 font-medium">
          Incidencias guardadas en la base de datos.
        </p>

        {loadingReportes ? (
          <div className="flex items-center gap-2 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            Cargando…
          </div>
        ) : reportes.length === 0 ? (
          <p className="text-slate-500">Aún no has enviado reportes.</p>
        ) : (
          <div className="space-y-4">
            {reportes.map((rep) => (
              <div
                key={rep.id}
                className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="bg-slate-100 p-3 rounded-xl shrink-0">
                    <ShieldAlert className="w-6 h-6 text-slate-600" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-900">
                      {rep.tipoIncidente}
                      {rep.esAnonimo ? (
                        <span className="ml-2 text-xs font-bold text-slate-400">
                          (anónimo)
                        </span>
                      ) : null}
                    </h3>
                    <p className="text-sm text-slate-500 font-medium truncate">
                      {rep.ubicacion} · {fmtFecha(rep.fechaReporte)}
                    </p>
                    {rep.descripcion ? (
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                        {rep.descripcion}
                      </p>
                    ) : null}
                  </div>
                </div>
                <span
                  className={`self-start sm:self-center px-3 py-1 text-xs font-bold rounded-lg border ${estadoStyle(rep.estado)}`}
                >
                  {rep.estado}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (activeTab === "historial") {
    return (
      <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in slide-in-from-right-4 duration-300 pb-10">
        <button
          type="button"
          onClick={() => setActiveTab("principal")}
          className="flex items-center gap-2 text-indigo-600 font-bold mb-4 hover:bg-indigo-50 px-3 py-1.5 rounded-lg w-fit transition-colors"
        >
          <ChevronRight className="w-4 h-4 rotate-180" /> Volver al Perfil
        </button>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900">
              Historial de rutas
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Cada búsqueda en &quot;Buscar ruta&quot; se guarda aquí. Referencia
              de tiempo y distancia (ruta prioritaria).
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/rutas")}
            className="shrink-0 bg-indigo-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl shadow-sm hover:bg-indigo-700 transition-colors"
          >
            Buscar nueva ruta
          </button>
        </div>

        {historialError ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            {historialError}
          </p>
        ) : null}

        {loadingHistorial ? (
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <Loader2 className="w-5 h-5 animate-spin" /> Cargando historial…
          </div>
        ) : null}

        {!loadingHistorial && !historialError && rutasHistorial.length === 0 ? (
          <div className="bg-slate-50 border border-slate-200 border-dashed rounded-2xl p-8 text-center">
            <History className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 font-medium">
              Aún no hay búsquedas guardadas.
            </p>
            <p className="text-slate-500 text-sm mt-2 max-w-sm mx-auto">
              Ve a <span className="font-bold text-slate-700">Buscar ruta</span>{" "}
              en el menú, elige origen y destino en Lima, y al pulsar
              &quot;Buscar&quot; la ruta quedará en este listado.
            </p>
            <button
              type="button"
              onClick={() => navigate("/rutas")}
              className="mt-5 text-indigo-600 font-bold text-sm hover:underline"
            >
              Ir a Buscar ruta
            </button>
          </div>
        ) : null}

        {!loadingHistorial && rutasHistorial.length > 0 ? (
          <div className="space-y-3">
            {rutasHistorial.map((ruta) => (
              <div
                key={ruta.id}
                className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex gap-3 items-start"
              >
                <div className="mt-0.5 p-2 rounded-xl bg-indigo-50 text-indigo-600">
                  <Navigation className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-bold text-slate-900">
                    <span className="truncate max-w-[42%] sm:max-w-none">
                      {ruta.origenTexto}
                    </span>
                    <Navigation className="w-3.5 h-3.5 text-slate-400 rotate-90 shrink-0" />
                    <span className="truncate max-w-[42%] sm:max-w-none">
                      {ruta.destinoTexto}
                    </span>
                  </div>
                  {ruta.rutaReferencia ? (
                    <p className="text-xs text-slate-500 font-medium mt-1 truncate">
                      {ruta.rutaReferencia} · ~{ruta.minutosAprox} min ·{" "}
                      {ruta.kmAprox.toFixed(2)} km
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500 font-medium mt-1">
                      ~{ruta.minutosAprox} min · {ruta.kmAprox.toFixed(2)} km
                    </p>
                  )}
                  <p className="text-xs text-slate-400 mt-1.5">
                    {fmtFecha(ruta.creadoEn)} · {labelModoRuta(ruta.modo)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteRutaHistorial(ruta.id)}
                  className="shrink-0 p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                  title="Quitar del historial"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  if (activeTab === "configuracion") {
    const toggleClass =
      "h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-slate-200 transition checked:bg-indigo-600 relative after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition checked:after:translate-x-5";

    return (
      <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in slide-in-from-right-4 duration-300 pb-10">
        <button
          type="button"
          onClick={() => setActiveTab("principal")}
          className="flex items-center gap-2 text-indigo-600 font-bold mb-4 hover:bg-indigo-50 px-3 py-1.5 rounded-lg w-fit transition-colors"
        >
          <ChevronRight className="w-4 h-4 rotate-180" /> Volver al Perfil
        </button>
        <h1 className="text-2xl font-black text-slate-900">
          Configuración del sistema
        </h1>

        {prefsLoading || !prefs ? (
          <div className="flex items-center gap-2 text-slate-500 py-12 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" />
            Cargando preferencias…
          </div>
        ) : (
          <>
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
              <div className="p-5">
                <h3 className="font-bold text-slate-900 mb-4">
                  Preferencias de ruta
                </h3>
                <div className="space-y-4">
                  <label className="flex items-center justify-between gap-4">
                    <span className="text-sm font-medium text-slate-700">
                      Evitar zonas oscuras de noche
                    </span>
                    <input
                      type="checkbox"
                      checked={prefs.evitarZonasOscurasNoche}
                      onChange={(e) =>
                        setPrefs({
                          ...prefs,
                          evitarZonasOscurasNoche: e.target.checked,
                        })
                      }
                      className={toggleClass}
                    />
                  </label>
                  <p className="text-xs text-slate-500 -mt-2">
                    Entre 19:00 y 6:00 prioriza la ruta más segura al buscar
                    trayectos.
                  </p>
                  <label className="flex items-center justify-between gap-4">
                    <span className="text-sm font-medium text-slate-700">
                      Modo de movilidad predeterminado
                    </span>
                    <select
                      value={prefs.modoMovilidadPredeterminado}
                      onChange={(e) =>
                        setPrefs({
                          ...prefs,
                          modoMovilidadPredeterminado: e.target.value,
                        })
                      }
                      className="bg-slate-50 border border-slate-200 rounded-lg text-sm px-2 py-1.5 font-bold text-slate-700"
                    >
                      <option value="peaton">Peatón</option>
                      <option value="bike">Bicicleta</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="p-5">
                <h3 className="font-bold text-slate-900 mb-4">
                  Notificaciones y alertas
                </h3>
                <div className="space-y-4">
                  <label className="flex items-center justify-between gap-4">
                    <div>
                      <span className="text-sm font-medium text-slate-700 block">
                        Alertas de riesgo en tiempo real
                      </span>
                      <span className="text-xs text-slate-500">
                        Aviso en Mapa si la zona es peligrosa
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={prefs.alertasRiesgoTiempoReal}
                      onChange={(e) =>
                        setPrefs({
                          ...prefs,
                          alertasRiesgoTiempoReal: e.target.checked,
                        })
                      }
                      className={toggleClass}
                    />
                  </label>
                  <label className="flex items-center justify-between gap-4">
                    <div>
                      <span className="text-sm font-medium text-slate-700 block">
                        Aviso automático de llegada
                      </span>
                      <span className="text-xs text-slate-500">
                        Si sales de la navegación sin «Llegué bien»
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={prefs.avisoAutomaticoLlegada}
                      onChange={(e) =>
                        setPrefs({
                          ...prefs,
                          avisoAutomaticoLlegada: e.target.checked,
                        })
                      }
                      className={toggleClass}
                    />
                  </label>
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={prefsSaving}
              onClick={() => void handleGuardarPrefs()}
              className="w-full rounded-2xl bg-indigo-600 py-3.5 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {prefsSaving ? "Guardando…" : "Guardar preferencias"}
            </button>
            {prefsMsg && (
              <p
                className={`text-sm font-medium text-center ${
                  prefsMsg.includes("correctamente")
                    ? "text-emerald-700"
                    : "text-amber-800"
                }`}
              >
                {prefsMsg}
              </p>
            )}
          </>
        )}
      </div>
    );
  }

  const nombre = user?.nombre ?? "Usuario";
  const email = user?.email ?? "";

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      {showAddContact && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50">
          <form
            onSubmit={handleAddContact}
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <h3 className="text-lg font-black text-slate-900">Nuevo contacto</h3>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600">Nombre</label>
              <input
                required
                value={ncNombre}
                onChange={(e) => setNcNombre(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-3 py-2"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600">
                Teléfono
              </label>
              <input
                required
                value={ncTelefono}
                onChange={(e) => setNcTelefono(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-3 py-2"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600">
                Email (opcional)
              </label>
              <input
                type="email"
                value={ncEmail}
                onChange={(e) => setNcEmail(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-3 py-2"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600">
                Parentesco (opcional)
              </label>
              <input
                value={ncParentesco}
                onChange={(e) => setNcParentesco(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-3 py-2"
              />
            </div>
            <div className="flex gap-3 items-end">
              <div className="flex-1 space-y-2">
                <label className="text-xs font-bold text-slate-600">
                  Prioridad SOS
                </label>
                <select
                  value={ncPrioridad}
                  onChange={(e) => setNcPrioridad(Number(e.target.value))}
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2 font-bold"
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm font-bold text-slate-700 pb-2">
                <input
                  type="checkbox"
                  checked={ncPrincipal}
                  onChange={(e) => setNcPrincipal(e.target.checked)}
                />
                Principal
              </label>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddContact(false)}
                className="flex-1 rounded-2xl border border-slate-200 py-3 font-bold text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingContact}
                className="flex-1 rounded-2xl bg-indigo-600 py-3 font-bold text-white disabled:opacity-60"
              >
                {savingContact ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      )}

      {showAddUbi && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50">
          <form
            onSubmit={handleAddUbi}
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl border border-slate-200 space-y-4"
          >
            <h3 className="text-lg font-black text-slate-900">
              Nueva ubicación
            </h3>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600">Nombre</label>
              <input
                required
                value={nuEtiqueta}
                onChange={(e) => setNuEtiqueta(e.target.value)}
                placeholder="Casa, trabajo…"
                className="w-full rounded-2xl border border-slate-200 px-3 py-2"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600">
                Dirección
              </label>
              <input
                required
                value={nuDireccion}
                onChange={(e) => setNuDireccion(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-3 py-2"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600">Icono</label>
              <div className="flex gap-2 flex-wrap">
                {iconosUbi.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setNuIcono(ic)}
                    className={`text-2xl w-12 h-12 rounded-2xl border-2 ${
                      nuIcono === ic
                        ? "border-indigo-500 bg-indigo-50"
                        : "border-slate-200"
                    }`}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddUbi(false)}
                className="flex-1 rounded-2xl border border-slate-200 py-3 font-bold text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingUbi}
                className="flex-1 rounded-2xl bg-indigo-600 py-3 font-bold text-white disabled:opacity-60"
              >
                {savingUbi ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      )}

      <header className="flex items-center gap-6">
        <div className="w-24 h-24 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-2xl font-black border-4 border-white shadow-md relative">
          {initialsFromNombre(nombre)}
          <div className="absolute bottom-0 right-0 w-6 h-6 bg-emerald-500 border-2 border-white rounded-full" />
        </div>
        <div>
          <h1 className="text-3xl font-black text-slate-900">{nombre}</h1>
          <p className="text-slate-500 font-medium">{email || "—"}</p>
          <div className="mt-2 inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-700 px-3 py-1 rounded-lg text-xs font-bold">
            <HeartPulse className="w-3.5 h-3.5" /> Cuenta activa
          </div>
        </div>
      </header>

      {dataError && (
        <p className="text-amber-700 text-sm font-medium bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
          {dataError}
        </p>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Phone className="w-5 h-5 text-indigo-600" />
              Contactos SOS
            </h2>
            <button
              type="button"
              onClick={() => setShowAddContact(true)}
              disabled={!token || loadingData}
              className="text-indigo-600 text-sm font-bold hover:underline disabled:opacity-50"
            >
              Añadir
            </button>
          </div>

          {loadingData ? (
            <div className="flex items-center gap-2 text-slate-500 py-4">
              <Loader2 className="w-5 h-5 animate-spin" />
              Cargando…
            </div>
          ) : contactos.length === 0 ? (
            <p className="text-slate-500 text-sm">
              No hay contactos. Añade uno de emergencia.
            </p>
          ) : (
            <div className="space-y-4">
              {contactos.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 gap-2"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900">{c.nombre}</p>
                    <p className="text-slate-500 text-sm font-medium">
                      {c.telefono}
                    </p>
                    {c.parentesco ? (
                      <p className="text-xs text-slate-400">{c.parentesco}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={
                        c.prioridad <= 1
                          ? "bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-md"
                          : c.prioridad === 2
                            ? "bg-amber-100 text-amber-700 text-xs font-bold px-2 py-1 rounded-md"
                            : "bg-slate-200 text-slate-700 text-xs font-bold px-2 py-1 rounded-md"
                      }
                    >
                      SOS {c.prioridad}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteContact(c.id)}
                      className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50"
                      aria-label="Eliminar contacto"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-indigo-600" />
              Ubicaciones guardadas
            </h2>
            <button
              type="button"
              onClick={() => setShowAddUbi(true)}
              disabled={!token || loadingData}
              className="text-indigo-600 text-sm font-bold hover:underline disabled:opacity-50"
            >
              Añadir
            </button>
          </div>

          {loadingData ? (
            <div className="flex items-center gap-2 text-slate-500 py-4">
              <Loader2 className="w-5 h-5 animate-spin" />
              Cargando…
            </div>
          ) : ubicaciones.length === 0 ? (
            <p className="text-slate-500 text-sm">
              No hay lugares guardados. Añade casa, estudio o trabajo.
            </p>
          ) : (
            <div className="space-y-3">
              {ubicaciones.map((place) => (
                <div
                  key={place.id}
                  className="flex items-center gap-4 p-3 hover:bg-slate-50 rounded-xl transition-colors group"
                >
                  <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-lg">
                    {place.icono ?? "📍"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900">{place.etiqueta}</p>
                    <p className="text-slate-500 text-xs font-medium truncate pr-4">
                      {place.direccion}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleDeleteUbi(place.id)}
                      className="p-2 rounded-xl text-slate-400 opacity-0 group-hover:opacity-100 hover:text-red-600 hover:bg-red-50"
                      aria-label="Eliminar ubicación"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="divide-y divide-slate-100">
          <button
            type="button"
            onClick={() => setActiveTab("historial")}
            className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <History className="w-5 h-5" />
              </div>
              <span className="font-bold text-slate-700">
                Historial de rutas
              </span>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400" />
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("reportes")}
            className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <FileText className="w-5 h-5" />
              </div>
              <span className="font-bold text-slate-700">Mis reportes</span>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400" />
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("configuracion")}
            className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <Settings className="w-5 h-5" />
              </div>
              <span className="font-bold text-slate-700">Configuración</span>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400" />
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center justify-between p-5 hover:bg-red-50 transition-colors text-red-600"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-50 text-red-600 rounded-lg">
                <LogOut className="w-5 h-5" />
              </div>
              <span className="font-bold">Cerrar sesión</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
