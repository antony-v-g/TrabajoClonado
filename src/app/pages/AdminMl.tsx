import { useCallback, useEffect, useState } from "react";
import {
  Brain,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Sparkles,
  Route,
} from "lucide-react";
import { apiUrl, authJsonHeaders, readApiErrorMessage } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

type MlEstado = {
  clasificacionLista: boolean;
  recomendacionLista: boolean;
  rutaClasificador: string;
  rutaRecomendador: string;
  reportesEnBd: number;
  rutasEnBd: number;
  tiposIncidente: string[];
};

export default function AdminMl() {
  const { token } = useAuth();
  const [estado, setEstado] = useState<MlEstado | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [trainMsg, setTrainMsg] = useState<string | null>(null);
  const [training, setTraining] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(apiUrl("/api/Ml/estado"));
      if (!r.ok)
        throw new Error(await readApiErrorMessage(r, "Error al cargar estado"));
      setEstado((await r.json()) as MlEstado);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error de conexión");
      setEstado(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const entrenar = async () => {
    if (!token) {
      setTrainMsg("Inicia sesión como administrador.");
      return;
    }
    setTraining(true);
    setTrainMsg(null);
    try {
      const r = await fetch(apiUrl("/api/Ml/entrenar"), {
        method: "POST",
        headers: authJsonHeaders(token),
      });
      if (!r.ok) throw new Error(await readApiErrorMessage(r, "No se pudo entrenar"));
      const j = await r.json();
      setTrainMsg(
        `Listo. Clasificación: ${j.clasificacion?.trainingRows ?? "?"} filas · Recomendación: ${j.recomendacion?.trainingRows ?? "?"} filas.`,
      );
      await load();
    } catch (e) {
      setTrainMsg(e instanceof Error ? e.message : "Error al entrenar");
    } finally {
      setTraining(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 rounded-2xl bg-indigo-600 text-white">
            <Brain className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-black text-slate-900">ML .NET</h1>
        </div>

        {err && (
          <p className="mb-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 text-sm">
            {err}
          </p>
        )}

        {loading ? (
          <p className="text-slate-500">Cargando…</p>
        ) : estado ? (
          <div className="space-y-6">
            <div className="grid sm:grid-cols-2 gap-4">
              <ModelCard
                title="Clasificación"
                icon={<Sparkles className="w-5 h-5" />}
                ready={estado.clasificacionLista}
              />
              <ModelCard
                title="Recomendación"
                icon={<Route className="w-5 h-5" />}
                ready={estado.recomendacionLista}
              />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <ul className="space-y-2 text-sm text-slate-700">
                <li>
                  Reportes: <strong>{estado.reportesEnBd}</strong>
                </li>
                <li>
                  Rutas en historial: <strong>{estado.rutasEnBd}</strong>
                </li>
                <li>
                  Tipos: {estado.tiposIncidente?.join(", ") ?? "—"}
                </li>
              </ul>
            </div>

            <button
              type="button"
              disabled={training}
              onClick={() => void entrenar()}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-6 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <RefreshCw
                className={`w-4 h-4 ${training ? "animate-spin" : ""}`}
              />
              {training ? "Actualizando…" : "Actualizar modelos"}
            </button>

            {trainMsg && (
              <p className="text-sm text-slate-600 rounded-xl bg-slate-100 px-4 py-3">
                {trainMsg}
              </p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ModelCard({
  title,
  icon,
  ready,
}: {
  title: string;
  icon: React.ReactNode;
  ready: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-indigo-700 font-bold">
          {icon}
          {title}
        </div>
        {ready ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
        ) : (
          <XCircle className="w-5 h-5 text-amber-500" />
        )}
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-700">
        {ready ? "Activo" : "Inactivo"}
      </p>
    </div>
  );
}
