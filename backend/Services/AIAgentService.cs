using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.Agents;
using System.ComponentModel;

namespace RutaSegura.Services
{
    /// <summary>
    /// Servicio de Agente IA para toma de decisiones y procesamiento inteligente
    /// </summary>
    public class AIAgentService
    {
        private readonly Kernel _kernel;
        private readonly LLMService _llmService;
        private readonly ILogger<AIAgentService> _logger;

        public AIAgentService(Kernel kernel, LLMService llmService, ILoggerFactory loggerFactory)
        {
            _kernel = kernel;
            _llmService = llmService;
            _logger = loggerFactory.CreateLogger<AIAgentService>();
        }

        /// <summary>
        /// Realiza un análisis inteligente de seguridad de ruta
        /// </summary>
        public async Task<RouteAnalysisResult> AnalyzeRouteSecurityAsync(
            string origin,
            string destination,
            Dictionary<string, object> contextData)
        {
            try
            {
                _logger.LogInformation($"Analizando seguridad de ruta: {origin} -> {destination}");

                var prompt = BuildSecurityAnalysisPrompt(origin, destination, contextData);
                var analysis = await _llmService.GetCompletionAsync(prompt);

                return ParseAnalysisResult(analysis);
            }
            catch (Exception ex)
            {
                _logger.LogError($"Error en análisis de seguridad: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// Proporciona recomendaciones de ruta basadas en IA
        /// </summary>
        public async Task<List<RouteRecommendation>> GetRouteRecommendationsAsync(
            string startPoint,
            string endPoint,
            string timeOfDay,
            Dictionary<string, object>? additionalContext = null)
        {
            try
            {
                _logger.LogInformation($"Obteniendo recomendaciones de ruta para {startPoint} -> {endPoint}");

                var prompt = BuildRecommendationPrompt(startPoint, endPoint, timeOfDay, additionalContext);
                var response = await _llmService.GetCompletionAsync(prompt);

                return ParseRecommendations(response);
            }
            catch (Exception ex)
            {
                _logger.LogError($"Error obteniendo recomendaciones: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// Evalúa el nivel de riesgo de una ubicación
        /// </summary>
        public async Task<RiskAssessment> AssessLocationRiskAsync(
            double latitude,
            double longitude,
            string timeOfDay)
        {
            try
            {
                _logger.LogInformation($"Evaluando riesgo en ubicación: {latitude}, {longitude}");

                var prompt = $@"
Como experto en seguridad urbana, evalúa el nivel de riesgo para una ubicación:
- Latitud: {latitude}
- Longitud: {longitude}
- Hora del día: {timeOfDay}

Proporciona:
1. Nivel de riesgo (Bajo/Medio/Alto/Crítico)
2. Factores de riesgo principales
3. Medidas de seguridad recomendadas
4. Calificación del 1-10

Responde en formato JSON estructurado.";

                var assessment = await _llmService.GetCompletionAsync(prompt);
                return ParseRiskAssessment(assessment);
            }
            catch (Exception ex)
            {
                _logger.LogError($"Error en evaluación de riesgo: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// Procesa consultas de usuario de forma inteligente
        /// </summary>
        public async Task<string> ProcessUserQueryAsync(string query, List<(string, string)> conversationHistory)
        {
            try
            {
                _logger.LogInformation($"Procesando consulta de usuario: {query}");

                var systemPrompt = @"Eres un asistente de seguridad vial inteligente llamado RutaSeguraBot. 
Tu propósito es ayudar a los usuarios a encontrar rutas seguras y proporcionar recomendaciones de seguridad.
Siempre prioriza la seguridad del usuario.
Sé amable, profesional y proporciona información basada en datos.";

                var messages = new List<(string role, string content)>();
                messages.Add(("system", systemPrompt));
                messages.AddRange(conversationHistory);
                messages.Add(("user", query));

                var response = await _llmService.GetChatCompletionAsync(messages);
                return response;
            }
            catch (Exception ex)
            {
                _logger.LogError($"Error procesando consulta: {ex.Message}");
                throw;
            }
        }

        // Métodos auxiliares privados

        private string BuildSecurityAnalysisPrompt(string origin, string destination, Dictionary<string, object> contextData)
        {
            var contextStr = string.Join("\n", contextData.Select(kvp => $"- {kvp.Key}: {kvp.Value}"));

            return $@"
Realiza un análisis de seguridad detallado para la siguiente ruta:
- Origen: {origin}
- Destino: {destination}

Contexto adicional:
{contextStr}

Proporciona:
1. Nivel de seguridad general
2. Zonas de riesgo identificadas
3. Horarios seguros recomendados
4. Alternativas de ruta más seguras
5. Medidas de prevención

Responde de forma estructurada y concisa.";
        }

        private string BuildRecommendationPrompt(
            string startPoint,
            string endPoint,
            string timeOfDay,
            Dictionary<string, object>? additionalContext)
        {
            var contextStr = additionalContext != null
                ? string.Join("\n", additionalContext.Select(kvp => $"- {kvp.Key}: {kvp.Value}"))
                : "Sin contexto adicional";

            return $@"
Proporciona 3-5 recomendaciones de ruta de {startPoint} a {endPoint} para la hora: {timeOfDay}

Contexto:
{contextStr}

Para cada recomendación incluye:
1. Descripción de la ruta
2. Duración estimada
3. Nivel de seguridad
4. Razón por la que es recomendada
5. Puntos de referencia principales

Prioriza la seguridad sobre la velocidad.";
        }

        private RouteAnalysisResult ParseAnalysisResult(string analysisText)
        {
            // En producción, usar JSON parsing más robusto
            return new RouteAnalysisResult
            {
                Analysis = analysisText,
                Timestamp = DateTime.UtcNow,
                Confidence = 0.85 // Valor por defecto
            };
        }

        private List<RouteRecommendation> ParseRecommendations(string recommendationsText)
        {
            return new List<RouteRecommendation>
            {
                new RouteRecommendation
                {
                    Description = recommendationsText,
                    SafetyLevel = "High",
                    RecommendationReason = "Basada en análisis IA"
                }
            };
        }

        private RiskAssessment ParseRiskAssessment(string assessmentText)
        {
            return new RiskAssessment
            {
                RiskLevel = "Medium",
                Assessment = assessmentText,
                Timestamp = DateTime.UtcNow
            };
        }
    }

    // DTOs
    public class RouteAnalysisResult
    {
        public string Analysis { get; set; } = string.Empty;
        public DateTime Timestamp { get; set; }
        public double Confidence { get; set; }
    }

    public class RouteRecommendation
    {
        public string Description { get; set; } = string.Empty;
        public string SafetyLevel { get; set; } = string.Empty;
        public string RecommendationReason { get; set; } = string.Empty;
    }

    public class RiskAssessment
    {
        public string RiskLevel { get; set; } = string.Empty;
        public string Assessment { get; set; } = string.Empty;
        public DateTime Timestamp { get; set; }
    }
}
