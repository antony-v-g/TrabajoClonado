import { useState } from "react";
import {
  ShieldCheck,
  Mail,
  Lock,
  User,
  Phone,
  ArrowRight,
  Activity,
  Map,
  Bot,
  Zap,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";
import { useNavigate, Link } from "react-router";
import { useAuth } from "../contexts/AuthContext";
import { EMAIL_DOMAIN_HINT, isAllowedProjectEmail } from "../lib/emailRules";

export default function Auth() {
  const [viewState, setViewState] = useState<
    "bienvenida" | "login" | "recuperar" | "adminLogin"
  >("bienvenida");
  const [resetSent, setResetSent] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const view = viewState;
  const setView = (v: typeof view) => {
    setViewState(v);
    setResetSent(false);
    setErrorMessage(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (view === "recuperar") {
      setResetSent(true);
      setTimeout(() => {
        setResetSent(false);
        setViewState("login");
      }, 4000);
      return;
    }

    if (password.length < 8 || password.length > 11) {
      setErrorMessage("La contraseña debe tener entre 8 y 11 caracteres.");
      return;
    }

    if (!isAllowedProjectEmail(email)) {
      setErrorMessage(EMAIL_DOMAIN_HINT);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const user = await login(email, password);
      if (user.rol === "Administrador" || view === "adminLogin") {
        navigate("/admin/dashboard");
      } else {
        navigate("/home");
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "No se pudo iniciar sesión.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (view === "bienvenida") {
    return (
      <div className="min-h-screen relative flex flex-col bg-slate-950 font-sans overflow-x-hidden scroll-smooth">
        {/* Top Navbar */}
        <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-white/10 transition-all">
          <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
            <div
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => window.scrollTo(0, 0)}
            >
              <ShieldCheck className="w-8 h-8 text-indigo-500" />
              <span className="text-xl font-black text-white tracking-tight">
                Ruta Segura
              </span>
            </div>

            <div className="hidden md:flex items-center gap-8 text-sm font-bold text-slate-300">
              <a href="#inicio" className="hover:text-white transition-colors">
                Inicio
              </a>
              <a
                href="#como-funciona"
                className="hover:text-white transition-colors"
              >
                ¿Cómo funciona?
              </a>
              <a
                href="#contacto"
                className="hover:text-white transition-colors"
              >
                Contacto
              </a>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={() => setView("login")}
                className="text-sm font-bold text-slate-300 hover:text-white transition-colors hidden sm:block"
              >
                Iniciar Sesión
              </button>
              <button
                onClick={() => navigate("/registro")}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-indigo-500/20"
              >
                Regístrate
              </button>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <main
          id="inicio"
          className="relative w-full min-h-screen flex flex-col justify-center items-center pt-20"
        >
          {/* Fondo con imagen y gradiente overlay */}
          <div className="absolute inset-0 z-0">
            <img
              src="https://images.unsplash.com/photo-1747499967281-c0c5eec9933c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzbWFydCUyMGNpdHklMjBuaWdodCUyMGFlcmlhbCUyMGFic3RyYWN0fGVufDF8fHx8MTc3NDY0MjY0Mnww&ixlib=rb-4.1.0&q=80&w=1080"
              alt="City Background"
              className="w-full h-full object-cover opacity-40 scale-105 animate-pulse-slow"
              style={{ animationDuration: "20s" }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/80 to-transparent"></div>
            <div className="absolute inset-0 bg-indigo-900/20 mix-blend-multiply"></div>
          </div>

          {/* Contenido principal Hero */}
          <div className="relative z-10 w-full max-w-7xl px-6 py-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
              {/* Columna Izquierda: Texto y Propuesta de Valor */}
              <div className="flex-1 text-center lg:text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 font-bold text-xs mb-6 backdrop-blur-md">
                  <Zap className="w-4 h-4 text-amber-400" />
                  Plataforma Universitaria Inteligente
                </div>

                <h1 className="text-5xl lg:text-7xl font-black text-white mb-6 leading-tight tracking-tight">
                  Ruta{" "}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-300">
                    Segura
                  </span>
                </h1>

                <p className="text-lg lg:text-xl text-slate-300 font-medium mb-8 max-w-xl mx-auto lg:mx-0 leading-relaxed">
                  Navega la ciudad con confianza. Nuestra IA analiza zonas de
                  riesgo en tiempo real para ofrecerte el camino más seguro a tu
                  destino.
                </p>

                {/* Badges de características */}
                <div className="flex flex-wrap justify-center lg:justify-start gap-3 mb-10">
                  <div className="flex items-center gap-2 bg-slate-800/60 backdrop-blur-md border border-slate-700 px-4 py-2 rounded-xl text-slate-200 text-sm font-bold shadow-lg">
                    <Map className="w-4 h-4 text-emerald-400" /> Mapas en vivo
                  </div>
                  <div className="flex items-center gap-2 bg-slate-800/60 backdrop-blur-md border border-slate-700 px-4 py-2 rounded-xl text-slate-200 text-sm font-bold shadow-lg">
                    <Bot className="w-4 h-4 text-indigo-400" /> Chatbot IA
                  </div>
                  <div className="flex items-center gap-2 bg-slate-800/60 backdrop-blur-md border border-slate-700 px-4 py-2 rounded-xl text-slate-200 text-sm font-bold shadow-lg">
                    <ShieldCheck className="w-4 h-4 text-rose-400" /> Botón SOS
                  </div>
                </div>
              </div>

              {/* Columna Derecha: Tarjeta de Acceso */}
              <div className="w-full max-w-md">
                <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 p-8 rounded-3xl shadow-[0_0_40px_rgba(79,70,229,0.15)] relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/20 blur-3xl rounded-full translate-x-1/2 -translate-y-1/2"></div>

                  <div className="mb-8 text-center">
                    <div className="bg-indigo-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-500/30">
                      <ShieldCheck className="w-8 h-8 text-white" />
                    </div>
                    <h2 className="text-2xl font-bold text-white">Comenzar</h2>
                    <p className="text-slate-400 text-sm mt-1">
                      Únete a la comunidad de movilidad
                    </p>
                  </div>

                  <div className="space-y-4 relative z-10">
                    <button
                      onClick={() => setView("login")}
                      className="w-full group bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 px-6 rounded-2xl transition-all shadow-lg flex items-center justify-between"
                    >
                      <span>Iniciar Sesión</span>
                      <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </button>
                    <button
                      onClick={() => navigate("/registro")}
                      className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-4 px-6 rounded-2xl transition-all border border-slate-700 hover:border-slate-600 flex items-center justify-center"
                    >
                      Crear Cuenta Nueva
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Sección de Características (Para dar sentido al scroll) */}
        <section
          id="como-funciona"
          className="relative z-10 bg-slate-950 py-24 border-t border-white/5"
        >
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-black text-white mb-4">
                Tecnología al servicio de tu seguridad
              </h2>
              <p className="text-slate-400 max-w-2xl mx-auto text-lg">
                Combinamos inteligencia artificial, reportes comunitarios y
                geolocalización en tiempo real para brindarte tranquilidad en
                cada trayecto.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="bg-slate-900/50 border border-white/10 p-8 rounded-3xl hover:bg-slate-800/80 transition-colors">
                <div className="bg-emerald-500/20 w-14 h-14 rounded-2xl flex items-center justify-center mb-6">
                  <Map className="w-7 h-7 text-emerald-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">
                  Rutas Inteligentes
                </h3>
                <p className="text-slate-400 leading-relaxed font-medium">
                  El algoritmo calcula el trayecto evaluando iluminación,
                  tránsito y reportes históricos para evitar zonas rojas y
                  atajos peligrosos.
                </p>
              </div>
              <div className="bg-slate-900/50 border border-white/10 p-8 rounded-3xl hover:bg-slate-800/80 transition-colors">
                <div className="bg-rose-500/20 w-14 h-14 rounded-2xl flex items-center justify-center mb-6">
                  <ShieldCheck className="w-7 h-7 text-rose-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">
                  Red de Emergencia
                </h3>
                <p className="text-slate-400 leading-relaxed font-medium">
                  Comparte tu ubicación en vivo con contactos de confianza y
                  activa el botón SOS con un solo toque, enlazado directo con
                  autoridades.
                </p>
              </div>
              <div className="bg-slate-900/50 border border-white/10 p-8 rounded-3xl hover:bg-slate-800/80 transition-colors">
                <div className="bg-indigo-500/20 w-14 h-14 rounded-2xl flex items-center justify-center mb-6">
                  <Bot className="w-7 h-7 text-indigo-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">
                  Asistente IA
                </h3>
                <p className="text-slate-400 leading-relaxed font-medium">
                  Nuestro chatbot SafeBot analiza tu entorno y te orienta de
                  forma automatizada sobre qué hacer ante cualquier tipo de
                  incidencia.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer
          id="contacto"
          className="relative z-10 bg-slate-950 pt-16 pb-8 border-t border-white/10"
        >
          <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <ShieldCheck className="w-8 h-8 text-indigo-500" />
                <span className="text-2xl font-black text-white tracking-tight">
                  Ruta Segura
                </span>
              </div>
              <p className="text-slate-400 leading-relaxed max-w-sm font-medium">
                Plataforma universitaria para la prevención de riesgos y
                movilidad urbana. Diseñada para proteger tu camino todos los
                días.
              </p>
            </div>
            <div>
              <h4 className="text-white font-bold mb-6">Plataforma</h4>
              <ul className="space-y-3 text-slate-400 text-sm font-medium">
                <li>
                  <button
                    onClick={() => setView("login")}
                    className="hover:text-indigo-400 transition-colors"
                  >
                    Iniciar Sesión
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => navigate("/registro")}
                    className="hover:text-indigo-400 transition-colors"
                  >
                    Crear Cuenta
                  </button>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-bold mb-6">
                Contacto Institucional
              </h4>
              <ul className="space-y-3 text-slate-400 text-sm font-medium">
                <li>soporte@rutasegura.edu</li>
                <li>Emergencias: 105</li>
                <li>Campus Principal, Pabellón C</li>
              </ul>
            </div>
          </div>
          <div className="max-w-7xl mx-auto px-6 pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-slate-500 text-sm font-medium">
              &copy; {new Date().getFullYear()} Ruta Segura. Todos los derechos
              reservados.
            </p>
            <div className="flex gap-6 text-sm font-medium text-slate-500">
              <Link
                to="/privacidad"
                className="hover:text-white transition-colors"
              >
                Políticas de Privacidad
              </Link>
              <Link
                to="/terminos"
                className="hover:text-white transition-colors"
              >
                Términos del Servicio
              </Link>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md animate-in fade-in zoom-in-95 duration-300">
        <div className="flex justify-center mb-6">
          <div className="bg-indigo-600 p-3 rounded-2xl">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
        </div>
        <h2 className="mt-2 text-center text-3xl font-black text-slate-900">
          {(view === "login" || view === "adminLogin") &&
            "Bienvenido de vuelta"}
          {view === "recuperar" && "Recupera tu acceso"}
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600 font-medium">
          {(view === "login" || view === "adminLogin") && "¿No tienes cuenta? "}
          {view === "recuperar" && "Te enviaremos un enlace seguro "}

          {(view === "login" || view === "adminLogin") && (
            <button
              onClick={() => navigate("/registro")}
              className="font-bold text-indigo-600 hover:text-indigo-500"
            >
              Regístrate aquí
            </button>
          )}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl shadow-slate-200/50 sm:rounded-3xl sm:px-10 border border-slate-100">
          {(view === "login" || view === "adminLogin") && (
            <div className="flex bg-slate-100 p-1.5 rounded-xl mb-8">
              <button
                type="button"
                onClick={() => setView("login")}
                className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${view === "login" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                <User className="w-4 h-4" />
                Usuario
              </button>
              <button
                type="button"
                onClick={() => setView("adminLogin")}
                className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${view === "adminLogin" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                <Activity className="w-4 h-4" />
                Administrador
              </button>
            </div>
          )}

          {resetSent ? (
            <div className="text-center py-10 animate-in fade-in zoom-in duration-500">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-emerald-100 mb-6">
                <CheckCircle2 className="h-10 w-10 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-2">
                ¡Enlace Enviado!
              </h3>
              <p className="text-slate-600 font-medium px-4 mb-6">
                Hemos enviado un correo con las instrucciones para restablecer
                tu contraseña.
              </p>
              <div className="flex items-center justify-center gap-2 text-sm text-slate-400 font-medium">
                <div className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-indigo-600 animate-spin"></div>
                Redirigiendo al inicio de sesión...
              </div>
            </div>
          ) : (
            <form className="space-y-6" onSubmit={handleLogin}>
              {errorMessage && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {errorMessage}
                </div>
              )}
              <div>
                <label className="block text-sm font-bold text-slate-700">
                  Correo Electrónico
                </label>
                {view === "adminLogin" ? (
                  <p className="mt-1 text-xs text-slate-500">
                    Usa un correo con dominio{" "}
                    <code className="text-slate-600">@admin.com</code>, p. ej.{" "}
                    <code>maria@admin.com</code>.
                  </p>
                ) : (
                  view === "login" && (
                    <p className="mt-1 text-xs text-slate-500">
                      Cuenta de app: <code className="text-slate-600">@usuario.com</code>{" "}
                      (ej. <code>luciana@usuario.com</code>). Pestaña Admin:{" "}
                      <code>@admin.com</code>.
                    </p>
                  )
                )}
                <div className="mt-1 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    className="pl-10 block w-full border-slate-200 bg-slate-50 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 py-3"
                    placeholder={
                      view === "adminLogin"
                        ? "tuNombre@admin.com"
                        : "tuNombre@usuario.com"
                    }
                  />
                </div>
              </div>

              {view !== "recuperar" && (
                <div>
                  <label className="block text-sm font-bold text-slate-700">
                    Contraseña
                  </label>
                  <p className="mt-1 text-xs text-slate-500">
                    Entre 8 y 11 caracteres.
                  </p>
                  <div className="mt-1 relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      minLength={8}
                      maxLength={11}
                      className="pl-10 block w-full border-slate-200 bg-slate-50 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 py-3"
                      placeholder="8-11 caracteres, ej. Abcd1234"
                    />
                  </div>
                </div>
              )}

              {(view === "login" || view === "adminLogin") && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <input
                      id="remember-me"
                      type="checkbox"
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded"
                    />
                    <label
                      htmlFor="remember-me"
                      className="ml-2 block text-sm font-medium text-slate-900"
                    >
                      Recordarme
                    </label>
                  </div>

                  <div className="text-sm">
                    <button
                      type="button"
                      onClick={() => setView("recuperar")}
                      className="font-bold text-indigo-600 hover:text-indigo-500"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                </div>
              )}

              <div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                    view === "adminLogin"
                      ? "bg-slate-900 hover:bg-slate-800 focus:ring-slate-900"
                      : "bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500"
                  } ${isSubmitting ? "opacity-70 cursor-not-allowed" : ""}`}
                >
                  {view === "login" && "Ingresar al sistema"}
                  {view === "adminLogin" && "Ingresar como Administrador"}
                  {view === "recuperar" && "Enviar enlace de recuperación"}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              <div className="text-center mt-4">
                <button
                  type="button"
                  onClick={() => setView("bienvenida")}
                  className="text-sm text-slate-500 font-bold hover:text-slate-700"
                >
                  Volver a Bienvenida
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
