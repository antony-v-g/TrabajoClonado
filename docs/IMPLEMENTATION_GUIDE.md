# Guía de Compilación e Implementación de IA y Agentes

## 📋 Requisitos Previos

- .NET SDK 8.0 o superior
- Node.js 18+ (para frontend)
- OpenAI API Key configurada
- Git

## 🚀 Instalación Rápida

### 1. Actualizar Dependencias Backend

```bash
cd backend
dotnet restore RutaSegura.csproj
```

Esto descargará Semantic Kernel 1.27.0 automáticamente.

### 2. Compilar Backend

```bash
dotnet build RutaSegura.csproj
```

### 3. Ejecutar Backend

```bash
dotnet run --project RutaSegura.csproj
```

La API estará disponible en `https://localhost:xxxx` (o `http://localhost:xxxx` según tu config).

### 4. Verificar Instalación de IA

```bash
curl -X GET https://localhost:xxxx/api/ai/health \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Respuesta esperada:

```json
{
  "status": "healthy",
  "service": "SemanticKernel + OpenAI + Intelligent Agents",
  "version": "1.27.0",
  "features": [
    "TextGeneration",
    "Chat",
    "Agents",
    "RouteSafetyAnalysis",
    "PersonalizedRecommendations"
  ]
}
```

## 🔧 Configuración

### Archivo .env Backend

```
# OpenAI Configuration
OpenAI__ApiKey=sk-...your-key-here
OpenAI__ModelId=gpt-4o-mini
OpenAI__OrgId=

# Database
ConnectionStrings__DefaultConnection=Data Source=rutasegura.db

# JWT
Jwt__Issuer=RutaSegura.API
Jwt__Audience=RutaSegura.Client
Jwt__Key=your-secret-key-min-32-characters
```

## 📁 Estructura Nueva de Archivos

```
backend/
├── Services/
│   ├── SemanticKernelService.cs          (Actualizado)
│   ├── SemanticAgentService.cs           (NUEVO)
│   └── Plugins/
│       ├── RouteSafetyPlugin.cs          (NUEVO)
│       └── RecommendationPlugin.cs       (NUEVO)
├── Controllers/
│   └── AiController.cs                   (Expandido)
└── Program.cs                             (Actualizado)

docs/
├── AI_AGENTS_GUIDE.md                    (NUEVO)
└── FRONTEND_EXAMPLES.ts                  (NUEVO)
```

## 🧪 Pruebas

### Test 1: Verificar Salud del Servicio

```bash
curl -X GET http://localhost:5000/api/ai/health
```

### Test 2: Obtener Capacidades del Agente

```bash
curl -X GET http://localhost:5000/api/ai/agent/capabilities
```

### Test 3: Análisis de Ruta Inteligente

```bash
curl -X POST http://localhost:5000/api/ai/agent/analyze-route-intelligent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "routeDescription": "Calle Principal desde Centro hasta Parque",
    "estimatedTime": "08:30"
  }'
```

### Test 4: Análisis de Incidentes

```bash
curl -X POST http://localhost:5000/api/ai/agent/analyze-incidents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "zone": "Centro Histórico",
    "dayRange": 30
  }'
```

## 🐛 Troubleshooting

### Error: "OpenAI:ApiKey not configured"

**Causa**: Falta la variable de entorno `OpenAI__ApiKey`

**Solución**:

1. Verifica tu archivo `.env` existe
2. Contiene `OpenAI__ApiKey=sk-...`
3. Reinicia la aplicación

### Error: "Plugins not registered"

**Causa**: El kernel no tiene plugins registrados

**Solución**: Los plugins se registran automáticamente en el constructor. Si persiste:

1. Verifica que `SemanticAgentService` está inyectado
2. Revisa los logs de compilación

### Error: "Bad Request - Prompt is required"

**Causa**: El body del request está vacío

**Solución**: Asegúrate de incluir JSON válido en el request

```json
{
  "routeDescription": "Mi ruta aquí"
}
```

### API no responde

**Causa**: Backend no compiló correctamente

**Solución**:

```bash
dotnet clean
dotnet build
dotnet run
```

## 📊 Monitoreo

### Ver Logs en Tiempo Real

```bash
# Linux/Mac
tail -f backend/bin/Debug/net8.0/logs.txt

# Windows
type backend/bin/Debug/net8.0/logs.txt
```

### Verificar Base de Datos

```bash
# Con DBeaver o:
sqlite3 rutasegura.db ".tables"
```

## 🚢 Despliegue en Render

### Paso 1: Push a GitHub

```bash
git add .
git commit -m "feat: add semantic kernel agents v1.27.0"
git push origin main
```

### Paso 2: Configurar Variables en Render

En el dashboard de Render.com de tu servicio:

```
OpenAI__ApiKey=sk-...
OpenAI__ModelId=gpt-4o-mini
OpenAI__OrgId=
```

### Paso 3: Redeploy

```bash
# En Render dashboard → Manual Deploy
```

## ✅ Checklist de Implementación

- [ ] Actualizar NuGet packages (`dotnet restore`)
- [ ] Compilar proyecto (`dotnet build`)
- [ ] Verificar plugins registrados
- [ ] Probar endpoints de IA
- [ ] Configurar .env con OpenAI key
- [ ] Probar análisis de ruta
- [ ] Probar recomendaciones personalizadas
- [ ] Probar análisis de incidentes
- [ ] Deploy a Render (si aplica)

## 📚 Documentación Completa

Ver: `docs/AI_AGENTS_GUIDE.md` para documentación detallada de endpoints

## 🆘 Soporte

Si encuentras problemas:

1. Revisa `AI_AGENTS_GUIDE.md` - Troubleshooting
2. Verifica los logs: `dotnet run` muestra errores en tiempo real
3. Comprueba OpenAI key válida en `.env`
4. Reinicia con: `dotnet clean && dotnet restore && dotnet build`

---

**Última actualización**: 2024-01-15
**Versión Semantic Kernel**: 1.27.0
