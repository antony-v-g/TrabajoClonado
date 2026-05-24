import { AlertTriangle, CloudSun, Clock3 } from "lucide-react";
import { RiesgoMlBadge } from "./RiesgoMlBadge";
import type { ContextoZonaCompleto } from "../lib/zonaMlApi";
import { estilosRiesgo } from "../lib/riesgoMl";

type Props = {
  titulo?: string;
  data: ContextoZonaCompleto | null;
  loading?: boolean;
  compact?: boolean;
};

function franjaIcon(riesgo: string) {
  return estilosRiesgo(riesgo).icon;
}

export function ZonaInteligenciaPanel({
  titulo = "Inteligencia de zona",
  data,
  loading,
  compact,
}: Props) {
  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm flex items-center justify-center gap-2 text-sm text-slate-500 min-h-[120px]">
        Analizando zona (ML + clima)…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide mb-2">
          {titulo}
        </h2>
        <p className="text-sm text-slate-500">
          Busca un destino o analiza el mapa para ver riesgo ML, clima y horarios.
        </p>
      </div>
    );
  }

  const { clasificacion, clima, climaImpacto, riesgoHorario } = data;
  const climaAdverso = climaImpacto.condicionClima >= 0.25;

  return (
    <div
      className={`rounded-3xl border border-slate-200 bg-white shadow-sm ${compact ? "p-4 space-y-3" : "p-5 space-y-4"}`}
    >
      <div>
        <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide mb-1">
          {titulo}
        </h2>
        <p className="text-xs text-slate-500 truncate" title={data.zona}>
          {data.zona}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <RiesgoMlBadge
          riesgo={clasificacion.riesgo}
          confianza={clasificacion.confianza}
          indicador={clasificacion.indicadorVisual}
          compact={compact}
        />
        <span className="text-xs text-slate-500">
          ML.NET{climaAdverso ? " + clima" : ""} · zona actual
        </span>
      </div>

      <div className="rounded-2xl border border-sky-100 bg-sky-50/80 px-3 py-2.5">
        <div className="flex items-start gap-2">
          <CloudSun className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-sky-950">Clima (WeatherAPI)</p>
            <p className="text-sm text-sky-900">
              {climaImpacto.emoji} {clima.temperaturaC}°C · {clima.descripcion}
            </p>
            <p className="text-[10px] text-sky-700/80 mt-0.5">
              Riesgo movilidad: {climaImpacto.riesgoMovilidad} · {clima.fuente}
            </p>
          </div>
        </div>
      </div>

      {climaImpacto.advertencias.length > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/90 px-3 py-2.5 space-y-1.5">
          <p className="text-xs font-black text-amber-950 uppercase tracking-wide flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Advertencias climáticas
          </p>
          <ul className="text-xs text-amber-900 space-y-1 list-disc pl-4">
            {climaImpacto.advertencias.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          {climaImpacto.recomendacionRuta ? (
            <p className="text-xs font-bold text-amber-950 pt-1">
              {climaImpacto.recomendacionRuta}
            </p>
          ) : null}
        </div>
      ) : null}

      {riesgoHorario.length > 0 ? (
        <div>
          <p className="text-xs font-black text-slate-800 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Clock3 className="w-3.5 h-3.5" />
            Riesgo por horario (ML)
          </p>
          <ul className="space-y-2">
            {riesgoHorario.map((f) => (
              <li
                key={f.franja}
                className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2"
              >
                <span className="text-xs font-bold text-slate-700">{f.franja}</span>
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <span aria-hidden>{franjaIcon(f.riesgo)}</span>
                  {f.riesgo}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
