import { useCallback, useEffect, useState } from "react";
import { Bell, AlertCircle, Sparkles, RefreshCw } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { adminFetchJson } from "../lib/adminApi";
import { AdminPageHeader } from "../components/AdminPageHeader";
import { readApiErrorMessage } from "../lib/api";

type AlertaRow = {
  id: number;
  titulo: string;
  detalle?: string | null;
  prioridad: string;
  origen: string;
  ubicacionRef?: string | null;
  riesgoEstimadoPct: number;
  creadaEn: string;
};

export default function AdminAlertas() {
  const { token } = useAuth();
  const [list, setList] = useState<AlertaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setErr(null);
    try {
      const { data } = await adminFetchJson<AlertaRow[]>(
        "/api/Admin/alertas",
        token,
      );
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      if (e instanceof TypeError) {
        setErr("Sin conexión con la API. ¿`dotnet run` en backend y `npm run dev`?");
      } else {
        setErr(e instanceof Error ? e.message : "Error al cargar alertas.");
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <AdminPageHeader
        title="Alertas"
        subtitle="Alertas preventivas del sistema. Puedes generar más desde el Dashboard."
      />

      {err ? (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800 text-sm">
          <p className="flex-1">{err}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-xl bg-rose-900/90 px-3 py-2 text-xs font-bold text-white"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reintentar
          </button>
        </div>
      ) : null}

      <div className="space-y-4">
        {loading ? (
          <p className="text-slate-500">Cargando…</p>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[2rem] border border-dashed border-slate-200 bg-white py-16 text-center">
            <Bell className="w-10 h-10 text-slate-300 mb-3" />
            <p className="text-slate-600 font-bold">No hay alertas guardadas</p>
            <p className="text-sm text-slate-500 mt-1 max-w-md">
              Genera predicción desde el dashboard (necesitas reportes en los
              últimos 7 días en la base).
            </p>
          </div>
        ) : (
          list.map((a) => (
            <div
              key={a.id}
              className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div
                    className={`rounded-2xl p-2.5 ${
                      a.prioridad === "alta"
                        ? "bg-rose-100 text-rose-700"
                        : a.prioridad === "media"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {a.origen === "Auto" ? (
                      <Sparkles className="w-5 h-5" />
                    ) : (
                      <AlertCircle className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-slate-900">
                      {a.titulo}
                    </h2>
                    {a.ubicacionRef ? (
                      <p className="text-sm text-slate-500 mt-0.5">
                        {a.ubicacionRef}
                      </p>
                    ) : null}
                    {a.detalle ? (
                      <p className="text-sm text-slate-600 mt-2 max-w-2xl">
                        {a.detalle}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="text-right text-sm">
                  <div className="font-bold text-slate-900">
                    {a.riesgoEstimadoPct}%
                  </div>
                  <div className="text-slate-400">riesgo est.</div>
                  <div className="text-xs text-slate-400 mt-1">
                    {new Date(a.creadaEn).toLocaleString("es-PE")}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
