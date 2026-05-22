import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Filter,
  MoreHorizontal,
  X,
  Brain,
  Loader2,
} from "lucide-react";
import { apiUrl, authJsonHeaders } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import {
  fetchAnalisisMlReporte,
  type AnalisisMlReporte,
} from "../lib/adminApi";
import { AdminPageHeader } from "../components/AdminPageHeader";

interface ReporteItem {
  id: number;
  tipoIncidente: string;
  ubicacion: string;
  descripcion: string;
  estado: string;
  fechaReporte: string;
  nivelConfianzaIA?: number;
  esAnonimo?: boolean;
  usuario: { nombre: string; email: string } | null;
  latitud?: string | null;
  longitud?: string | null;
  urlFotoEvidencia?: string | null;
}

export default function AdminIncidents() {
  const { token } = useAuth();
  const [reportes, setReportes] = useState<ReporteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<ReporteItem | null>(null);
  const [menuReporteId, setMenuReporteId] = useState<number | null>(null);
  const [mlAnalisis, setMlAnalisis] = useState<AnalisisMlReporte | null>(null);
  const [mlLoading, setMlLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    fetch(apiUrl("/api/Reportes"), { headers: authJsonHeaders(token) })
      .then((res) => res.json())
      .then((data) => setReportes(data || []))
      .catch(() => setReportes([]))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (menuReporteId == null) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuReporteId(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuReporteId]);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  };

  const cargarMl = async (id: number) => {
    if (!token) return;
    setMlLoading(true);
    setMlAnalisis(null);
    try {
      setMlAnalisis(await fetchAnalisisMlReporte(token, id));
    } catch {
      showToast("No se pudo cargar el análisis ML.");
    } finally {
      setMlLoading(false);
    }
  };

  const handleApprove = async (id: number) => {
    if (!token) return;
    setActionLoading(id);
    setMenuReporteId(null);
    const response = await fetch(apiUrl(`/api/Reportes/Aprobar/${id}`), {
      method: "POST",
      headers: authJsonHeaders(token),
    });
    if (response.ok) {
      setReportes((current) =>
        current.map((item) =>
          item.id === id ? { ...item, estado: "Aprobado" } : item,
        ),
      );
      setDetalle((d) => (d?.id === id ? { ...d, estado: "Aprobado" } : d));
      showToast("Reporte aprobado.");
    } else {
      showToast("No se pudo aprobar. Revisa la consola de la API.");
    }
    setActionLoading(null);
  };

  const handleReject = async (id: number) => {
    if (
      !window.confirm(
        "¿Rechazar este reporte? Dejará de mostrarse en listados públicos de recientes.",
      )
    ) {
      return;
    }
    if (!token) return;
    setActionLoading(id);
    setMenuReporteId(null);
    const response = await fetch(apiUrl(`/api/Reportes/Rechazar/${id}`), {
      method: "POST",
      headers: authJsonHeaders(token),
    });
    if (response.ok) {
      setReportes((current) =>
        current.map((item) =>
          item.id === id ? { ...item, estado: "Rechazado" } : item,
        ),
      );
      setDetalle((d) => (d?.id === id ? { ...d, estado: "Rechazado" } : d));
      showToast("Reporte rechazado.");
    } else {
      showToast("No se pudo rechazar.");
    }
    setActionLoading(null);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      {toast ? (
        <div className="fixed top-4 right-4 z-[60] rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-lg">
          {toast}
        </div>
      ) : null}

      {detalle ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50"
            onClick={() => {
              setDetalle(null);
              setMlAnalisis(null);
            }}
            aria-label="Cerrar"
          />
          <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-xl z-10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  REP-{String(detalle.id).padStart(3, "0")}
                </p>
                <h2 className="mt-1 text-xl font-black text-slate-900">
                  {detalle.tipoIncidente}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDetalle(null);
                  setMlAnalisis(null);
                }}
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <p>
                <span className="font-bold text-slate-700">Autor: </span>
                {detalle.esAnonimo
                  ? "Anónimo"
                  : (detalle.usuario?.nombre ?? "—")}{" "}
                {!detalle.esAnonimo && detalle.usuario?.email
                  ? `(${detalle.usuario.email})`
                  : null}
              </p>
              <p>
                <span className="font-bold text-slate-700">Estado: </span>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${
                    detalle.estado === "Aprobado"
                      ? "bg-emerald-100 text-emerald-800"
                      : detalle.estado === "Rechazado"
                        ? "bg-rose-100 text-rose-800"
                        : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {detalle.estado}
                </span>
              </p>
              <p>
                <span className="font-bold text-slate-700">Fecha: </span>
                {new Date(detalle.fechaReporte).toLocaleString("es-PE")}
              </p>
              <p>
                <span className="font-bold text-slate-700">Ubicación: </span>
                {detalle.ubicacion}
              </p>
              {(detalle.latitud && detalle.longitud) || detalle.latitud ? (
                <p className="text-slate-600">
                  <span className="font-bold text-slate-700">
                    Coordenadas:{" "}
                  </span>
                  {detalle.latitud}, {detalle.longitud}
                </p>
              ) : null}
              {detalle.descripcion ? (
                <div>
                  <span className="font-bold text-slate-700">Descripción</span>
                  <p className="mt-1 text-slate-600 whitespace-pre-wrap">
                    {detalle.descripcion}
                  </p>
                </div>
              ) : null}
              {detalle.urlFotoEvidencia ? (
                <div>
                  <span className="font-bold text-slate-700">Evidencia</span>
                  <a
                    href={detalle.urlFotoEvidencia}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block truncate text-indigo-600 hover:underline"
                  >
                    Abrir enlace
                  </a>
                </div>
              ) : null}
            </div>

            <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/80 p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-bold uppercase text-indigo-800 flex items-center gap-1">
                  <Brain className="w-3.5 h-3.5" /> Análisis predictivo
                </span>
                <button
                  type="button"
                  disabled={mlLoading}
                  onClick={() => void cargarMl(detalle.id)}
                  className="text-xs font-bold text-indigo-700 hover:text-indigo-900 disabled:opacity-50"
                >
                  {mlLoading ? "Analizando…" : "Ejecutar"}
                </button>
              </div>
              {mlLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
              ) : mlAnalisis ? (
                <div className="text-sm text-slate-700 space-y-2">
                  <p>
                    <span className="font-bold">Tipo predicho: </span>
                    {mlAnalisis.clasificacion?.tipoPredicho ?? "—"} (
                    {mlAnalisis.clasificacion?.confianzaPct ?? 0}%)
                  </p>
                  <p>
                    <span className="font-bold">Zona: </span>
                    {mlAnalisis.zona.indicadorVisual} {mlAnalisis.zona.etiqueta}
                  </p>
                  <p className="text-xs text-indigo-900 font-medium">
                    {mlAnalisis.sugerencia}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Clasificación de incidente + seguridad de zona antes de aprobar.
                </p>
              )}
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  void handleApprove(detalle.id);
                }}
                disabled={
                  actionLoading === detalle.id || detalle.estado === "Aprobado"
                }
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                Aprobar
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleReject(detalle.id);
                }}
                disabled={
                  actionLoading === detalle.id || detalle.estado === "Rechazado"
                }
                className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-800 transition hover:bg-rose-100 disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" />
                Rechazar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <AdminPageHeader
        title="Gestión de Reportes"
        subtitle="Revisa, aprueba o rechaza los reportes de la comunidad."
      />

      <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-[1.5fr_1fr_1.5fr_0.9fr_0.8fr] gap-4 p-5 text-sm font-bold uppercase tracking-[0.12em] text-slate-500 border-b border-slate-200">
          <span>ID Reporte</span>
          <span>Usuario / Tipo</span>
          <span>Ubicación</span>
          <span>Estado</span>
          <span className="text-right">Acciones</span>
        </div>
        <div className="space-y-3 p-5">
          {loading ? (
            <div className="text-center text-slate-500 py-12">
              Cargando reportes...
            </div>
          ) : reportes.length === 0 ? (
            <div className="text-center text-slate-500 py-12">
              No hay reportes disponibles.
            </div>
          ) : (
            reportes.map((reporte) => (
              <div
                key={reporte.id}
                className="grid grid-cols-[1.5fr_1fr_1.5fr_0.9fr_0.8fr] gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-4 items-center"
              >
                <div className="font-bold text-slate-900">
                  REP-{String(reporte.id).padStart(3, "0")}
                </div>
                <div>
                  <div className="font-bold text-slate-900">
                    {reporte.tipoIncidente}
                  </div>
                  <div className="text-xs text-slate-500">
                    Por:{" "}
                    {reporte.esAnonimo
                      ? "Anónimo"
                      : (reporte.usuario?.nombre ?? "—")}
                  </div>
                </div>
                <div>
                  <div className="font-bold text-slate-900 line-clamp-2">
                    {reporte.ubicacion}
                  </div>
                  <div className="text-xs text-slate-500">
                    {new Date(reporte.fechaReporte).toLocaleString("es-PE")}
                  </div>
                </div>
                <div>
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                      reporte.estado === "Aprobado"
                        ? "bg-emerald-100 text-emerald-700"
                        : reporte.estado === "Rechazado"
                          ? "bg-rose-100 text-rose-700"
                          : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {reporte.estado}
                  </span>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    title="Aprobar"
                    onClick={() => void handleApprove(reporte.id)}
                    disabled={
                      actionLoading === reporte.id ||
                      reporte.estado === "Aprobado"
                    }
                    className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-3 py-2 text-white text-xs font-bold transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    title="Rechazar"
                    onClick={() => void handleReject(reporte.id)}
                    disabled={
                      actionLoading === reporte.id ||
                      reporte.estado === "Rechazado"
                    }
                    className="inline-flex items-center justify-center rounded-2xl border-2 border-rose-200 bg-white px-3 py-2 text-rose-600 text-xs font-bold transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                  <div
                    className="relative"
                    ref={menuReporteId === reporte.id ? menuRef : undefined}
                  >
                    <button
                      type="button"
                      title="Más acciones"
                      onClick={() =>
                        setMenuReporteId(
                          menuReporteId === reporte.id ? null : reporte.id,
                        )
                      }
                      className="inline-flex items-center justify-center rounded-2xl bg-white border border-slate-200 px-3 py-2 text-slate-600 text-xs font-bold transition hover:border-slate-300"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                    {menuReporteId === reporte.id ? (
                      <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-2xl border border-slate-200 bg-white py-1.5 text-left shadow-lg">
                        <button
                          type="button"
                          onClick={() => {
                            setDetalle(reporte);
                            setMenuReporteId(null);
                          }}
                          className="w-full px-3 py-2 text-left text-sm font-bold text-slate-800 hover:bg-slate-50"
                        >
                          Ver ficha completa
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            setMenuReporteId(null);
                            try {
                              await navigator.clipboard.writeText(
                                `ID ${reporte.id} — ${reporte.tipoIncidente} (${reporte.ubicacion})`,
                              );
                              showToast("Resumen copiado al portapapeles");
                            } catch {
                              showToast("No se pudo copiar");
                            }
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50"
                        >
                          Copiar resumen
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
