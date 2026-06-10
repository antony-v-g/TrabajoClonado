using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RutaSegura.Services;

namespace RutaSegura.Controllers
{
    /// <summary>
    /// API endpoints for LLM and AI operations using Semantic Kernel.
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class AiController : ControllerBase
    {
        private readonly SemanticKernelService _semanticKernelService;
        private readonly ILogger<AiController> _logger;

        public AiController(SemanticKernelService semanticKernelService, ILogger<AiController> logger)
        {
            _semanticKernelService = semanticKernelService ?? throw new ArgumentNullException(nameof(semanticKernelService));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        /// <summary>
        /// Generate text from a prompt using OpenAI.
        /// </summary>
        /// <param name="request">Request containing prompt and optional max tokens</param>
        /// <returns>Generated text</returns>
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
        /// <param name="request">Request containing user message</param>
        /// <returns>Chat completion response</returns>
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
        /// <param name="request">Request containing route description and optional incident data</param>
        /// <returns>Safety analysis result</returns>
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
        /// <param name="request">Request containing text to summarize</param>
        /// <returns>Summary result</returns>
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
        /// Health check for LLM service.
        /// </summary>
        [HttpGet("health")]
        [AllowAnonymous]
        public IActionResult Health()
        {
            return Ok(new { status = "healthy", service = "SemanticKernel + OpenAI" });
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
}
