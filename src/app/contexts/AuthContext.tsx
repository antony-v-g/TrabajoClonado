import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiUrl, readApiErrorMessage } from "../lib/api";

export type AuthUser = {
  id: number;
  nombre: string;
  email: string;
  telefono?: string;
  rol: "Administrador" | "Usuario" | string;
  estado?: string;
  token?: string;
  jti?: string;
  expiraEn?: string;
};

type RegisterData = {
  nombre: string;
  email: string;
  password: string;
  telefono: string;
};

export type RegisterResult = {
  message?: string;
  rol?: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  isAdmin: boolean;
  token: string | null;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (data: RegisterData) => Promise<RegisterResult>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const storageKey = "rutaSeguraAuth";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (!stored) return null;
      return JSON.parse(stored) as AuthUser;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (user) {
      window.localStorage.setItem(storageKey, JSON.stringify(user));
    } else {
      window.localStorage.removeItem(storageKey);
    }
  }, [user]);

  const login = async (email: string, password: string) => {
    let response: Response;
    try {
      response = await fetch(apiUrl("/api/Auth/login"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      throw new Error(
        "No hay conexión con el servidor. Arranca el backend: en la carpeta `backend` ejecuta `dotnet run` (http://localhost:5000) y deja `npm run dev` en marcha. Si usas `vite preview`, añade en `.env` la línea VITE_API_URL=http://127.0.0.1:5000 y reinicia.",
      );
    }

    if (!response.ok) {
      const msg = await readApiErrorMessage(
        response,
        "No se pudo iniciar sesión.",
      );
      throw new Error(msg);
    }

    const data = await response.json();
    const next: AuthUser = {
      id: data.id,
      nombre: data.nombre,
      email: data.email,
      telefono: data.telefono,
      rol: data.rol,
      estado: data.estado,
      token: data.token,
      jti: data.jti,
      expiraEn: data.expiraEn,
    };
    setUser(next);
    return next;
  };

  const register = async (registerData: RegisterData) => {
    let response: Response;
    try {
      response = await fetch(apiUrl("/api/Auth/register"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(registerData),
      });
    } catch {
      throw new Error(
        "No hay conexión con el API. Asegúrate de tener `dotnet run` en `backend` y Vite con `npm run dev`.",
      );
    }

    if (!response.ok) {
      const errorMessage = await readApiErrorMessage(
        response,
        "No se pudo registrar el usuario.",
      );
      throw new Error(errorMessage);
    }

    return (await response.json().catch(() => ({}))) as RegisterResult;
  };

  const logout = () => {
    const tokenToRevoke = user?.token;
    setUser(null);
    if (tokenToRevoke) {
      void fetch(apiUrl("/api/Auth/logout"), {
        method: "POST",
        headers: authJsonHeaders(tokenToRevoke),
      }).catch(() => {
        /* sin conexión: igual se limpia el cliente */
      });
    }
  };

  const token = user?.token ?? null;

  const value = useMemo(
    () => ({
      user,
      isAdmin: user?.rol === "Administrador",
      token,
      login,
      register,
      logout,
    }),
    [user, token],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth debe usarse dentro de AuthProvider");
  }
  return context;
}
