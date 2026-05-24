import { useCallback, useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Link } from "react-router";
import { Users, AlertTriangle, MapPin, Bell, RefreshCw, CloudRain } from "lucide-react";
import { apiUrl, authJsonHeaders, readApiErrorMessage } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { adminFetchJson, fetchPrediccionesAdmin, type PrediccionZona } from "../lib/adminApi";
import { AdminPageHeader } from "../components/AdminPageHeader";

type ResumenApi = {
  usuariosActivos: number;
  reportesPendientes: number;
  rutasConsultadas7Dias: number;
  alertasEmitidas7Dias: number;
  deltas: {
    usuariosRegistradosSemana: number;
    reportesCreadosSemana: number;
    rutasConsultadasSemana: number;
    reportesPendientesVsDia: number;
    alertasSemana: number;
  };
  volumenPorDia: { fecha: string; reportes: number }[];
  zonasRiesgo: {
    titulo: string;
    riesgoPorcentaje: number;
    horarioSugerido: string;
    nivelZonaMl?: string;
    indicadorZona?: string;
    reportesEnZona?: number;
  }[];
  mlZonasActivo?: boolean;
};

type AnalisisClimaApi = {
  totalReportes: number;
  reportesNocturnos: number;
  porcentajeNocturno: number;
  climaActual: { descripcion: string; temperaturaC: number };
  climaImpacto: { emoji: string; riesgoMovilidad: string; condicionClima: number };
  motorPredictivo: {
    titulo: string;
    insight: string;
    recomendacionAdmin: string;
  };
  distribucionPorHora: { hora: string; reportes: number }[];
};

function formatDelta(pct: number) {
  if (pct > 0) return `+${pct}% en la semana`;
  if (pct < 0) return `${pct}% respecto al periodo anterior`;
  return "sin cambio vs. periodo anterior";
}

function barColor(pct: number) {
  if (pct >= 80) return "bg-rose-500";
  if (pct >= 60) return "bg-orange-500";
  return "bg-amber-500";
}

export default function AdminDashboard() {
  const { token } = useAuth();
  const [data, setData] = useState<ResumenApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [genMsg, setGenMsg] = useState<string | null>(null);
  const [genLoading, setGenLoading] = useState(false);
  const [climaAnalisis, setClimaAnalisis] = useState<AnalisisClimaApi | null>(
    null,
  );
  const [predicciones, setPredicciones] = useState<PrediccionZona[]>([]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setErr(null);
    try {
      const [{ data: j }, climaRes, preds] = await Promise.all([
        adminFetchJson<ResumenApi>("/api/Admin/resumen", token),
        adminFetchJson<AnalisisClimaApi>(
          "/api/Admin/analisis-clima-incidentes",
          token,
        ),
        fetchPrediccionesAdmin(token, 5),
      ]);
      setData(j);
      setClimaAnalisis(climaRes.data);
      setPredicciones(preds);
    } catch (e) {
      if (e instanceof TypeError) {
        setErr(
          "No hay conexión con la API. Arranca en la carpeta `backend` el comando `dotnet run` (debe quedar en http://localhost:5000) y en otra ventana `npm run dev` para Vite. Si usas un build o `vite preview` sin proxy, añade en la raíz del front un `.env` con: VITE_API_URL=http://127.0.0.1:5000",
        );
      } else {
        setErr(
          e instanceof Error ? e.message : "Error al cargar el resumen",
        );
      }
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const chartData =
    data?.volumenPorDia.map((d) => {
      const date = new Date(d.fecha);
      const day = date.toLocaleDateString("es-PE", { weekday: "short" });
      return { day, reportes: d.reportes };
    }) ?? [];

  const onGenerar = async () => {
    if (!token) return;
    setGenLoading(true);
    setGenMsg(null);
    try {
      const r = await fetch(apiUrl("/api/Admin/alertas/generar"), {
        method: "POST",
        headers: authJsonHeaders(token),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.message || "Error");
      setGenMsg(
        typeof j.creadas === "number" && j.creadas > 0
          ? `Se generaron ${j.creadas} alertas y se guardaron en el sistema.`
          : (j.message as string) || "Listo.",
      );
      void load();
    } catch {
      setGenMsg("No se pudo generar alertas (comprueba que haya reportes en los últimos 7 días).");
    } finally {
      setGenLoading(false);
    }
  };

  if (loading && !data && !err) {
    return (
      <div className="py-20 text-center text-slate-500">Cargando tablero…</div>
    );
  }
  if (err) {
    return (
      <div className="space-y-4 animate-in fade-in duration-500 pb-10 max-w-2xl">
        <h1 className="text-3xl font-black text-slate-900">Dashboard</h1>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-900">
          <p className="font-bold text-rose-950">No se pudo cargar el resumen</p>
          <p className="mt-2 text-sm text-rose-800/90 whitespace-pre-wrap">
            {err}
          </p>
          {err.includes("SQL") || err.includes("500") ? (
            <p className="mt-3 text-sm text-rose-800">
              Si acabas de clonar el proyecto, en `backend` ejecuta{" "}
              <code className="text-xs bg-white/80 px-1 rounded">dotnet ef database update</code>{" "}
              y reinicia la API.
            </p>
          ) : null}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 space-y-2">
          <p className="font-bold text-slate-800">Checklist rápido</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Terminal 1: carpeta <code>backend</code> → <code>dotnet run</code>
            </li>
            <li>
              Terminal 2: raíz del proyecto → <code>npm run dev</code> → abre la URL
              (p. ej. http://localhost:5173)
            </li>
            <li>Entra otra vez al admin tras iniciar el backend</li>
          </ul>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
        >
          <RefreshCw className="w-4 h-4" />
          Reintentar
        </button>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      {genMsg ? (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
          {genMsg}
        </div>
      ) : null}
      <AdminPageHeader
        title="Dashboard Administrativo"
        subtitle="Resumen de zonas de riesgo y actividad reciente de la plataforma."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="rounded-3xl bg-slate-100 p-3 text-slate-800">
              <Users className="w-5 h-5" />
            </div>
            <span
              className={`text-xs font-bold ${data.deltas.usuariosRegistradosSemana >= 0 ? "text-emerald-600" : "text-rose-600"}`}
            >
              {formatDelta(data.deltas.usuariosRegistradosSemana)}
            </span>
          </div>
          <h3 className="mt-6 text-3xl font-black text-slate-900">
            {data.usuariosActivos.toLocaleString("es-PE")}
          </h3>
          <p className="mt-2 text-sm text-slate-500">Usuarios activos</p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="rounded-3xl bg-rose-100 p-3 text-rose-700">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <span
              className={`text-xs font-bold ${data.deltas.reportesPendientesVsDia >= 0 ? "text-amber-600" : "text-emerald-600"}`}
            >
              {formatDelta(data.deltas.reportesPendientesVsDia)} (pend. nuevos)
            </span>
          </div>
          <h3 className="mt-6 text-3xl font-black text-slate-900">
            {data.reportesPendientes}
          </h3>
          <p className="mt-2 text-sm text-slate-500">Reportes pendientes</p>
          {data.reportesPendientes > 0 ? (
            <Link
              to="/admin/reportes"
              className="mt-2 inline-block text-xs font-bold text-indigo-600 hover:text-indigo-700"
            >
              Moderar →
            </Link>
          ) : null}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="rounded-3xl bg-emerald-100 p-3 text-emerald-700">
              <MapPin className="w-5 h-5" />
            </div>
            <span
              className={`text-xs font-bold ${data.deltas.rutasConsultadasSemana >= 0 ? "text-emerald-600" : "text-rose-600"}`}
            >
              {formatDelta(data.deltas.rutasConsultadasSemana)}
            </span>
          </div>
          <h3 className="mt-6 text-3xl font-black text-slate-900">
            {data.rutasConsultadas7Dias.toLocaleString("es-PE")} (7d)
          </h3>
          <p className="mt-2 text-sm text-slate-500">Rutas guardadas (hist.)</p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="rounded-3xl bg-amber-100 p-3 text-amber-800">
              <Bell className="w-5 h-5" />
            </div>
            <span
              className={`text-xs font-bold ${data.deltas.alertasSemana >= 0 ? "text-emerald-600" : "text-rose-600"}`}
            >
              {formatDelta(data.deltas.alertasSemana)}
            </span>
          </div>
          <h3 className="mt-6 text-3xl font-black text-slate-900">
            {data.alertasEmitidas7Dias}
          </h3>
          <p className="mt-2 text-sm text-slate-500">Alertas sistema (7d)</p>
        </div>
      </div>

      {climaAnalisis ? (
        <div className="rounded-[2rem] border border-sky-200 bg-gradient-to-br from-sky-50 to-indigo-50 p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <CloudRain className="w-6 h-6 text-sky-700" />
                Motor predictivo · clima e incidentes
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                {climaAnalisis.motorPredictivo.titulo}
              </p>
            </div>
            <span className="rounded-2xl bg-white px-3 py-1.5 text-sm font-bold text-sky-900 border border-sky-200">
              {climaAnalisis.climaImpacto.emoji}{" "}
              {climaAnalisis.climaActual.descripcion}
            </span>
          </div>
          <p className="text-sm text-slate-800 font-medium leading-relaxed">
            {climaAnalisis.motorPredictivo.insight}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-white/80 border border-slate-200 p-4">
              <p className="text-xs font-bold text-slate-500 uppercase">
                Reportes nocturnos
              </p>
              <p className="text-2xl font-black text-slate-900 mt-1">
                {climaAnalisis.reportesNocturnos}
              </p>
              <p className="text-xs text-slate-600">
                {climaAnalisis.porcentajeNocturno}% del total
              </p>
            </div>
            <div className="rounded-2xl bg-white/80 border border-slate-200 p-4">
              <p className="text-xs font-bold text-slate-500 uppercase">
                Riesgo movilidad (hoy)
              </p>
              <p className="text-2xl font-black text-amber-800 mt-1">
                {climaAnalisis.climaImpacto.riesgoMovilidad}
              </p>
            </div>
            <div className="rounded-2xl bg-white/80 border border-slate-200 p-4">
              <p className="text-xs font-bold text-slate-500 uppercase">
                Acción sugerida
              </p>
              <p className="text-xs text-slate-800 mt-2 font-medium">
                {climaAnalisis.motorPredictivo.recomendacionAdmin}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {predicciones.length > 0 ? (
        <div className="rounded-[2rem] border border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-6 shadow-sm">
          <h2 className="text-xl font-black text-slate-900 mb-1">
            Motor predictivo · zonas
          </h2>
          <p className="text-sm text-slate-600 mb-4">
            Compara reportes de los últimos 7 días vs la semana anterior.
          </p>
          <div className="space-y-3">
            {predicciones.map((p) => (
              <div
                key={p.ubicacion}
                className="rounded-2xl border border-white/80 bg-white/90 px-4 py-3 shadow-sm"
              >
                <p className="text-sm font-bold text-slate-900 leading-snug">
                  {p.mensajePredictivo}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {p.indicadorZona} {p.etiquetaZona} · {p.reportes7d} reporte(s) ·{" "}
                  {p.deltaPct >= 0 ? "+" : ""}
                  {p.deltaPct}% vs sem. ant.
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-900">
                Volumen de reportes (últimos 7 días)
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Cuenta real de <code className="text-xs">Reportes</code> por
                fecha.
              </p>
            </div>
            <span className="rounded-3xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700">
              Últimos 7 días
            </span>
          </div>

          <div className="mt-6 h-[320px]">
            {chartData.length === 0 || chartData.every((c) => c.reportes === 0) ? (
              <div className="grid h-full place-items-center text-sm text-slate-500">
                Aún no hay reportes en el periodo. Los gráficos se rellenan
                automáticamente.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="day"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#64748b", fontSize: 12 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#64748b", fontSize: 12 }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 20, borderColor: "#e2e8f0" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="reportes"
                    stroke="#4f46e5"
                    strokeWidth={3}
                    dot={{ r: 3, fill: "#4f46e5" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-slate-950 p-6 shadow-lg shadow-slate-900/5 text-white">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black">Zonas con más reportes</h2>
              <p className="mt-1 text-sm text-slate-300">
                Ranking por ubicación (7 días) con nivel predictivo de seguridad
                de zona.
                {data.mlZonasActivo ? " Modelo de zona activo." : ""}
              </p>
            </div>
            <MapPin className="w-6 h-6 text-indigo-400" />
          </div>

          {data.zonasRiesgo.length === 0 ? (
            <p className="text-sm text-slate-400">
              Sin reportes aún. Cuando haya incidencias, verás el ranking aquí.
            </p>
          ) : (
            <div className="space-y-4">
              {data.zonasRiesgo.map((item) => (
                <div
                  key={item.titulo}
                  className="rounded-3xl bg-slate-900/80 p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        {item.indicadorZona ? (
                          <span aria-hidden>{item.indicadorZona}</span>
                        ) : null}
                        <h3 className="font-bold text-slate-100">{item.titulo}</h3>
                      </div>
                      {item.nivelZonaMl ? (
                        <p className="mt-1 text-xs font-bold text-indigo-300">
                          {item.nivelZonaMl}
                          {item.reportesEnZona != null
                            ? ` · ${item.reportesEnZona} reporte(s)`
                            : ""}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-slate-400">
                        {item.horarioSugerido}
                      </p>
                    </div>
                    <span className="text-sm font-black text-white">
                      {item.riesgoPorcentaje}%
                    </span>
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={`h-full rounded-full ${barColor(item.riesgoPorcentaje)}`}
                      style={{ width: `${item.riesgoPorcentaje}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            disabled={genLoading}
            onClick={onGenerar}
            className="mt-6 w-full rounded-3xl bg-indigo-600 px-5 py-4 text-sm font-bold text-white transition hover:bg-indigo-500 disabled:opacity-60"
          >
            {genLoading ? "Generando…" : "Generar alertas preventivas (guarda en BD)"}
          </button>
        </div>
      </div>
    </div>
  );
}
