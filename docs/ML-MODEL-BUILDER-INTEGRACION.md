# Ruta Segura — ML.NET Model Builder + APIs (guía universitaria)

## Estructura del proyecto (backend)

```
backend/
├── Datasets/                    # CSV para Model Builder y entrenamiento automático
│   ├── zona_clasificacion.csv   # Data Classification
│   └── rutas_recomendacion.csv  # Recommendation
├── Models/                      # Copiar aquí los .zip de Visual Studio
│   ├── zone-safety-classifier.zip
│   ├── route-recommender.zip
│   └── incident-classifier.zip  (opcional)
├── ML/                          # Tipos y entrenador programático
│   ├── MlModelPaths.cs
│   ├── MlModelTrainer.cs
│   └── *.cs (filas de entrenamiento)
└── Services/
    ├── MlNetService.cs          # Carga modelos y predicción
    ├── MlCsvDatasetLoader.cs    # Lee CSV (igual que Model Builder)
    ├── MlZoneQueryService.cs    # GET clasificar-zona + Redis
    └── ExternalApisService.cs   # WeatherAPI, catálogo APIs
```

---

## PARTE A — ML.NET Model Builder (Visual Studio)

### A.1 Clasificación de zonas (Data Classification)

1. Abre **Visual Studio** → proyecto `ConsoleAppML` o crea uno .NET 8.
2. Clic derecho en el proyecto → **Add** → **Machine Learning Model**.
3. Escenario: **Data classification** → **Local**.
4. **Data** → selecciona `backend/Datasets/zona_clasificacion.csv`.
5. Columna **Label**: `Label` (valores: Segura, Moderada, Peligrosa).
6. Columnas de features: `CantidadReportes`, `Hora`, `Iluminacion`, `Trafico`, `IncidentesRecientes`.
7. **Train** → espera AutoML / SDCA.
8. **Evaluate** → anota accuracy.
9. **Consume** → genera código o **Export** del modelo.
10. Copia el `.zip` a: `backend/Models/zone-safety-classifier.zip`.

### A.2 Recomendación de rutas (Recommendation)

1. Nuevo modelo en el mismo proyecto ML.
2. Escenario: **Recommendation** → **Local**.
3. Data: `backend/Datasets/rutas_recomendacion.csv`.
4. Columnas: **UserId**, **RouteId**, **Label** (calificación 1–5).
5. Train → Evaluate → Export.
6. Copia el `.zip` a: `backend/Models/route-recommender.zip`.

### A.3 Error al entrenar: `Microsoft.CodeAnalysis.CSharp, Version=4.9.0.0`

En **Visual Studio 2026** es un fallo conocido: la carpeta de Model Builder no incluye esa DLL (compilar el proyecto **no** lo arregla).

**Opción 1 — Entrenar sin Model Builder (recomendado):**

```powershell
cd backend
dotnet run -- --train-ml
```

Genera los `.zip` en `backend/Models/` (mismo CSV `zona_clasificacion.csv`). Para la universidad puedes mostrar el `.mbconfig`, el CSV y este comando.

**Opción 2 — Reparar Model Builder (admin):**

```powershell
# PowerShell como Administrador, desde la raíz del repo:
.\scripts\fix-model-builder-vs2026.ps1
```

Copia `CodeAnalysis.CSharp`, `CodeAnalysis` y `CodeAnalysis.Workspaces` (5.0). Cierra Visual Studio, ejecuta el script, abre de nuevo.

Si el entrenamiento **terminó** (ves MacroAccuracy ~95 %) pero falló al **generar código**, el modelo ya se entrenó: ejecuta el script otra vez, reinicia VS y pulsa **Siguiente** hacia **Evaluar**, o usa la Opción 1.

**Opción 3 — Swagger:** `POST /api/ml/entrenar` con usuario **Administrador** (API en ejecución).

### A.4 Probar sin Model Builder (automático)

Si `Models/` está vacío, al iniciar la API:

- `MlStartupHostedService` entrena desde **CSV + SQLite**.
- Guarda los `.zip` en `Models/` (o `ML/Artifacts/` como respaldo).

---

## PARTE B — Endpoints API ML

### Clasificación de zona (requerido en la rúbrica)

```http
GET /api/ml/clasificar-zona?zona=Centro%20de%20Lima&cantidad_reportes=0.75&hora=22&iluminacion=0.2&trafico=0.85&incidentes_recientes=4
```

**Respuesta ejemplo:**

```json
{
  "zona": "Centro de Lima",
  "riesgo": "Peligrosa",
  "confianza": 0.91,
  "indicadorVisual": "🔴",
  "etiqueta": "Zona peligrosa",
  "motor": "ML.NET Data Classification (SdcaMaximumEntropy)",
  "servidoDesdeCache": false
}
```

### Recomendación de rutas

```http
GET /api/ml/recomendar-rutas?origen=Plaza%20Mayor&destino=Miraflores
Authorization: Bearer {token}
```

### Estado y reentrenamiento (admin)

- `GET /api/ml/estado`
- `POST /api/ml/entrenar` (rol Administrador)

### Contexto externo + ML

- `GET /api/ml/contexto-zona?zona=...&lat=...&lon=...`

---

## PARTE C — Dónde se usa en la app

| Pantalla | ML | API |
|----------|----|-----|
| **Inicio** | Clasificación en alertas (`DashboardAlertasService`) | `/api/alertas/recientes` |
| **Mapa** | Riesgo de zona en contexto | `/api/mapa/contexto` |
| **Buscar Ruta** | Recomendación perfiles | `/api/ml/recomendar-rutas` |
| **Reportar** | Clasificación incidente al crear | `POST /api/Reportes/Crear` |
| **Admin Dashboard** | Resumen riesgo | `/api/Admin/resumen` |
| **Mapa de calor** | Pines por reporte aprobado | `/api/Admin/puntos-mapa` |
| **Alertas** | ML + Redis | `/api/Admin/alertas` |
| **Motor predictivo** | Estado modelos | `/api/ml/estado` |

---

## PARTE D — Redis

| Clave | Uso |
|-------|-----|
| `sesion:{jti}` | Validación JWT rápida |
| `ml:zona:v1:...` | Caché predicción clasificación |
| `ext:clima:lat:lon` | Caché WeatherAPI |
| `admin:resumen:v2` | Dashboard admin |
| `admin:puntos-mapa:v2:{dias}` | Mapa de calor |

---

## PARTE E — APIs externas

| API | Variable entorno | Endpoint proyecto |
|-----|------------------|-------------------|
| Google Maps | `VITE_GOOGLE_MAPS_API_KEY` | Front: mapas, Places, rutas |
| WeatherAPI | `WEATHERAPI_API_KEY` | `GET /api/external/clima` |
| Catálogo | — | `GET /api/external/catalogo` |
| Tráfico demo | — | `GET /api/external/trafico-demo` |

### Cómo obtener WeatherAPI (gratis)

1. Registro en https://www.weatherapi.com/signup.aspx
2. En Render → Environment → `WEATHERAPI_API_KEY=tu_clave`
3. Prueba: `/api/external/clima?lat=-12.04&lon=-77.04`

---

## PARTE F — Docker y Render

1. `git push` con `Datasets/`, `Models/` (o vacío + entrenamiento auto).
2. Render **Deploy latest commit**.
3. Variables: `Redis__ConnectionString`, `Redis__Password`, `VITE_GOOGLE_MAPS_API_KEY`, `WEATHERAPI_API_KEY` (opcional).
4. Swagger: `https://tu-app.onrender.com/swagger`

---

## PARTE G — Demostración en exposición (5 min ML)

1. Mostrar CSV en `Datasets/zona_clasificacion.csv`.
2. Mostrar Visual Studio Model Builder (captura del profe).
3. Swagger → `GET /api/ml/clasificar-zona` con parámetros extremos (noche, muchos reportes) → **Peligrosa**.
4. Cambiar parámetros (día, poca cantidad) → **Segura**.
5. App → **Buscar Ruta** → explicar recomendación ML.
6. Admin → **Motor predictivo** → tres modelos listos.
7. Admin → **Configuración** → Redis activo.

---

## Variables del dataset (explicación oral)

| Variable | Significado | Rango |
|----------|-------------|-------|
| cantidad_reportes | Densidad de incidentes en la zona | 0–1 |
| hora | Hora del día (riesgo nocturno) | 0–23 |
| iluminacion | Nivel de luz en la vía | 0–1 |
| trafico | Congestión / afluencia | 0–1 |
| incidentes_recientes | Incidentes recientes en ventana corta | 0–1 |

**Salida:** Segura | Moderada | Peligrosa + confianza (0–1).
