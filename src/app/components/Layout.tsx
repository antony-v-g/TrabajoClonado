import {
  Home as HomeIcon,
  MapPin,
  Navigation,
  AlertTriangle,
  User,
  LayoutDashboard,
  ShieldCheck,
  Users,
  Activity,
  Bell,
  Settings,
  Brain,
} from "lucide-react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router";
import { SafeBot } from "./SafeBot";
import { useAuth } from "../contexts/AuthContext";

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAdmin: isUserAdmin, logout } = useAuth();
  const isAdmin = location.pathname.startsWith("/admin") || isUserAdmin;

  // Si estamos en auth, no mostramos el layout
  if (location.pathname === "/") {
    return <Outlet />;
  }

  const userNav = [
    { name: "Inicio", path: "/home", icon: HomeIcon },
    { name: "Mapa", path: "/mapa", icon: MapPin },
    { name: "Buscar Ruta", path: "/rutas", icon: Navigation },
    { name: "Reportar", path: "/reportar", icon: AlertTriangle },
    { name: "Perfil", path: "/perfil", icon: User },
  ];

  const adminNav = [
    { name: "Dashboard", path: "/admin/dashboard", icon: LayoutDashboard },
    { name: "Gestión Reportes", path: "/admin/reportes", icon: AlertTriangle },
    { name: "Gestión Usuarios", path: "/admin/usuarios", icon: Users },
    { name: "Mapa de Calor", path: "/admin/mapa-calor", icon: MapPin },
    { name: "Alertas", path: "/admin/alertas", icon: Bell },
    { name: "ML .NET", path: "/admin/ml", icon: Brain },
    { name: "Configuración", path: "/admin/configuracion", icon: Settings },
  ];

  const publicNav = [
    { name: "Entrar", path: "/", icon: HomeIcon },
    { name: "Registrarse", path: "/registro", icon: User },
  ];

  const navItems = user ? (isAdmin ? adminNav : userNav) : publicNav;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden text-slate-900">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-slate-200 z-50">
        <div className="p-6 flex items-center gap-3 text-indigo-700 font-black text-xl border-b border-slate-100">
          <div
            className={`p-2 rounded-xl text-white ${isAdmin ? "bg-slate-900" : "bg-indigo-600"}`}
          >
            <ShieldCheck className="w-6 h-6" />
          </div>
          <span>{isAdmin ? "Admin Panel" : "Ruta Segura"}</span>
        </div>
        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all ${
                  isActive
                    ? isAdmin
                      ? "bg-slate-100 text-slate-900 font-bold"
                      : "bg-indigo-50 text-indigo-700 font-bold"
                    : "text-slate-600 hover:bg-slate-100 font-medium"
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              {item.name}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-100">
          {user ? (
            <button
              onClick={() => {
                logout();
                navigate("/");
              }}
              className="w-full flex items-center justify-center gap-2 p-3 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl cursor-pointer transition-colors font-bold text-sm"
            >
              Cerrar Sesión
            </button>
          ) : (
            <div className="space-y-3">
              <button
                onClick={() => navigate("/")}
                className="w-full flex items-center justify-center gap-2 p-3 bg-indigo-600 text-white hover:bg-indigo-500 rounded-xl transition-colors font-bold text-sm"
              >
                Entrar
              </button>
              <button
                onClick={() => navigate("/registro")}
                className="w-full flex items-center justify-center gap-2 p-3 bg-slate-100 text-slate-900 hover:bg-slate-200 rounded-xl transition-colors font-bold text-sm"
              >
                Registrarse
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-24 md:pb-0 relative scroll-smooth">
        {/* Mobile Header */}
        <div className="md:hidden bg-white p-4 border-b border-slate-200 flex justify-between items-center z-50 sticky top-0 shadow-sm">
          <div className="flex items-center gap-2 text-indigo-700 font-black">
            <ShieldCheck className="w-5 h-5" />
            <span>{isAdmin ? "Admin Panel" : "Ruta Segura"}</span>
          </div>
          <button
            onClick={() => {
              if (user) {
                logout();
              }
              navigate("/");
            }}
            className="bg-slate-100 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700"
          >
            {user ? "Cerrar Sesión" : "Entrar"}
          </button>
        </div>

        <div className="max-w-6xl mx-auto p-4 md:p-8 min-h-full">
          <Outlet />
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 w-full bg-white flex justify-around p-2 pb-safe z-50 shadow-[0_-10px_40px_rgba(0,0,0,0.08)] border-t border-slate-100 overflow-x-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 p-2 rounded-xl min-w-[70px] transition-all ${
                isActive
                  ? isAdmin
                    ? "text-slate-900 bg-slate-100"
                    : "text-indigo-700 bg-indigo-50"
                  : "text-slate-400 hover:text-slate-600"
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            <span className="text-[10px] font-bold text-center leading-tight">
              {item.name}
            </span>
          </NavLink>
        ))}
      </nav>

      {/* Chatbot solo en vista usuario */}
      {!isAdmin && <SafeBot />}
    </div>
  );
}
