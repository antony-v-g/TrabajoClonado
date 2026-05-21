import { useCallback, useEffect, useState } from "react";
import { Database } from "lucide-react";
import { apiUrl } from "../lib/api";

export default function AdminSettings() {
  const [dbMsg, setDbMsg] = useState<string | null>(null);
  const [dbOk, setDbOk] = useState<boolean | null>(null);
  const [probing, setProbing] = useState(false);

  const probarDb = useCallback(async () => {
    setProbing(true);
    setDbMsg(null);
    setDbOk(null);
    try {
      const r = await fetch(apiUrl("/api/Admin/db-health"));
      const j = (await r.json()) as {
        ok?: boolean;
        message?: string;
        redis?: { habilitado?: boolean; message?: string };
      };
      setDbOk(!!j?.ok);
      const redisLine = j?.redis
        ? ` · Redis: ${j.redis.habilitado ? "activo" : "inactivo"}`
        : "";
      setDbMsg((j?.message || (j?.ok ? "Conexión correcta" : "Error")) + redisLine);
    } catch {
      setDbOk(false);
      setDbMsg("No se pudo contactar a la API.");
    } finally {
      setProbing(false);
    }
  }, []);

  useEffect(() => {
    void probarDb();
  }, [probarDb]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div>
        <h1 className="text-3xl font-black text-slate-900">Configuración</h1>
      </div>

      <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm max-w-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-3xl bg-indigo-50 p-3 text-indigo-600">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Base de datos</h2>
            <p className="text-sm text-slate-500">
              Comprueba que el API se conecta a SQLite y a Redis (caché y sesiones).
            </p>
          </div>
        </div>

        {dbMsg ? (
          <p
            className={`text-sm font-medium mb-4 ${dbOk ? "text-emerald-800" : "text-rose-800"}`}
            role="status"
          >
            {dbMsg}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void probarDb()}
          disabled={probing}
          className="inline-flex items-center gap-3 rounded-3xl bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          <Database className="w-5 h-5" />
          {probing ? "Comprobando…" : "Probar conexión otra vez"}
        </button>
      </div>
    </div>
  );
}
