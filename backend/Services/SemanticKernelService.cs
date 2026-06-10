using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.ChatCompletion;

namespace RutaSegura.Services
{
    /// <summary>
    /// Service for managing Semantic Kernel operations and LLM interactions.
    /// Provides methods for text generation, chat, and semantic operations.
    /// </summary>
    public class SemanticKernelService
    {
        private readonly Kernel _kernel;
        private readonly ILogger<SemanticKernelService> _logger;

        public SemanticKernelService(Kernel kernel, ILogger<SemanticKernelService> logger)
        {
            _kernel = kernel ?? throw new ArgumentNullException(nameof(kernel));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        /// <summary>
        /// Generate text using the OpenAI model with the provided prompt.
        /// </summary>
        public async Task<string> GenerateTextAsync(string prompt, int maxTokens = 500, CancellationToken cancellationToken = default)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(prompt))
                    throw new ArgumentException("Prompt cannot be empty", nameof(prompt));

                var textContent = await _kernel.InvokePromptAsync(prompt, new KernelArguments { { "max_tokens", maxTokens } }, cancellationToken: cancellationToken);
                var result = textContent.ToString();

                _logger.LogInformation("Text generation completed. Prompt length: {PromptLength}, Response length: {ResponseLength}", 
                    prompt.Length, result?.Length ?? 0);

                return result ?? string.Empty;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error generating text. Prompt: {Prompt}", prompt);
                throw;
            }
        }

        /// <summary>
        /// Analyze route safety using LLM based on route description and incident data.
        /// </summary>
        public async Task<string> AnalyzeRouteSafetyAsync(string routeDescription, string? incidentData = null, CancellationToken cancellationToken = default)
        {
            try
            {
                var prompt = $"""
                    Analyze the following route for safety concerns and provide recommendations.
                    
                    Route Description:
                    {routeDescription}
                    
                    {(string.IsNullOrEmpty(incidentData) ? "" : $"Incident Data:\n{incidentData}\n")}
                    
                    Provide a safety assessment with risk level (LOW/MEDIUM/HIGH) and actionable recommendations in Spanish.
                    """;

                var result = await GenerateTextAsync(prompt, maxTokens: 800, cancellationToken);
                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error analyzing route safety");
                throw;
            }
        }

        /// <summary>
        /// Get a chat completion for a given user message (stateless).
        /// </summary>
        public async Task<string> GetChatCompletionAsync(string userMessage, CancellationToken cancellationToken = default)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(userMessage))
                    throw new ArgumentException("User message cannot be empty", nameof(userMessage));

                var chatCompletionService = _kernel.GetRequiredService<IChatCompletionService>();
                var chatHistory = new ChatHistory();
                chatHistory.AddUserMessage(userMessage);

                var response = await chatCompletionService.GetChatMessageContentAsync(chatHistory, cancellationToken: cancellationToken);
                var result = response.Content ?? string.Empty;

                _logger.LogInformation("Chat completion processed. User message length: {MessageLength}, Response length: {ResponseLength}", 
                    userMessage.Length, result.Length);

                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting chat completion. Message: {Message}", userMessage);
                throw;
            }
        }

        /// <summary>
        /// Summarize a long text using the LLM.
        /// </summary>
        public async Task<string> SummarizeTextAsync(string text, CancellationToken cancellationToken = default)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(text))
                    throw new ArgumentException("Text cannot be empty", nameof(text));

                var prompt = $"""
                    Please provide a concise summary of the following text in Spanish.
                    Keep it to 2-3 sentences maximum.
                    
                    Text:
                    {text}
                    
                    Summary:
                    """;

                var result = await GenerateTextAsync(prompt, maxTokens: 300, cancellationToken);
                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error summarizing text");
                throw;
            }
        }
    }
}
