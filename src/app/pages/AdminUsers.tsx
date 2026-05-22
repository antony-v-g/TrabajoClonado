import { useEffect, useMemo, useState } from "react";
import { apiUrl, authJsonHeaders, readApiErrorMessage } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { AdminPageHeader } from "../components/AdminPageHeader";
import {
  MoreHorizontal,
  X,
  Mail,
  Phone,
  Calendar,
  FileWarning,
  Shield,
} from "lucide-react";

interface UsuarioItem {
  id: number;
  nombre: string;
  email: string;
  telefono?: string;
  rol: string;
  estado: string;
  reportesCreados?: number;
}

type UsuarioResumenApi = {
  usuario: {
    id: number;
    nombre: string;
    email: string;
    telefono?: string | null;
    rol: string;
    estado: string;
    fechaRegistro: string;
    reportesCreados: number;
  };
  ultimosReportes: Array<{
    id: number;
    tipoIncidente: string;
    ubicacion: string;
    estado: string;
    fechaReporte: string;
  }>;
};

export default function AdminUsers() {
  const { token } = useAuth();
  const [usuarios, setUsuarios] = useState<UsuarioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [ficha, setFicha] = useState<UsuarioResumenApi | null>(null);
  const [fichaLoading, setFichaLoading] = useState(false);
  const [fichaError, setFichaError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const mapUsuario = (raw: Record<string, unknown>): UsuarioItem => ({
    id: Number(raw.id ?? raw.Id ?? 0),
    nombre: String(raw.nombre ?? raw.Nombre ?? ""),
    email: String(raw.email ?? raw.Email ?? ""),
    telefono: (raw.telefono ?? raw.Telefono) as string | undefined,
    rol: String(raw.rol ?? raw.Rol ?? ""),
    estado: String(raw.estado ?? raw.Estado ?? ""),
    reportesCreados: Number(
      raw.reportesCreados ?? raw.ReportesCreados ?? 0,
    ),
  });

  useEffect(() => {
    if (!token) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setListError(null);
      try {
        const res = await fetch(apiUrl("/api/Usuarios"), {
          headers: authJsonHeaders(token),
        });
        if (!res.ok) {
          throw new Error(
            await readApiErrorMessage(res, "No se pudo cargar usuarios."),
          );
        }
        const data = (await res.json()) as Record<string, unknown>[];
        if (!alive) return;
        const list = Array.isArray(data)
          ? data.map((row) => mapUsuario(row))
          : [];
        setUsuarios(list.filter((u) => u.id > 0));
      } catch (e) {
        if (!alive) return;
        setUsuarios([]);
        setListError(
          e instanceof Error ? e.message : "Error al cargar la lista.",
        );
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return usuarios;
    return usuarios.filter(
      (u) =>
        u.nombre.toLowerCase().includes(t) || u.email.toLowerCase().includes(t),
    );
  }, [usuarios, q]);

  const abrirFicha = async (id: number) => {
    setFicha(null);
    setFichaError(null);
    setFichaLoading(true);
    try {
      const r = await fetch(apiUrl(`/api/Usuarios/${id}/resumen`), {
        headers: authJsonHeaders(token!),
      });
      if (!r.ok) {
        const m = await readApiErrorMessage(r, "No encontrado");
        throw new Error(m);
      }
      const data = (await r.json()) as UsuarioResumenApi;
      setFichaError(null);
      setFicha(data);
    } catch (e) {
      setFichaError(
        e instanceof TypeError
          ? "Sin conexión con el servidor. Revisa el backend (dotnet run)."
          : e instanceof Error
            ? e.message
            : "Error al abrir ficha",
      );
    } finally {
      setFichaLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      {fichaLoading ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30">
          <span className="rounded-2xl bg-white px-6 py-4 font-bold text-slate-700 shadow-xl">
            Cargando ficha…
          </span>
        </div>
      ) : null}

      {listError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-800 text-sm">
          {listError}
        </div>
      ) : null}

      {fichaError && !ficha ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-800 text-sm">
          {fichaError}
        </div>
      ) : null}

      {ficha ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50"
            onClick={() => setFicha(null)}
            aria-label="Cerrar"
          />
          <div className="relative z-10 w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase text-slate-500">
                  Ficha de usuario
                </p>
                <h2 className="mt-1 text-2xl font-black text-slate-900">
                  {ficha.usuario.nombre}
                </h2>
                <p className="text-sm text-slate-500">
                  U-{String(ficha.usuario.id).padStart(4, "0")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFicha(null)}
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-5 grid gap-3 text-sm">
              <div className="flex items-start gap-2 rounded-2xl bg-slate-50 p-3">
                <Mail className="w-4 h-4 text-slate-500 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-slate-500">Correo</p>
                  <a
                    href={`mailto:${ficha.usuario.email}`}
                    className="font-semibold text-indigo-600 hover:underline"
                  >
                    {ficha.usuario.email}
                  </a>
                </div>
              </div>
              {ficha.usuario.telefono ? (
                <div className="flex items-start gap-2 rounded-2xl bg-slate-50 p-3">
                  <Phone className="w-4 h-4 text-slate-500 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-slate-500">Teléfono</p>
                    <p className="font-semibold text-slate-800">
                      {ficha.usuario.telefono}
                    </p>
                  </div>
                </div>
              ) : null}
              <div className="flex items-start gap-2 rounded-2xl bg-slate-50 p-3">
                <Shield className="w-4 h-4 text-slate-500 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-slate-500">Rol y estado</p>
                  <p className="mt-0.5">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        ficha.usuario.rol === "Administrador"
                          ? "bg-slate-900 text-white"
                          : "bg-slate-200 text-slate-800"
                      }`}
                    >
                      {ficha.usuario.rol}
                    </span>{" "}
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        ficha.usuario.estado === "Activo"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-rose-100 text-rose-800"
                      }`}
                    >
                      {ficha.usuario.estado}
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-2xl bg-slate-50 p-3">
                <Calendar className="w-4 h-4 text-slate-500 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-slate-500">Alta en el sistema</p>
                  <p className="font-medium text-slate-800">
                    {new Date(ficha.usuario.fechaRegistro).toLocaleString(
                      "es-PE",
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/80 px-4 py-3">
              <p className="text-2xl font-black text-indigo-900">
                {ficha.usuario.reportesCreados}
              </p>
              <p className="text-sm font-bold text-indigo-700/90">
                reportes creados (total)
              </p>
            </div>

            <div className="mt-6">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <FileWarning className="w-4 h-4" />
                Últimas incidencias
              </h3>
              {ficha.ultimosReportes.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">
                  Este usuario aún no ha enviado reportes.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {ficha.ultimosReportes.map((r) => (
                    <li
                      key={r.id}
                      className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm"
                    >
                      <p className="font-bold text-slate-900">
                        REP-{String(r.id).padStart(3, "0")} — {r.tipoIncidente}
                      </p>
                      <p className="text-xs text-slate-500 line-clamp-1">
                        {r.ubicacion}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {new Date(r.fechaReporte).toLocaleString("es-PE")} —{" "}
                        <span
                          className={
                            r.estado === "Aprobado"
                              ? "text-emerald-700"
                              : r.estado === "Rechazado"
                                ? "text-rose-600"
                                : "text-amber-700"
                          }
                        >
                          {r.estado}
                        </span>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <AdminPageHeader
        title="Gestión de Usuarios"
        subtitle="Consulta cuentas registradas y el historial de reportes de cada usuario."
        extra={
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por correo o nombre..."
            className="w-full min-w-[240px] rounded-3xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
        }
      />

      <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-[1.4fr_0.8fr_0.6fr_0.5fr] gap-4 p-5 text-sm font-bold uppercase tracking-[0.12em] text-slate-500 border-b border-slate-200">
          <span>Usuario</span>
          <span>Rol</span>
          <span>Reportes Creados</span>
          <span>Estado</span>
        </div>
        <div className="space-y-3 p-5">
          {loading ? (
            <div className="text-center text-slate-500 py-12">
              Cargando usuarios...
            </div>
          ) : usuarios.length === 0 ? (
            <div className="text-center text-slate-500 py-12">
              No hay usuarios registrados.
            </div>
          ) : (
            filtrados.map((user) => (
              <div
                key={user.id}
                role="button"
                tabIndex={0}
                onClick={() => abrirFicha(user.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    abrirFicha(user.id);
                  }
                }}
                className="grid grid-cols-[1.4fr_0.8fr_0.6fr_0.5fr] gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-4 items-center cursor-pointer transition hover:border-indigo-200 hover:bg-indigo-50/30 hover:shadow-sm"
              >
                <div className="flex flex-col gap-1">
                  <span className="font-bold text-slate-900">{user.nombre}</span>
                  <span className="text-xs text-slate-500">
                    {user.email} • U-{String(user.id).padStart(4, "0")}
                  </span>
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${user.rol === "Administrador" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}
                  >
                    {user.rol}
                  </span>
                </div>
                <div className="text-slate-900 font-bold">
                  {user.reportesCreados ?? 0}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${user.estado === "Activo" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}
                  >
                    {user.estado}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      abrirFicha(user.id);
                    }}
                    className="rounded-2xl bg-white border border-slate-200 p-2 text-slate-500 transition hover:border-indigo-300 hover:text-indigo-600"
                    title="Ver ficha"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
