using Microsoft.AspNetCore.Mvc;
using RutaSegura.Services;

namespace RutaSegura.Controllers
{
    /// <summary>
    /// Controlador para endpoints del Agente IA
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    public class AIAgentController : ControllerBase
    {
        private readonly AIAgentService _agentService;
        private readonly LLMService _llmService;
        private readonly ILogger<AIAgentController> _logger;

        public AIAgentController(
            AIAgentService agentService,
            LLMService llmService,
            ILogger<AIAgentController> logger)
        {
            _agentService = agentService;
            _llmService = llmService;
            _logger = logger;
        }

        /// <summary>
        /// Analiza la seguridad de una ruta
        /// </summary>
        [HttpPost("analyze-route")]
        public async Task<IActionResult> AnalyzeRoute([FromBody] RouteAnalysisRequest request)
        {
            try
            {
                if (string.IsNullOrEmpty(request.Origin) || string.IsNullOrEmpty(request.Destination))
                    return BadRequest("Origin and Destination are required");

                var result = await _agentService.AnalyzeRouteSecurityAsync(
                    request.Origin,
                    request.Destination,
                    request.ContextData ?? new Dictionary<string, object>()
                );

                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError($"Error analizando ruta: {ex.Message}");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        /// <summary>
        /// Obtiene recomendaciones de ruta basadas en IA
        /// </summary>
        [HttpPost("route-recommendations")]
        public async Task<IActionResult> GetRouteRecommendations([FromBody] RouteRecommendationRequest request)
        {
            try
            {
                if (string.IsNullOrEmpty(request.StartPoint) || string.IsNullOrEmpty(request.EndPoint))
                    return BadRequest("StartPoint and EndPoint are required");

                var recommendations = await _agentService.GetRouteRecommendationsAsync(
                    request.StartPoint,
                    request.EndPoint,
                    request.TimeOfDay,
                    request.AdditionalContext
                );

                return Ok(recommendations);
            }
            catch (Exception ex)
            {
                _logger.LogError($"Error obteniendo recomendaciones: {ex.Message}");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        /// <summary>
        /// Evalúa el nivel de riesgo de una ubicación
        /// </summary>
        [HttpPost("assess-risk")]
        public async Task<IActionResult> AssessLocationRisk([FromBody] LocationRiskRequest request)
        {
            try
            {
                var assessment = await _agentService.AssessLocationRiskAsync(
                    request.Latitude,
                    request.Longitude,
                    request.TimeOfDay
                );

                return Ok(assessment);
            }
            catch (Exception ex)
            {
                _logger.LogError($"Error evaluando riesgo: {ex.Message}");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        /// <summary>
        /// Procesa una consulta de usuario
        /// </summary>
        [HttpPost("query")]
        public async Task<IActionResult> ProcessQuery([FromBody] UserQueryRequest request)
        {
            try
            {
                if (string.IsNullOrEmpty(request.Query))
                    return BadRequest("Query is required");

                var response = await _agentService.ProcessUserQueryAsync(
                    request.Query,
                    request.ConversationHistory ?? new List<(string, string)>()
                );

                return Ok(new { response });
            }
            catch (Exception ex)
            {
                _logger.LogError($"Error procesando consulta: {ex.Message}");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        /// <summary>
        /// Obtiene una respuesta directa del LLM
        /// </summary>
        [HttpPost("llm-completion")]
        public async Task<IActionResult> GetLLMCompletion([FromBody] LLMCompletionRequest request)
        {
            try
            {
                if (string.IsNullOrEmpty(request.Message))
                    return BadRequest("Message is required");

                var response = await _llmService.GetCompletionAsync(
                    request.Message,
                    request.SystemPrompt
                );

                return Ok(new { response });
            }
            catch (Exception ex)
            {
                _logger.LogError($"Error en LLM completion: {ex.Message}");
                return StatusCode(500, new { error = ex.Message });
            }
        }
    }

    // Request DTOs
    public class RouteAnalysisRequest
    {
        public string Origin { get; set; } = string.Empty;
        public string Destination { get; set; } = string.Empty;
        public Dictionary<string, object>? ContextData { get; set; }
    }

    public class RouteRecommendationRequest
    {
        public string StartPoint { get; set; } = string.Empty;
        public string EndPoint { get; set; } = string.Empty;
        public string TimeOfDay { get; set; } = "daytime";
        public Dictionary<string, object>? AdditionalContext { get; set; }
    }

    public class LocationRiskRequest
    {
        public double Latitude { get; set; }
        public double Longitude { get; set; }
        public string TimeOfDay { get; set; } = "daytime";
    }

    public class UserQueryRequest
    {
        public string Query { get; set; } = string.Empty;
        public List<(string, string)>? ConversationHistory { get; set; }
    }

    public class LLMCompletionRequest
    {
        public string Message { get; set; } = string.Empty;
        public string? SystemPrompt { get; set; }
    }
}
