using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.Agents;
using Microsoft.Extensions.Logging;
using RutaSegura.Data;
using RutaSegura.Services.Plugins;

namespace RutaSegura.Services
{
    /// <summary>
    /// Servicio de agentes inteligentes basado en Semantic Kernel.
    /// Implementa agentes que pueden razonar y ejecutar acciones complejas de seguridad.
    /// </summary>
    public class SemanticAgentService
    {
        private readonly Kernel _kernel;
        private readonly ApplicationDbContext _context;
        private readonly ILogger<SemanticAgentService> _logger;
        private readonly ILoggerFactory _loggerFactory;

        public SemanticAgentService(
            Kernel kernel,
            ApplicationDbContext context,
            ILogger<SemanticAgentService> logger,
            ILoggerFactory loggerFactory)
        {
            _kernel = kernel ?? throw new ArgumentNullException(nameof(kernel));
            _context = context ?? throw new ArgumentNullException(nameof(context));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
            _loggerFactory = loggerFactory ?? throw new ArgumentNullException(nameof(loggerFactory));
        }

        /// <summary>
        /// Inicializa el kernel con plugins personalizados para el agente.
        /// </summary>
        public void RegisterPlugins()
        {
            try
            {
                var routeLogger = _loggerFactory.CreateLogger<RouteSafetyPlugin>();
                var recommendationLogger = _loggerFactory.CreateLogger<RecommendationPlugin>();

                var routePlugin = new RouteSafetyPlugin(_context, routeLogger);
                var recommendationPlugin = new RecommendationPlugin(_context, recommendationLogger);

                _kernel.Plugins.AddFromObject(routePlugin, "RouteSafety");
                _kernel.Plugins.AddFromObject(recommendationPlugin, "Recommendations");

                _logger.LogInformation("Plugins de seguridad registrados en el kernel");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error registrando plugins");
                throw;
            }
        }

        /// <summary>
        /// Ejecuta un agente de análisis de ruta que evalúa seguridad y genera recomendaciones.
        /// </summary>
        public async Task<AgentResponse> ExecuteRouteSafetyAgentAsync(
            string routeDescription,
            string? userId = null,
            string? estimatedTime = null,
            CancellationToken cancellationToken = default)
        {
            try
            {
                var prompt = $"""
                    Eres un agente especializado en seguridad de rutas urbanas.
                    Tu objetivo es analizar la seguridad de una ruta y proporcionar recomendaciones detalladas.

                    Información de la ruta:
                    - Descripción: {routeDescription}
                    - Hora estimada: {estimatedTime ?? "no especificada"}
                    {(userId != null ? $"- Usuario: {userId}" : "")}

                    DEBES:
                    1. Usar la función 'RouteSafety-evaluate_route_safety' para evaluar la seguridad
                    2. Usar la función 'RouteSafety-get_route_incident_statistics' para obtener datos históricos
                    3. Si hay un userId, usar 'Recommendations-get_personalized_recommendations'
                    4. Proporcionar un análisis estructurado con:
                       - Nivel de seguridad (BAJO/MEDIO/ALTO/CRÍTICO)
                       - 3-5 recomendaciones específicas
                       - Alternativas de ruta si es necesario

                    Responde SIEMPRE en español y de manera clara y accionable.
                    """;

                var result = await _kernel.InvokePromptAsync(prompt, cancellationToken: cancellationToken);
                var responseText = result.ToString();

                _logger.LogInformation("Agente de análisis de ruta completado. Usuario: {UserId}, Largo: {Length}",
                    userId ?? "anonymous", responseText?.Length ?? 0);

                return new AgentResponse
                {
                    Success = true,
                    Message = responseText ?? "No se pudo generar análisis",
                    AgentType = "RouteSafetyAgent",
                    ExecutedAt = DateTime.UtcNow
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error ejecutando agente de seguridad de ruta");
                return new AgentResponse
                {
                    Success = false,
                    Message = $"Error en análisis: {ex.Message}",
                    AgentType = "RouteSafetyAgent",
                    ExecutedAt = DateTime.UtcNow
                };
            }
        }

        /// <summary>
        /// Ejecuta un agente de recomendaciones personalizadas para un usuario.
        /// </summary>
        public async Task<AgentResponse> ExecutePersonalizedRecommendationsAgentAsync(
            string userId,
            string? context = null,
            CancellationToken cancellationToken = default)
        {
            try
            {
                var prompt = $"""
                    Eres un asesor de seguridad personal especializado.
                    Tu tarea es generar recomendaciones personalizadas para el usuario basadas en su perfil y patrones.

                    Usuario ID: {userId}
                    {(context != null ? $"Contexto adicional: {context}" : "")}

                    DEBES:
                    1. Usar 'Recommendations-get_user_safety_profile' para obtener el perfil del usuario
                    2. Usar 'Recommendations-get_personalized_recommendations' para recomendaciones
                    3. Usar 'Recommendations-check_emergency_contacts' para verificar contactos
                    4. Generar un plan de seguridad personalizado que incluya:
                       - Estado actual de seguridad del usuario
                       - Acciones inmediatas recomendadas
                       - Mejoras a largo plazo
                       - Recursos disponibles en el sistema

                    Sé empático, específico y práctico. Responde en español.
                    """;

                var result = await _kernel.InvokePromptAsync(prompt, cancellationToken: cancellationToken);
                var responseText = result.ToString();

                _logger.LogInformation("Agente de recomendaciones personalizadas completado para usuario {UserId}", userId);

                return new AgentResponse
                {
                    Success = true,
                    Message = responseText ?? "No se pudieron generar recomendaciones",
                    AgentType = "PersonalizedRecommendationsAgent",
                    ExecutedAt = DateTime.UtcNow
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error ejecutando agente de recomendaciones personalizadas");
                return new AgentResponse
                {
                    Success = false,
                    Message = $"Error generando recomendaciones: {ex.Message}",
                    AgentType = "PersonalizedRecommendationsAgent",
                    ExecutedAt = DateTime.UtcNow
                };
            }
        }

        /// <summary>
        /// Ejecuta un agente de análisis de incidentes para identificar patrones.
        /// </summary>
        public async Task<AgentResponse> ExecuteIncidentAnalysisAgentAsync(
            string zone,
            int dayRange = 30,
            CancellationToken cancellationToken = default)
        {
            try
            {
                var prompt = $"""
                    Eres un analista de datos de seguridad urbana.
                    Tu tarea es analizar patrones de incidentes en una zona específica.

                    Zona: {zone}
                    Período: Últimos {dayRange} días

                    DEBES:
                    1. Usar 'RouteSafety-get_route_incident_statistics' para obtener datos
                    2. Identificar:
                       - Patrones horarios de incidentes
                       - Tipos de incidentes más comunes
                       - Tendencias (mejorando/empeorando)
                       - Zonas críticas dentro de la área
                    3. Proporcionar:
                       - Análisis detallado
                       - Predicciones de riesgo
                       - Recomendaciones preventivas

                    Sé analítico y basado en datos. Responde en español.
                    """;

                var result = await _kernel.InvokePromptAsync(prompt, cancellationToken: cancellationToken);
                var responseText = result.ToString();

                _logger.LogInformation("Agente de análisis de incidentes completado para zona {Zone}", zone);

                return new AgentResponse
                {
                    Success = true,
                    Message = responseText ?? "No se pudo completar el análisis",
                    AgentType = "IncidentAnalysisAgent",
                    ExecutedAt = DateTime.UtcNow
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error ejecutando agente de análisis de incidentes");
                return new AgentResponse
                {
                    Success = false,
                    Message = $"Error en análisis: {ex.Message}",
                    AgentType = "IncidentAnalysisAgent",
                    ExecutedAt = DateTime.UtcNow
                };
            }
        }
    }

    /// <summary>
    /// Respuesta estandarizada del agente.
    /// </summary>
    public class AgentResponse
    {
        public bool Success { get; set; }
        public string? Message { get; set; }
        public string? AgentType { get; set; }
        public DateTime ExecutedAt { get; set; }
    }
}
