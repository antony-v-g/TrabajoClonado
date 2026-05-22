import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ShieldCheck, Mail, User, Phone } from "lucide-react";
import PasswordInput from "../components/PasswordInput";
import PasswordStrengthChecklist from "../components/PasswordStrengthChecklist";
import { useNavigate, Link } from "react-router";
import { useAuth } from "../contexts/AuthContext";
import {
  detectRolFromEmail,
  dashboardPathForRol,
  isAllowedProjectEmail,
  MSG_EMAIL_INVALID,
  MSG_EMPTY_FIELDS,
  MSG_REGISTER_SUCCESS,
} from "../lib/emailRules";
import {
  isStrongPassword,
  MSG_PASSWORD_REGISTER_INVALID,
} from "../lib/passwordRules";

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

  const detectedRol = useMemo(() => detectRolFromEmail(email), [email]);
  const [formReady, setFormReady] = useState(false);

  useEffect(() => {
    setNombre("");
    setEmail("");
    setPassword("");
    setTelefono("");
    const id = window.setTimeout(() => setFormReady(true), 400);
    return () => window.clearTimeout(id);
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (
      !nombre.trim() ||
      !email.trim() ||
      !password.trim() ||
      !telefono.trim()
    ) {
      setErrorMessage(MSG_EMPTY_FIELDS);
      return;
    }

    if (!isStrongPassword(password)) {
      setErrorMessage(MSG_PASSWORD_REGISTER_INVALID);
      return;
    }

    if (!isAllowedProjectEmail(email)) {
      setErrorMessage(MSG_EMAIL_INVALID);
      return;
    }

    setIsSubmitting(true);

    try {
      const user = await register({
        nombre: nombre.trim(),
        email: email.trim(),
        password,
        telefono: telefono.trim(),
      });

      setSuccessMessage(MSG_REGISTER_SUCCESS);
      const target = dashboardPathForRol(user.rol);
      setTimeout(() => navigate(target), 1500);
    } catch (error) {
      let errorMsg = "No se pudo completar el registro.";
      if (error instanceof Error) {
        errorMsg = error.message;
        if (
          !errorMsg.startsWith("⚠️") &&
          errorMsg.toLowerCase().includes("correo") &&
          (errorMsg.toLowerCase().includes("registrado") ||
            errorMsg.toLowerCase().includes("existe"))
        ) {
          errorMsg = "⚠️ El correo ya está registrado";
        }
        if (
          !errorMsg.startsWith("⚠️") &&
          errorMsg.toLowerCase().includes("@usuario.com")
        ) {
          errorMsg = MSG_EMAIL_INVALID;
        }
        if (
          !errorMsg.startsWith("⚠️") &&
          errorMsg.toLowerCase().includes("contraseña")
        ) {
          errorMsg = MSG_PASSWORD_REGISTER_INVALID;
        }
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

              <form
                className="relative space-y-5"
                onSubmit={handleSubmit}
                autoComplete="off"
                data-form-type="other"
              >
                {/* Campos señuelo: el navegador suele rellenar estos en lugar de los reales */}
                <div
                  className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden"
                  aria-hidden
                >
                  <input type="text" name="fake-email" autoComplete="username" />
                  <input
                    type="password"
                    name="fake-password"
                    autoComplete="current-password"
                  />
                </div>
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
                      name="nombre-registro"
                      value={nombre}
                      onChange={(event) => setNombre(event.target.value)}
                      autoComplete="name"
                      className="w-full rounded-2xl border border-slate-700/80 bg-slate-950/70 px-12 py-3 text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="Ej. Andrea López"
                    />
                  </div>
                </div>

                {!formReady ? (
                  <p className="text-sm text-slate-400 animate-pulse py-6 text-center">
                    Preparando formulario seguro…
                  </p>
                ) : (
                  <>
                    <div>
                      <label className="text-sm font-semibold text-slate-300">
                        Correo (único por persona)
                      </label>
                      <p className="mt-1 text-xs text-slate-500">
                        <code className="text-slate-300">@usuario.com</code> = usuario.{" "}
                        <code className="text-slate-300">@admin.com</code> = administrador.
                      </p>
                      <div className="mt-2 relative">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                          <Mail className="w-5 h-5" />
                        </div>
                        <input
                          id="registro-correo"
                          name="correo-registro"
                          value={email}
                          type="text"
                          inputMode="email"
                          autoCapitalize="none"
                          spellCheck={false}
                          onChange={(event) => setEmail(event.target.value)}
                          autoComplete="off"
                          data-lpignore="true"
                          data-1p-ignore="true"
                          data-form-type="other"
                          className="w-full rounded-2xl border border-slate-700/80 bg-slate-950/70 px-12 py-3 text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          placeholder="luciana@usuario.com"
                        />
                      </div>
                      {detectedRol && (
                        <p className="mt-2 text-sm font-medium text-emerald-300">
                          Rol detectado: {detectedRol}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="text-sm font-semibold text-slate-300">
                        Contraseña
                      </label>
                      <p className="mt-1 text-xs text-slate-500">
                        Mínimo 16 caracteres: mayúscula, minúscula, número y
                        símbolo (ej. RutaSegura2025!).
                      </p>
                      <div className="mt-2">
                        <PasswordInput
                          id="registro-password"
                          name="password-registro"
                          value={password}
                          onChange={setPassword}
                          autoComplete="new-password"
                          preventAutofill
                          variant="dark"
                          placeholder="Ej. RutaSegura2025!"
                        />
                        <PasswordStrengthChecklist
                          password={password}
                          variant="dark"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="text-sm font-semibold text-slate-300">
                    Teléfono de emergencia
                  </label>
                  <div className="mt-2 relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                      <Phone className="w-5 h-5" />
                    </div>
                    <input
                      name="telefono-registro"
                      value={telefono}
                      type="tel"
                      onChange={(event) => setTelefono(event.target.value)}
                      autoComplete="tel"
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
