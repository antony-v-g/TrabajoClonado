
# Plataforma de Ruta Segura

Este proyecto incluye:

- Frontend en React + Vite
- Backend en .NET 8 (Web API)
- Base de datos SQLite (compatible con DBeaver)
- Soporte para sesiones con JWT y Redis (opcional en local, recomendado en Render)

Proyecto base de diseño: [Figma - Plataforma de Ruta Segura](https://www.figma.com/design/BfhpVYZvQxJOG60Pmxam8l/Plataforma-de-Ruta-Segura)

## Requisitos

- Node.js 18+
- .NET SDK 8+
- (Opcional) DBeaver

## Ejecucion local

### 1) Frontend

```bash
npm i
npm run dev
```

Frontend por defecto: `http://localhost:5173`

### 2) Backend

```bash
dotnet restore backend/RutaSegura.csproj
dotnet build backend/RutaSegura.csproj
dotnet run --project backend/RutaSegura.csproj
```

API por defecto: `https://localhost:xxxx` o `http://localhost:xxxx` (segun tu perfil local).

## Base de datos SQLite (EF Core)

La conexion local esta en `backend/appsettings.json`:

```json
"ConnectionStrings": {
  "DefaultConnection": "Data Source=rutasegura.db"
}
```

### Crear/aplicar migraciones

Ya existe la migracion inicial (`InitialSQLite`). Si necesitas recrear o actualizar:

```bash
dotnet ef migrations add NombreMigracion --project backend/RutaSegura.csproj --startup-project backend/RutaSegura.csproj
dotnet ef database update --project backend/RutaSegura.csproj --startup-project backend/RutaSegura.csproj
```

## DBeaver (SQLite)

1. Abre DBeaver.
2. Crea una conexion nueva de tipo `SQLite`.
3. Selecciona el archivo `rutasegura.db` en la raiz del proyecto.
4. Conecta y revisa tablas:
   - `Usuarios`
   - `Reportes`
   - `Contactos`
   - `Catalogos`
   - `Sesiones`
   - `Proyectos`

## Endpoints principales

- `POST /api/Auth/register`
- `POST /api/Auth/login`
- `GET /api/Usuarios`
- `GET /api/Contactos/usuario/{usuarioId}`
- `POST /api/Contactos`
- `PUT /api/Contactos/{id}`
- `DELETE /api/Contactos/{id}`
- `GET /api/Session/usuario/{usuarioId}`
- `POST /api/Session/revocar/{id}`
- `GET /api/Reportes`
- `POST /api/Reportes/Crear`
- `POST /api/Reportes/Aprobar/{id}`

## Despliegue en Render

`render.yaml` define:

- **rutasegura** — Web (Docker: API + front)
- **rutasegura-redis** — Redis (sesiones JWT + caché de reportes/usuarios)
- SQLite en `Data Source=/var/data/rutasegura.db` (monta disco persistente en el dashboard si quieres conservar datos)

### Opción A — Servicio Redis nuevo (recomendado si ya tienes el web en Render)

1. [dashboard.render.com](https://dashboard.render.com) → **New +** → **Redis**.
2. Nombre: `rutasegura-redis`, plan **Free**, región la misma que tu web.
3. Al crear, copia **Internal Redis URL** (empieza con `redis://`).
4. Abre tu servicio web **rutasegura** (ubg3) → **Environment** → añade o edita:
   - **Key:** `Redis__ConnectionString`
   - **Value:** pega la Internal Redis URL (no la pública si el web está en la misma cuenta/región).
5. **Save Changes** → Render redeploya solo.
6. En **Logs** del web debe aparecer: `Redis conectado`.
7. En la app: **Admin → Configuración** → debe decir **Redis: activo**.

### Opción B — Blueprint (repo nuevo o recrear desde cero)

1. Push a GitHub.
2. Render → **New +** → **Blueprint** → elige el repo.
3. Render crea web + Redis y enlaza `Redis__ConnectionString` automáticamente.
4. Añade a mano `VITE_GOOGLE_MAPS_API_KEY` y disco en `/var/data` si aplica.

### Variables que debes revisar en el web service

| Variable | Ejemplo |
|----------|---------|
| `Redis__ConnectionString` | `redis://red-xxx:6379` (Internal URL) |
| `FRONTEND_URL` | `https://rutasegura-ubg3.onrender.com` |
| `VITE_GOOGLE_MAPS_API_KEY` | clave Maps (build Docker) |
| `ConnectionStrings__DefaultConnection` | `Data Source=/var/data/rutasegura.db` |

## Redis en local (opcional)

Si no configuras Redis local, la API funciona igual (modo deshabilitado).  
Para habilitar Redis local, define en `backend/appsettings.json` o variables de entorno:

```json
"Redis": {
  "ConnectionString": "localhost:6379"
}
```
  