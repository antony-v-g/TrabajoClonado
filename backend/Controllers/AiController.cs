using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RutaSegura.Services;
using System.Security.Claims;

namespace RutaSegura.Controllers
{
    /// <summary>
    /// API endpoints for LLM and AI operations using Semantic Kernel and Intelligent Agents.
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class AiController : ControllerBase
    {
        private readonly SemanticKernelService _semanticKernelService;
        private readonly SemanticAgentService _semanticAgentService;
        private readonly ILogger<AiController> _logger;

        public AiController(
            SemanticKernelService semanticKernelService,
            SemanticAgentService semanticAgentService,
            ILogger<AiController> logger)
        {
            _semanticKernelService = semanticKernelService ?? throw new ArgumentNullException(nameof(semanticKernelService));
            _semanticAgentService = semanticAgentService ?? throw new ArgumentNullException(nameof(semanticAgentService));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));

            // Registrar plugins al instanciar
            try
            {
                _semanticAgentService.RegisterPlugins();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Plugins ya registrados o error al registrar");
            }
        }

        /// <summary>
        /// Generate text from a prompt using OpenAI.
        /// </summary>
        [HttpPost("generate")]
        [ProducesResponseType(typeof(GenerateTextResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<GenerateTextResponse>> GenerateText([FromBody] GenerateTextRequest request, CancellationToken cancellationToken)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request?.Prompt))
                    return BadRequest(new { error = "Prompt is required" });

                var result = await _semanticKernelService.GenerateTextAsync(request.Prompt, request.MaxTokens ?? 500, cancellationToken);
                return Ok(new GenerateTextResponse { GeneratedText = result, Prompt = request.Prompt });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in GenerateText endpoint");
                return StatusCode(StatusCodes.Status500InternalServerError, new { error = ex.Message });
            }
        }

        /// <summary>
        /// Get a chat completion response.
        /// </summary>
        [HttpPost("chat")]
        [ProducesResponseType(typeof(ChatCompletionResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<ChatCompletionResponse>> Chat([FromBody] ChatRequest request, CancellationToken cancellationToken)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request?.Message))
                    return BadRequest(new { error = "Message is required" });

                var result = await _semanticKernelService.GetChatCompletionAsync(request.Message, cancellationToken);
                return Ok(new ChatCompletionResponse { Message = request.Message, Response = result });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in Chat endpoint");
                return StatusCode(StatusCodes.Status500InternalServerError, new { error = ex.Message });
            }
        }

        /// <summary>
        /// Analyze a route for safety using AI.
        /// </summary>
        [HttpPost("analyze-route")]
        [ProducesResponseType(typeof(RouteSafetyAnalysisResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<RouteSafetyAnalysisResponse>> AnalyzeRoute([FromBody] RouteSafetyRequest request, CancellationToken cancellationToken)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request?.RouteDescription))
                    return BadRequest(new { error = "Route description is required" });

                var analysis = await _semanticKernelService.AnalyzeRouteSafetyAsync(request.RouteDescription, request.IncidentData, cancellationToken);
                return Ok(new RouteSafetyAnalysisResponse
                {
                    RouteDescription = request.RouteDescription,
                    Analysis = analysis,
                    AnalyzedAt = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in AnalyzeRoute endpoint");
                return StatusCode(StatusCodes.Status500InternalServerError, new { error = ex.Message });
            }
        }

        /// <summary>
        /// Summarize a long text.
        /// </summary>
        [HttpPost("summarize")]
        [ProducesResponseType(typeof(SummaryResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<SummaryResponse>> Summarize([FromBody] SummarizeRequest request, CancellationToken cancellationToken)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request?.Text))
                    return BadRequest(new { error = "Text is required" });

                var summary = await _semanticKernelService.SummarizeTextAsync(request.Text, cancellationToken);
                return Ok(new SummaryResponse { OriginalText = request.Text, Summary = summary });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in Summarize endpoint");
                return StatusCode(StatusCodes.Status500InternalServerError, new { error = ex.Message });
            }
        }

        /// <summary>
        /// Execute intelligent route safety agent with advanced analysis and recommendations.
        /// </summary>
        [HttpPost("agent/analyze-route-intelligent")]
        [ProducesResponseType(typeof(AgentAnalysisResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<AgentAnalysisResponse>> AnalyzeRouteWithAgent(
            [FromBody] IntelligentRouteRequest request,
            CancellationToken cancellationToken)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request?.RouteDescription))
                    return BadRequest(new { error = "Route description is required" });

                var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
                var agentResponse = await _semanticAgentService.ExecuteRouteSafetyAgentAsync(
                    request.RouteDescription,
                    userId,
                    request.EstimatedTime,
                    cancellationToken);

                if (!agentResponse.Success)
                    return StatusCode(StatusCodes.Status500InternalServerError, new { error = agentResponse.Message });

                return Ok(new AgentAnalysisResponse
                {
                    RouteDescription = request.RouteDescription,
                    AgentAnalysis = agentResponse.Message,
                    AgentType = agentResponse.AgentType,
                    ExecutedAt = agentResponse.ExecutedAt
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in intelligent route analysis");
                return StatusCode(StatusCodes.Status500InternalServerError, new { error = ex.Message });
            }
        }

        /// <summary>
        /// Get personalized safety recommendations using intelligent agent.
        /// </summary>
        [HttpPost("agent/personalized-recommendations")]
        [ProducesResponseType(typeof(PersonalizedRecommendationsResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<PersonalizedRecommendationsResponse>> GetPersonalizedRecommendations(
            [FromBody] PersonalizedRecommendationsRequest request,
            CancellationToken cancellationToken)
        {
            try
            {
                var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
                if (string.IsNullOrEmpty(userId))
                    return Unauthorized(new { error = "User not authenticated" });

                var agentResponse = await _semanticAgentService.ExecutePersonalizedRecommendationsAgentAsync(
                    userId,
                    request?.Context,
                    cancellationToken);

                if (!agentResponse.Success)
                    return StatusCode(StatusCodes.Status500InternalServerError, new { error = agentResponse.Message });

                return Ok(new PersonalizedRecommendationsResponse
                {
                    UserId = userId,
                    Recommendations = agentResponse.Message,
                    AgentType = agentResponse.AgentType,
                    GeneratedAt = agentResponse.ExecutedAt
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in personalized recommendations");
                return StatusCode(StatusCodes.Status500InternalServerError, new { error = ex.Message });
            }
        }

        /// <summary>
        /// Analyze incident patterns in a specific zone using intelligent agent.
        /// </summary>
        [HttpPost("agent/analyze-incidents")]
        [ProducesResponseType(typeof(IncidentAnalysisResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<IncidentAnalysisResponse>> AnalyzeIncidents(
            [FromBody] IncidentAnalysisRequest request,
            CancellationToken cancellationToken)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request?.Zone))
                    return BadRequest(new { error = "Zone is required" });

                var agentResponse = await _semanticAgentService.ExecuteIncidentAnalysisAgentAsync(
                    request.Zone,
                    request.DayRange ?? 30,
                    cancellationToken);

                if (!agentResponse.Success)
                    return StatusCode(StatusCodes.Status500InternalServerError, new { error = agentResponse.Message });

                return Ok(new IncidentAnalysisResponse
                {
                    Zone = request.Zone,
                    Analysis = agentResponse.Message,
                    AgentType = agentResponse.AgentType,
                    AnalyzedAt = agentResponse.ExecutedAt,
                    DayRange = request.DayRange ?? 30
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in incident analysis");
                return StatusCode(StatusCodes.Status500InternalServerError, new { error = ex.Message });
            }
        }

        /// <summary>
        /// Health check for LLM and Agent services.
        /// </summary>
        [HttpGet("health")]
        [AllowAnonymous]
        public IActionResult Health()
        {
            return Ok(new
            {
                status = "healthy",
                service = "SemanticKernel + OpenAI + Intelligent Agents",
                version = "1.27.0",
                features = new[] { "TextGeneration", "Chat", "Agents", "RouteSafetyAnalysis", "PersonalizedRecommendations" }
            });
        }

        /// <summary>
        /// Get agent capabilities and available functions.
        /// </summary>
        [HttpGet("agent/capabilities")]
        [AllowAnonymous]
        public IActionResult GetAgentCapabilities()
        {
            return Ok(new
            {
                agents = new[]
                {
                    new {
                        name = "RouteSafetyAgent",
                        description = "Analiza seguridad de rutas y proporciona recomendaciones",
                        endpoint = "/api/ai/agent/analyze-route-intelligent"
                    },
                    new {
                        name = "PersonalizedRecommendationsAgent",
                        description = "Genera recomendaciones personalizadas basadas en perfil del usuario",
                        endpoint = "/api/ai/agent/personalized-recommendations"
                    },
                    new {
                        name = "IncidentAnalysisAgent",
                        description = "Analiza patrones de incidentes en zonas específicas",
                        endpoint = "/api/ai/agent/analyze-incidents"
                    }
                },
                availableFunctions = new[] {
                    "RouteSafety.evaluate_route_safety",
                    "RouteSafety.get_route_incident_statistics",
                    "RouteSafety.get_alternative_routes",
                    "Recommendations.get_user_safety_profile",
                    "Recommendations.get_personalized_recommendations",
                    "Recommendations.check_emergency_contacts"
                }
            });
        }
    }

    // Request DTOs
    public class GenerateTextRequest
    {
        public string? Prompt { get; set; }
        public int? MaxTokens { get; set; }
    }

    public class ChatRequest
    {
        public string? Message { get; set; }
    }

    public class RouteSafetyRequest
    {
        public string? RouteDescription { get; set; }
        public string? IncidentData { get; set; }
    }

    public class SummarizeRequest
    {
        public string? Text { get; set; }
    }

    public class IntelligentRouteRequest
    {
        public string? RouteDescription { get; set; }
        public string? EstimatedTime { get; set; }
    }

    public class PersonalizedRecommendationsRequest
    {
        public string? Context { get; set; }
    }

    public class IncidentAnalysisRequest
    {
        public string? Zone { get; set; }
        public int? DayRange { get; set; }
    }

    // Response DTOs
    public class GenerateTextResponse
    {
        public string? Prompt { get; set; }
        public string? GeneratedText { get; set; }
    }

    public class ChatCompletionResponse
    {
        public string? Message { get; set; }
        public string? Response { get; set; }
    }

    public class RouteSafetyAnalysisResponse
    {
        public string? RouteDescription { get; set; }
        public string? Analysis { get; set; }
        public DateTime AnalyzedAt { get; set; }
    }

    public class SummaryResponse
    {
        public string? OriginalText { get; set; }
        public string? Summary { get; set; }
    }

    public class AgentAnalysisResponse
    {
        public string? RouteDescription { get; set; }
        public string? AgentAnalysis { get; set; }
        public string? AgentType { get; set; }
        public DateTime ExecutedAt { get; set; }
    }

    public class PersonalizedRecommendationsResponse
    {
        public string? UserId { get; set; }
        public string? Recommendations { get; set; }
        public string? AgentType { get; set; }
        public DateTime GeneratedAt { get; set; }
    }

    public class IncidentAnalysisResponse
    {
        public string? Zone { get; set; }
        public string? Analysis { get; set; }
        public string? AgentType { get; set; }
        public DateTime AnalyzedAt { get; set; }
        public int DayRange { get; set; }
    }
}

