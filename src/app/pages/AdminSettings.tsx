import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Database,
  Save,
  Bell,
  AlertTriangle,
  Sparkles,
  ShieldAlert,
  CheckCircle2,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Link } from "react-router";
import { apiUrl, authJsonHeaders, readApiErrorMessage } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { adminFetchJson, fetchRedisEstado } from "../lib/adminApi";
import { AdminPageHeader } from "../components/AdminPageHeader";

type ConfigDatos = {
  umbralRiesgoAlertaAltaPct: number;
  umbralRiesgoAlertaMediaPct: number;
};

type Resumen7d = {
  total: number;
  alta: number;
  media: number;
  baja: number;
  preventivasMl: number;
  sos: number;
  llegueBien: number;
};

type AlertaRiesgoResumen = {
  umbralRiesgoAlertaAltaPct: number;
  umbralRiesgoAlertaMediaPct: number;
  resumen7d: Resumen7d;
  ultimas: Array<{
    id: number;
    titulo: string;
    prioridad: string;
    origen: string;
    riesgoEstimadoPct: number;
    creadaEn: string;
  }>;
};

export default function AdminSettings() {
  const { token } = useAuth();
  const [umbrales, setUmbrales] = useState<ConfigDatos | null>(null);
  const [resumen, setResumen] = useState<AlertaRiesgoResumen | null>(null);
  const [dbMsg, setDbMsg] = useState<string | null>(null);
  const [dbOk, setDbOk] = useState<boolean | null>(null);
  const [redisMsg, setRedisMsg] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);
  const [loadingRiesgo, setLoadingRiesgo] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [riesgoErr, setRiesgoErr] = useState<string | null>(null);

  const loadRiesgo = useCallback(async () => {
    if (!token) return;
    setLoadingRiesgo(true);
    setRiesgoErr(null);
    setUmbrales({
      umbralRiesgoAlertaAltaPct: 80,
      umbralRiesgoAlertaMediaPct: 50,
    });

    try {
      const cfgRes = await adminFetchJson<ConfigDatos>(
        "/api/Admin/configuracion",
        token,
      );
      setUmbrales({
        umbralRiesgoAlertaAltaPct: cfgRes.data.umbralRiesgoAlertaAltaPct ?? 80,
        umbralRiesgoAlertaMediaPct: cfgRes.data.umbralRiesgoAlertaMediaPct ?? 50,
      });
    } catch (e) {
      setRiesgoErr(
        e instanceof Error
          ? `${e.message} — Reinicia la API (npm run start:api) tras actualizar el código.`
          : "No se pudo cargar configuración.",
      );
    }

    try {
      const riesgoRes = await fetch(
        apiUrl("/api/Admin/alertas-riesgo/resumen"),
        {
          headers: authJsonHeaders(token),
          cache: "no-store",
        },
      );
      if (riesgoRes.ok) {
        setResumen((await riesgoRes.json()) as AlertaRiesgoResumen);
      } else {
        setResumen(null);
        setRiesgoErr(
          await readApiErrorMessage(
            riesgoRes,
            "Resumen de alertas no disponible. ¿Reiniciaste el servidor?",
          ),
        );
      }
    } catch {
      setResumen(null);
      setRiesgoErr((prev) =>
        prev ??
        "Sin conexión al resumen de alertas. Comprueba que la API esté en marcha.",
      );
    } finally {
      setLoadingRiesgo(false);
    }
  }, [token]);

  const probarDb = useCallback(async () => {
    setProbing(true);
    setDbMsg(null);
    setDbOk(null);
    setRedisMsg(null);
    try {
      const r = await fetch(apiUrl("/api/Admin/db-health"));
      const j = (await r.json()) as {
        ok?: boolean;
        message?: string;
        redis?: { habilitado?: boolean; message?: string; clavesAdmin?: number };
      };
      setDbOk(!!j?.ok);
      setDbMsg(j?.message || (j?.ok ? "Conexión correcta" : "Error"));
      if (j?.redis?.message) setRedisMsg(j.redis.message);
      if (token) {
        const estado = await fetchRedisEstado(token);
        if (estado?.mensaje) setRedisMsg(estado.mensaje);
      }
    } catch {
      setDbOk(false);
      setDbMsg("No se pudo contactar a la API.");
    } finally {
      setProbing(false);
    }
  }, [token]);

  useEffect(() => {
    void probarDb();
    void loadRiesgo();
  }, [probarDb, loadRiesgo]);

  const guardarUmbrales = async () => {
    if (!token || !umbrales) return;
    if (umbrales.umbralRiesgoAlertaMediaPct >= umbrales.umbralRiesgoAlertaAltaPct) {
      setSaveMsg("La prioridad media debe ser menor que la prioridad alta.");
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const r = await fetch(apiUrl("/api/Admin/configuracion"), {
        method: "PUT",
        headers: authJsonHeaders(token),
        body: JSON.stringify({
          umbralRiesgoAlertaAltaPct: umbrales.umbralRiesgoAlertaAltaPct,
          umbralRiesgoAlertaMediaPct: umbrales.umbralRiesgoAlertaMediaPct,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error();
      setSaveMsg(j.message as string);
      await loadRiesgo();
    } catch {
      setSaveMsg("No se pudo guardar la política de alertas.");
    } finally {
      setSaving(false);
    }
  };

  const generarPreventivas = async () => {
    if (!token) return;
    setGenerando(true);
    setActionMsg(null);
    try {
      const r = await fetch(apiUrl("/api/Admin/alertas/generar"), {
        method: "POST",
        headers: authJsonHeaders(token),
      });
      const j = (await r.json()) as { message?: string; creadas?: number };
      if (!r.ok) throw new Error();
      setActionMsg(j.message ?? `Se crearon ${j.creadas ?? 0} alerta(s).`);
      await loadRiesgo();
    } catch {
      setActionMsg("No se pudieron generar alertas. ¿Hay reportes en los últimos 7 días?");
    } finally {
      setGenerando(false);
    }
  };

  const r7 = resumen?.resumen7d;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <AdminPageHeader
        title="Configuración"
        subtitle="Estado del servidor y política de alertas y riesgo (ML + eventos SOS)."
      />

      <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm max-w-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-3xl bg-indigo-50 p-3 text-indigo-600">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Estado del sistema</h2>
            <p className="text-sm text-slate-500">
              Comprueba que el servidor y la base de datos respondan.
            </p>
          </div>
        </div>
        {dbMsg ? (
          <p
            className={`text-sm font-medium mb-2 ${dbOk ? "text-emerald-800" : "text-rose-800"}`}
          >
            {dbMsg}
          </p>
        ) : null}
        {redisMsg ? (
          <p className="text-sm text-slate-600 mb-4">{redisMsg}</p>
        ) : null}
        <button
          type="button"
          onClick={() => void probarDb()}
          disabled={probing}
          className="inline-flex items-center gap-3 rounded-3xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          <Database className="w-5 h-5" />
          {probing ? "Comprobando…" : "Probar conexión"}
        </button>
      </div>

      <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <div className="rounded-3xl bg-rose-50 p-3 text-rose-600">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Alertas y riesgo</h2>
            <p className="text-sm text-slate-500">
              Umbrales para prioridad, resumen de 7 días y generación preventiva
              con ML (zonas con más reportes).
            </p>
          </div>
        </div>

        {loadingRiesgo ? (
          <div className="flex items-center gap-2 text-slate-500 text-sm py-6">
            <Loader2 className="w-5 h-5 animate-spin" />
            Cargando resumen…
          </div>
        ) : r7 ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                label="Total 7 d"
                value={r7.total}
                icon={<Bell className="w-4 h-4" />}
              />
              <StatCard
                label="Prioridad alta"
                value={r7.alta}
                tone="rose"
                icon={<AlertTriangle className="w-4 h-4" />}
              />
              <StatCard
                label="SOS / emergencia"
                value={r7.sos}
                tone="rose"
                icon={<ShieldAlert className="w-4 h-4" />}
              />
              <StatCard
                label="Llegué bien"
                value={r7.llegueBien}
                tone="emerald"
                icon={<CheckCircle2 className="w-4 h-4" />}
              />
              <StatCard
                label="Preventivas ML"
                value={r7.preventivasMl}
                icon={<Sparkles className="w-4 h-4" />}
              />
              <StatCard label="Media" value={r7.media} tone="amber" />
              <StatCard label="Baja" value={r7.baja} />
            </div>

            {resumen?.ultimas && resumen.ultimas.length > 0 ? (
              <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                <p className="text-xs font-bold uppercase text-slate-500 mb-2">
                  Últimas alertas
                </p>
                <ul className="space-y-2 text-sm">
                  {resumen.ultimas.map((a) => (
                    <li
                      key={a.id}
                      className="flex flex-wrap justify-between gap-2 text-slate-800"
                    >
                      <span className="font-medium truncate max-w-[70%]">
                        {a.titulo}
                      </span>
                      <span className="text-xs font-bold uppercase text-slate-500">
                        {a.prioridad} · {a.riesgoEstimadoPct}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : riesgoErr ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p>{riesgoErr}</p>
            <button
              type="button"
              onClick={() => void loadRiesgo()}
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-900/90 px-3 py-2 text-xs font-bold text-white"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reintentar
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No se pudo cargar el resumen de alertas.</p>
        )}

        {umbrales ? (
          <div className="space-y-4 border-t border-slate-100 pt-5">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">
              Política de prioridad
            </h3>
            <p className="text-sm text-slate-600">
              Al <strong>generar alertas preventivas</strong>, el riesgo % se
              clasifica así: ≥ alta → prioridad alta; ≥ media → media; si no →
              baja.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block text-sm">
                <span className="font-bold text-slate-700">
                  Umbral prioridad alta (%)
                </span>
                <input
                  type="number"
                  min={2}
                  max={100}
                  value={umbrales.umbralRiesgoAlertaAltaPct}
                  onChange={(e) =>
                    setUmbrales({
                      ...umbrales,
                      umbralRiesgoAlertaAltaPct: Number(e.target.value),
                    })
                  }
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-2.5"
                />
              </label>
              <label className="block text-sm">
                <span className="font-bold text-slate-700">
                  Umbral prioridad media (%)
                </span>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={umbrales.umbralRiesgoAlertaMediaPct}
                  onChange={(e) =>
                    setUmbrales({
                      ...umbrales,
                      umbralRiesgoAlertaMediaPct: Number(e.target.value),
                    })
                  }
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-2.5"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={() => void guardarUmbrales()}
                className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? "Guardando…" : "Guardar umbrales"}
              </button>
              <button
                type="button"
                disabled={generando}
                onClick={() => void generarPreventivas()}
                className="inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-5 py-3 text-sm font-bold text-white hover:bg-rose-500 disabled:opacity-50"
              >
                {generando ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {generando ? "Generando…" : "Generar alertas preventivas"}
              </button>
              <button
                type="button"
                onClick={() => void loadRiesgo()}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw className="w-4 h-4" />
                Actualizar resumen
              </button>
              <Link
                to="/admin/alertas"
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 hover:bg-slate-100"
              >
                Ver todas las alertas →
              </Link>
            </div>

            {saveMsg ? (
              <p className="text-sm font-medium text-emerald-900 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
                {saveMsg}
              </p>
            ) : null}
            {actionMsg ? (
              <p className="text-sm font-medium text-slate-800 rounded-xl bg-slate-100 border border-slate-200 px-4 py-3">
                {actionMsg}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone = "slate",
}: {
  label: string;
  value: number;
  icon?: ReactNode;
  tone?: "slate" | "rose" | "amber" | "emerald";
}) {
  const tones = {
    slate: "bg-slate-50 text-slate-900 border-slate-100",
    rose: "bg-rose-50 text-rose-950 border-rose-100",
    amber: "bg-amber-50 text-amber-950 border-amber-100",
    emerald: "bg-emerald-50 text-emerald-950 border-emerald-100",
  };
  return (
    <div
      className={`rounded-2xl border px-3 py-3 ${tones[tone]}`}
    >
      <div className="flex items-center gap-1.5 text-xs font-bold opacity-80 mb-1">
        {icon}
        {label}
      </div>
      <p className="text-2xl font-black">{value}</p>
    </div>
  );
}
