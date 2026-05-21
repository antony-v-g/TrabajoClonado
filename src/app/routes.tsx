import { createBrowserRouter } from "react-router";
import { lazy } from "react";

const Root = lazy(() => import("./pages/Root"));
const Auth = lazy(() => import("./pages/Auth"));
const Layout = lazy(() => import("./components/Layout"));
const Home = lazy(() => import("./pages/Home"));
const Mapa = lazy(() => import("./pages/Mapa"));
const Rutas = lazy(() => import("./pages/Rutas"));
const Reportar = lazy(() => import("./pages/Reportar"));
const Perfil = lazy(() => import("./pages/Perfil"));
const Registro = lazy(() => import("./pages/Registro"));
const UserDashboard = lazy(() => import("./pages/UserDashboard"));
const UserContacts = lazy(() => import("./pages/UserContacts"));
const UserNotifications = lazy(() => import("./pages/UserNotifications"));
const UserRequireAuth = lazy(() => import("./components/UserRequireAuth"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminIncidents = lazy(() => import("./pages/AdminIncidents"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const AdminSettings = lazy(() => import("./pages/AdminSettings"));
const AdminMl = lazy(() => import("./pages/AdminMl"));
const AdminZones = lazy(() => import("./pages/AdminZones"));
const AdminAlertas = lazy(() => import("./pages/AdminAlertas"));
const AdminRequireAuth = lazy(() => import("./components/AdminRequireAuth"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsofService = lazy(() => import("./pages/TermsofService"));
const NotFound = lazy(() => import("./pages/NotFound"));

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
    children: [
      { index: true, Component: Auth },
      { path: "registro", Component: Registro },
      {
        path: "",
        Component: Layout,
        children: [
          {
            path: "",
            Component: UserRequireAuth,
            children: [
              { path: "home", Component: Home },
              { path: "mapa", Component: Mapa },
              { path: "rutas", Component: Rutas },
              { path: "reportar", Component: Reportar },
              { path: "perfil", Component: Perfil },
              { path: "user", Component: UserDashboard },
              { path: "user/contacts", Component: UserContacts },
              { path: "user/notifications", Component: UserNotifications },
            ],
          },
          {
            path: "admin",
            Component: AdminRequireAuth,
            children: [
              { index: true, Component: AdminDashboard },
              { path: "dashboard", Component: AdminDashboard },
              { path: "reportes", Component: AdminIncidents },
              { path: "usuarios", Component: AdminUsers },
              { path: "mapa-calor", Component: AdminZones },
              { path: "alertas", Component: AdminAlertas },
              { path: "ml", Component: AdminMl },
              { path: "configuracion", Component: AdminSettings },
            ],
          },
          { path: "privacy", Component: PrivacyPolicy },
          { path: "privacidad", Component: PrivacyPolicy },
          { path: "terms", Component: TermsofService },
          { path: "terminos", Component: TermsofService },
          { path: "*", Component: NotFound },
        ],
      },
    ],
  },
]);
