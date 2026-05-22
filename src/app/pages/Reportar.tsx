import { useState, useEffect } from "react";
import { useSearchParams } from "react-router";
import {
  Camera,
  MapPin,
  AlertTriangle,
  Send,
  CheckCircle2,
  Navigation,
  X,
} from "lucide-react";
import { useNavigate } from "react-router";
import { useAuth } from "../contexts/AuthContext";
import { apiUrl, authJsonHeaders, readApiErrorMessage } from "../lib/api";

const MAX_EVIDENCIA_BYTES = 850 * 1024;

const EVIDENCIA_TIPOS_ACEPTADOS = new Set([
  "image/jpeg",
  "image/png",
  "image/jpg",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function esEvidenciaValida(file: File): boolean {
  if (EVIDENCIA_TIPOS_ACEPTADOS.has(file.type)) return true;
  const n = file.name.toLowerCase();
  return (
    n.endsWith(".pdf") ||
    n.endsWith(".doc") ||
    n.endsWith(".docx") ||
    n.endsWith(".jpg") ||
    n.endsWith(".jpeg") ||
    n.endsWith(".png")
  );
}

const incidentTypes = [
  { id: "robo", label: "Robo", style: "bg-red-50 text-red-800 border-red-200" },
  {
    id: "acoso",
    label: "Acoso",
    style: "bg-violet-50 text-violet-800 border-violet-200",
  },
  {
    id: "luz",
    label: "Sin Iluminación",
    style: "bg-slate-800 text-slate-50 border-slate-700",
  },
  {
    id: "hueco",
    label: "Hueco en Vía",
    style: "bg-amber-50 text-amber-800 border-amber-200",
  },
  {
    id: "accidente",
    label: "Accidente",
    style: "bg-orange-50 text-orange-800 border-orange-200",
  },
  {
    id: "otro",
    label: "Otro peligro",
    style: "bg-slate-100 text-slate-800 border-slate-200",
  },
];

export default function Reportar() {
  const [searchParams] = useSearchParams();
  const { token } = useAuth();
  const [step, setStep] = useState<"formulario" | "confirmacion">("formulario");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedType, setSelectedType] = useState("robo");
  const [ubicacion, setUbicacion] = useState(
    "Av. Universitaria, cuadra 12 — indica o usa GPS",
  );
  const [descripcion, setDescripcion] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [locationStatus, setLocationStatus] = useState("Listo para fijar ubicación.");
  const [lat, setLat] = useState<string | null>(null);
  const [lng, setLng] = useState<string | null>(null);
  const [evidenciaDataUrl, setEvidenciaDataUrl] = useState<string | null>(null);
  const [evidenciaNombre, setEvidenciaNombre] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const u = searchParams.get("ubicacion")?.trim();
    if (u) {
      setUbicacion(u);
      setLocationStatus("Ubicación traída desde el mapa.");
    }
    const la = searchParams.get("lat")?.trim();
    const lo = searchParams.get("lng")?.trim();
    if (la && lo) {
      setLat(la);
      setLng(lo);
    }
  }, [searchParams]);

  const handleUseGps = () => {
    if (!navigator.geolocation) {
      setLocationStatus("Tu navegador no permite geolocalización.");
      return;
    }

    setLocationStatus("Obteniendo señal GPS (permite el acceso si el navegador lo pide)…");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const la = position.coords.latitude;
        const lo = position.coords.longitude;
        const la6 = la.toFixed(6);
        const lo6 = lo.toFixed(6);
        setLat(la6);
        setLng(lo6);
        setLocationStatus(
          `GPS: ±${Math.round(position.coords.accuracy)} m de precisión. Buscando dirección…`,
        );

        let textoUbicacion = `GPS: ${la6}, ${lo6}`;
        try {
          const res = await fetch(
            `/api/Geo/reverse?lat=${encodeURIComponent(la6)}&lon=${encodeURIComponent(lo6)}`,
          );
          const data: { address?: string | null; coordinates?: { lat: string; lon: string } } =
            await res.json();
          if (data.address && data.address.trim().length > 0) {
            textoUbicacion = data.address;
            setLocationStatus("Ubicación real: dirección aproximada (OpenStreetMap). Puedes editarla.");
          } else {
            setLocationStatus(
              "Coordenadas guardadas. No se obtuvo dirección automática; puedes describir el lugar a mano.",
            );
          }
        } catch {
          setLocationStatus(
            "Coordenadas GPS guardadas. Ajusta el texto de ubicación si hace falta.",
          );
        }
        setUbicacion(textoUbicacion);
      },
      (err) => {
        if (err.code === 1) {
          setLocationStatus("Permiso denegado: en el icono de candado de la barra, permite la ubicación para este sitio.");
        } else if (err.code === 2) {
          setLocationStatus("Ubicación no disponible. Activa el GPS o el Wi‑Fi, o escribe la dirección.");
        } else if (err.code === 3) {
          setLocationStatus("Tiempo agotado al pedir GPS. Vuelve a intentar o escribe la dirección.");
        } else {
          setLocationStatus("No se pudo leer el GPS. Escribe la dirección o inténtalo de nuevo.");
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20000,
      },
    );
  };

  const clearEvidencia = () => {
    setEvidenciaDataUrl(null);
    setEvidenciaNombre(null);
  };

  const handleEvidenciaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) {
      return;
    }
    if (f.size > MAX_EVIDENCIA_BYTES) {
      window.alert(
        `El archivo pesa demasiado (máx. ${Math.floor(MAX_EVIDENCIA_BYTES / 1024)} KB para guardarlo en la base de datos con este flujo).`,
      );
      return;
    }
    if (!esEvidenciaValida(f)) {
      window.alert("Formato no admitido. Usa imagen (JPG, PNG), PDF o Word (.doc, .docx).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r === "string") {
        setEvidenciaDataUrl(r);
        setEvidenciaNombre(f.name);
      }
    };
    reader.readAsDataURL(f);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      window.alert("Inicia sesión para enviar un reporte.");
      return;
    }
    setIsSubmitting(true);

    const tipoLabel =
      incidentTypes.find((t) => t.id === selectedType)?.label ?? "Otro";

    try {
      const response = await fetch(apiUrl("/api/Reportes/Crear"), {
        method: "POST",
        headers: authJsonHeaders(token),
        body: JSON.stringify({
          TipoIncidente: tipoLabel,
          Ubicacion: ubicacion,
          Descripcion: descripcion || null,
          Latitud: lat,
          Longitud: lng,
          UrlFotoEvidencia: evidenciaDataUrl,
          EsAnonimo: anonymous,
        }),
      });

      if (response.status === 401) {
        throw new Error("Sesión expirada. Vuelve a iniciar sesión.");
      }
      if (!response.ok) {
        throw new Error(
          await readApiErrorMessage(response, "Error al enviar el reporte."),
        );
      }

      clearEvidencia();
      setStep("confirmacion");
    } catch (error) {
      console.error(error);
      window.alert(
        error instanceof Error
          ? error.message
          : "No se pudo enviar el reporte. Intenta de nuevo más tarde.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (step === "confirmacion") {
    return (
      <div className="flex flex-col items-center justify-center text-center py-20 animate-in fade-in zoom-in duration-500 max-w-md mx-auto">
        <div className="w-24 h-24 rounded-full bg-emerald-100 flex items-center justify-center mb-6 shadow-sm border-4 border-emerald-50">
          <CheckCircle2 className="w-12 h-12 text-emerald-500" />
        </div>
        <h2 className="text-3xl font-black text-slate-900 mb-3">
          ¡Reporte Enviado!
        </h2>
        <p className="text-slate-500 font-medium mb-8 leading-relaxed">
          Incluida la evidencia, todo quedó almacenado en la base de datos.
        </p>

        <div className="flex flex-col w-full gap-3">
          <button
            type="button"
            onClick={() => navigate("/perfil")}
            className="w-full rounded-3xl bg-indigo-600 px-6 py-4 text-white font-bold shadow-lg transition hover:bg-indigo-700"
          >
            Ver mis reportes
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("formulario");
              setIsSubmitting(false);
            }}
            className="w-full rounded-3xl bg-slate-100 px-6 py-4 text-slate-700 font-bold transition hover:bg-slate-200"
          >
            Hacer otro reporte
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-2xl mx-auto pb-10">
      <header>
        <h1 className="text-3xl font-black text-slate-900">Crear Reporte</h1>
        <p className="text-slate-500 mt-2 font-medium">
          Debes <span className="text-slate-800">iniciar sesión</span> para
          enviar. La evidencia se guarda en el mismo registro (base SQLite).
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-[2rem] bg-white p-6 md:p-8 border border-slate-200 shadow-sm"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-sm font-bold text-slate-900">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <span>¿Qué sucedió?</span>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {incidentTypes.map((tipo) => {
              const isActive = tipo.id === selectedType;
              return (
                <button
                  key={tipo.id}
                  type="button"
                  onClick={() => setSelectedType(tipo.id)}
                  className={[
                    "relative rounded-3xl border-2 p-3.5 text-sm font-bold transition-all duration-200",
                    tipo.style,
                    isActive
                      ? "z-[1] scale-[1.03] border-indigo-500 shadow-lg shadow-indigo-200/50 ring-2 ring-indigo-400 ring-offset-2 ring-offset-white"
                      : "border-transparent opacity-[0.92] hover:opacity-100 hover:scale-[1.01]",
                  ].join(" ")}
                >
                  {isActive ? (
                    <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500 text-[10px] text-white">
                      ✓
                    </span>
                  ) : null}
                  {tipo.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3 text-sm font-bold text-slate-900">
            <MapPin className="w-5 h-5 text-indigo-500" />
            <span>Ubicación</span>
          </div>
          <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-3 md:flex-row md:items-stretch">
            <textarea
              value={ubicacion}
              onChange={(e) => setUbicacion(e.target.value)}
              rows={2}
              placeholder="Dirección o referencia; el botón GPS rellena con coordenadas o dirección aproximada."
              className="min-h-[3.5rem] flex-1 resize-y rounded-2xl border border-transparent bg-slate-50 px-4 py-3 text-slate-700 text-sm leading-snug outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            />
            <button
              type="button"
              onClick={handleUseGps}
              className="inline-flex shrink-0 items-center justify-center gap-2 self-stretch rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700"
            >
              <Navigation className="w-4 h-4" /> Usar GPS real
            </button>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed px-0.5">
            {locationStatus}
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm font-bold text-slate-900">
            <Camera className="w-5 h-5 text-emerald-500" />
            <span>Evidencia (opcional)</span>
          </div>
          <div className="space-y-2">
            <div className="overflow-hidden rounded-[1.75rem] border-2 border-dashed border-slate-200 bg-slate-50 transition hover:border-indigo-200 hover:bg-slate-100/80">
              <label className="flex cursor-pointer items-stretch gap-4 p-4 sm:p-5">
                <span className="flex h-16 w-16 shrink-0 items-center justify-center self-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
                  <Camera className="h-8 w-8 text-indigo-500" />
                </span>
                <div className="min-w-0 flex-1 py-0.5 text-left">
                  <p className="text-sm font-bold text-slate-900">
                    {evidenciaNombre
                      ? evidenciaNombre
                      : "Foto, PDF o Word (un archivo)"}
                  </p>
                  <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                    Un solo toque en el recuadro. Se guarda en la base de
                    datos con el reporte. Máx. ~850 KB. JPG, PNG, PDF, .doc,
                    .docx
                  </p>
                </div>
                <input
                  type="file"
                  className="sr-only"
                  accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,image/jpeg,image/png,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={handleEvidenciaChange}
                />
              </label>
            </div>
            {evidenciaDataUrl && evidenciaNombre ? (
              <button
                type="button"
                onClick={clearEvidencia}
                className="text-xs font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1.5 pl-1"
              >
                <X className="h-3.5 w-3.5" />
                Quitar archivo
              </button>
            ) : null}
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-sm font-bold text-slate-900">
            Detalles adicionales
          </label>
          <textarea
            rows={4}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Describe lo que viste…"
            className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-slate-700 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 resize-none"
          />
        </div>

        <label className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <input
            type="checkbox"
            checked={anonymous}
            onChange={(e) => setAnonymous(e.target.checked)}
            className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <div>
            <p className="font-bold text-slate-900 text-sm">
              Enviar como anónimo
            </p>
            <p className="text-xs text-slate-500 mt-1">
              El registro se marca como anónimo en la base de datos.
            </p>
          </div>
        </label>

        <button
          type="submit"
          disabled={isSubmitting || !token}
          className="flex w-full items-center justify-center gap-2 rounded-3xl bg-indigo-600 px-6 py-4 text-white font-black shadow-lg transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting
            ? "Enviando…"
            : !token
              ? "Inicia sesión para enviar"
              : "Enviar reporte"}
          {isSubmitting || !token ? null : <Send className="w-5 h-5" />}
        </button>
      </form>
    </div>
  );
}
