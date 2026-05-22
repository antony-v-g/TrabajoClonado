import { X, Brain } from "lucide-react";
import type { EventoToast } from "../lib/mapaEventosApi";

type Props = {
  toast: EventoToast;
  onClose: () => void;
};

export function MapaEventoToast({ toast, onClose }: Props) {
  const boxClass =
    toast.kind === "sos"
      ? "border-red-200 bg-red-50 text-red-950"
      : toast.kind === "ok"
        ? "border-emerald-200 bg-emerald-50 text-emerald-950"
        : "border-slate-200 bg-white text-slate-900";

  return (
    <div
      className={`fixed bottom-8 left-4 right-4 md:left-auto md:right-8 md:max-w-md z-[70] rounded-3xl border p-5 shadow-2xl animate-in slide-in-from-bottom-4 ${boxClass}`}
      role="alert"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-black text-lg">{toast.titulo}</p>
          <p className="mt-2 text-sm leading-relaxed">{toast.mensaje}</p>
          {toast.extra && (
            <p className="mt-2 text-xs font-semibold opacity-90 flex items-center gap-1">
              {toast.kind === "sos" && <Brain className="w-3.5 h-3.5" />}
              {toast.extra}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-full p-1 hover:bg-black/5"
          aria-label="Cerrar"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
