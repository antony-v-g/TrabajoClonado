# Sistema de IA y Agentes Semánticos - Ruta Segura

## Actualización v1.27.0

Se ha integrado **Semantic Kernel 1.27.0** con **Agentes Inteligentes** para potenciar las capacidades de análisis de seguridad.

## Características Nuevas

### 1. **Semantic Kernel Actualizado**

- Versión: 1.27.0 (anterior: 0.18.0)
- Mejor rendimiento y nuevas capacidades de agentes
- Soporte mejorado para plugins

### 2. **Agentes Inteligentes**

#### A. **RouteSafetyAgent**

Analiza seguridad de rutas de manera inteligente usando:

- `get_route_incident_statistics` - Estadísticas de incidentes por zona
- `evaluate_route_safety` - Evaluación de seguridad en tiempo real
- `get_alternative_routes` - Rutas alternativas más seguras

#### B. **PersonalizedRecommendationsAgent**

Genera recomendaciones personalizadas usando:

- `get_user_safety_profile` - Perfil de seguridad del usuario
- `get_personalized_recommendations` - Recomendaciones basadas en patrones
- `check_emergency_contacts` - Verificación de contactos de emergencia

#### C. **IncidentAnalysisAgent**

Análisis de patrones de incidentes usando:

- Estadísticas históricas
- Identificación de tendencias
- Predicciones de riesgo

### 3. **Plugins Semánticos**

#### `RouteSafetyPlugin`

```
Funciones:
- get_route_incident_statistics(zoneId, dayRange)
- evaluate_route_safety(routeDescription, estimatedTime)
- get_alternative_routes(origin, destination)
```

#### `RecommendationPlugin`

```
Funciones:
- get_user_safety_profile(userId)
- get_personalized_recommendations(userId, frequentZone)
- check_emergency_contacts(userId)
```

## Nuevos Endpoints API

### 1. **Análisis Inteligente de Rutas**

```
POST /api/ai/agent/analyze-route-intelligent

Request:
{
  "routeDescription": "Calle Principal hasta Parque Central",
  "estimatedTime": "08:30"
}

Response:
{
  "routeDescription": "Calle Principal hasta Parque Central",
  "agentAnalysis": "[Análisis detallado del agente]",
  "agentType": "RouteSafetyAgent",
  "executedAt": "2024-01-15T10:30:00Z"
}
```

### 2. **Recomendaciones Personalizadas**

```
POST /api/ai/agent/personalized-recommendations

Request:
{
  "context": "Viajaré frecuentemente de noche"
}

Response:
{
  "userId": "user-123",
  "recommendations": "[Recomendaciones basadas en perfil del usuario]",
  "agentType": "PersonalizedRecommendationsAgent",
  "generatedAt": "2024-01-15T10:30:00Z"
}
```

### 3. **Análisis de Incidentes**

```
POST /api/ai/agent/analyze-incidents

Request:
{
  "zone": "Centro Histórico",
  "dayRange": 30
}

Response:
{
  "zone": "Centro Histórico",
  "analysis": "[Análisis detallado de patrones de incidentes]",
  "agentType": "IncidentAnalysisAgent",
  "analyzedAt": "2024-01-15T10:30:00Z",
  "dayRange": 30
}
```

### 4. **Capacidades del Agente**

```
GET /api/ai/agent/capabilities

Response:
{
  "agents": [
    {
      "name": "RouteSafetyAgent",
      "description": "Analiza seguridad de rutas...",
      "endpoint": "/api/ai/agent/analyze-route-intelligent"
    },
    ...
  ],
  "availableFunctions": [
    "RouteSafety.evaluate_route_safety",
    "RouteSafety.get_route_incident_statistics",
    ...
  ]
}
```

### 5. **Estado del Servicio**

```
GET /api/ai/health

Response:
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

## Endpoints Existentes (Mantenidos)

- `POST /api/ai/generate` - Generación de texto
- `POST /api/ai/chat` - Chat completo
- `POST /api/ai/analyze-route` - Análisis básico de ruta
- `POST /api/ai/summarize` - Resumen de textos
- `GET /api/ai/health` - Estado del servicio

## Configuración (.env)

```
# OpenAI Configuration
OpenAI__ApiKey=your-openai-api-key-here
OpenAI__ModelId=gpt-4o-mini
OpenAI__OrgId=
```

## Ejemplo de Uso en Frontend (React)

```javascript
// Análisis inteligente de ruta
const analyzeRouteWithAgent = async (route, time) => {
  const response = await fetch("/api/ai/agent/analyze-route-intelligent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      routeDescription: route,
      estimatedTime: time,
    }),
  });
  return response.json();
};

// Recomendaciones personalizadas
const getRecommendations = async (context) => {
  const response = await fetch("/api/ai/agent/personalized-recommendations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ context }),
  });
  return response.json();
};
```

## Flujo de Ejecución del Agente

```
Usuario Request
    ↓
AiController
    ↓
SemanticAgentService
    ↓
Kernel (Semantic Kernel)
    ↓
Plugins (RouteSafety, Recommendations)
    ↓
Base de Datos (Reportes, Usuarios, etc.)
    ↓
Análisis + Respuesta de IA
    ↓
Response JSON
```

## Ventajas de esta Arquitectura

1. **Razonamiento Inteligente**: Los agentes pueden acceder a datos reales y razonar sobre ellos
2. **Modularidad**: Plugins separados para diferentes dominios
3. **Escalabilidad**: Fácil agregar nuevos plugins y agentes
4. **Confiabilidad**: Respuestas basadas en datos reales del sistema
5. **Seguridad**: Los agentes operan dentro de autenticación JWT

## Próximas Mejoras Sugeridas

- [ ] Agregar agente para alertas en tiempo real
- [ ] Crear plugin de integración con Google Maps
- [ ] Implementar chat multiturno con historial
- [ ] Agregar análisis predictivo de riesgo
- [ ] Crear dashboard de estadísticas de agentes

## Troubleshooting

### Error: "OpenAI:ApiKey not configured"

**Solución**: Asegúrate de tener la variable `OpenAI__ApiKey` configurada en `.env`

### Error: "Plugins not registered"

**Solución**: Los plugins se registran automáticamente en el constructor del controlador

### Error: "Kernel is null"

**Solución**: Verifica que `SemanticKernelService` está inyectado en `Program.cs`

## Contacto y Soporte

Para reportar issues o sugerencias, usa los canales del proyecto.
