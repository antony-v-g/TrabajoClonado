import { useState } from "react";
import { ArrowLeft, ShieldCheck, Mail, Lock, User, Phone } from "lucide-react";
import { useNavigate, Link } from "react-router";
import { useAuth } from "../contexts/AuthContext";
import { EMAIL_DOMAIN_HINT, isAllowedProjectEmail } from "../lib/emailRules";

export default function Registro() {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [telefono, setTelefono] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const { register } = useAuth();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (password.length < 8 || password.length > 11) {
      setErrorMessage("La contraseña debe tener entre 8 y 11 caracteres.");
      return;
    }

    if (!isAllowedProjectEmail(email)) {
      setErrorMessage(EMAIL_DOMAIN_HINT);
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await register({ nombre, email, password, telefono });

      setSuccessMessage(
        result.message ?? "Registro exitoso. Ya puedes iniciar sesión.",
      );
      setNombre("");
      setEmail("");
      setPassword("");
      setTelefono("");
      // Redirige al login después de 2 segundos
      setTimeout(() => navigate("/"), 2000);
    } catch (error) {
      let errorMsg = "No se pudo completar el registro.";
      if (error instanceof Error) {
        errorMsg = error.message;
      }
      setErrorMessage(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.35),_transparent_45%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,_rgba(56,189,248,0.2),_transparent_40%)]" />

        <div className="relative z-10 max-w-4xl mx-auto px-6 py-12 sm:py-20">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 text-indigo-300 hover:text-white transition-colors mb-8"
          >
            <ArrowLeft className="w-5 h-5" /> Volver
          </button>

          <div className="grid gap-10 lg:grid-cols-[1.2fr_0.9fr] items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-3 rounded-3xl bg-slate-900/70 border border-slate-700/60 px-5 py-4 shadow-lg shadow-indigo-900/20">
                <div className="rounded-2xl bg-indigo-500/20 p-3 text-indigo-300">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.25em] text-indigo-300 font-bold">
                    Creación de cuenta
                  </p>
                  <h1 className="text-4xl sm:text-5xl font-black text-white">
                    Bienvenido a Ruta Segura
                  </h1>
                </div>
              </div>

              <div className="space-y-4 text-slate-300 leading-relaxed">
                <p>
                  Regístrate para acceder a rutas seguras, reportes en tiempo
                  real y la comunidad de seguridad universitaria.
                </p>
                <p>
                  Completa tus datos de perfil y recibe recomendaciones sobre
                  zonas seguras cerca de ti.
                </p>
                <p className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-100">
                  <span className="font-bold">Formato de correo (demo del proyecto):</span>{" "}
                  <code className="text-indigo-200">tunombre@usuario.com</code> para
                  cuentas de app, y{" "}
                  <code className="text-indigo-200">tunombre@admin.com</code> para
                  administrador. No se aceptan Gmail, Outlook, etc. en la API.
                </p>
              </div>

              <div className="rounded-3xl border border-slate-700/60 bg-slate-900/80 p-6 shadow-2xl">
                <div className="flex items-center gap-3 text-indigo-300 mb-5">
                  <div className="rounded-2xl bg-indigo-500/20 p-3">
                    <User className="w-5 h-5" />
                  </div>
                  <span className="font-bold uppercase text-sm tracking-[0.2em]">
                    Seguridad universitaria
                  </span>
                </div>
                <ul className="space-y-3 text-slate-400 text-sm">
                  <li>• Verificaciones para acceso institucional.</li>
                  <li>• Actualizaciones por zonas de riesgo.</li>
                  <li>• Reporte directo al botón SOS.</li>
                </ul>
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-700/60 bg-slate-900/90 p-8 shadow-2xl backdrop-blur-xl">
              <div className="mb-8 text-center">
                <p className="text-sm uppercase tracking-[0.3em] text-indigo-300/80 mb-2">
                  Empieza ahora
                </p>
                <h2 className="text-3xl font-black text-white">
                  Crea tu cuenta segura
                </h2>
              </div>

              <form className="space-y-5" onSubmit={handleSubmit}>
                {errorMessage && (
                  <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                    {errorMessage}
                  </div>
                )}
                {successMessage && (
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                    {successMessage}
                  </div>
                )}

                <div>
                  <label className="text-sm font-semibold text-slate-300">
                    Nombre completo
                  </label>
                  <div className="mt-2 relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                      <User className="w-5 h-5" />
                    </div>
                    <input
                      value={nombre}
                      onChange={(event) => setNombre(event.target.value)}
                      required
                      className="w-full rounded-2xl border border-slate-700/80 bg-slate-950/70 px-12 py-3 text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="Ej. Andrea López"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-semibold text-slate-300">
                    Correo (único por persona)
                  </label>
                  <p className="mt-1 text-xs text-slate-500">
                    <code className="text-slate-300">@usuario.com</code> = usuario.{" "}
                    <code className="text-slate-300">@admin.com</code> = administrador.
                    La parte antes de @ es libre (ej. luciana, juan, soporte).
                  </p>
                  <div className="mt-2 relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                      <Mail className="w-5 h-5" />
                    </div>
                    <input
                      value={email}
                      type="email"
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      className="w-full rounded-2xl border border-slate-700/80 bg-slate-950/70 px-12 py-3 text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="luciana@usuario.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-semibold text-slate-300">
                    Contraseña
                  </label>
                  <p className="mt-1 text-xs text-slate-500">
                    Entre 8 y 11 caracteres (corta y sencilla: letras, números, símbolos).
                  </p>
                  <div className="mt-2 relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                      <Lock className="w-5 h-5" />
                    </div>
                    <input
                      value={password}
                      type="password"
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      minLength={8}
                      maxLength={11}
                      className="w-full rounded-2xl border border-slate-700/80 bg-slate-950/70 px-12 py-3 text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="8-11 caracteres, ej. Efgh1234"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-semibold text-slate-300">
                    Teléfono de emergencia
                  </label>
                  <div className="mt-2 relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                      <Phone className="w-5 h-5" />
                    </div>
                    <input
                      value={telefono}
                      type="tel"
                      onChange={(event) => setTelefono(event.target.value)}
                      required
                      className="w-full rounded-2xl border border-slate-700/80 bg-slate-950/70 px-12 py-3 text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="+51 912 345 678"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? "Creando cuenta..." : "Crear cuenta"}
                </button>

                <p className="text-center text-sm text-slate-500">
                  ¿Ya tienes cuenta?{" "}
                  <Link
                    to="/"
                    className="font-bold text-white hover:text-indigo-200"
                  >
                    Inicia sesión
                  </Link>
                </p>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
