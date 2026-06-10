using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.ChatCompletion;
using System.ComponentModel;

namespace RutaSegura.Services
{
    /// <summary>
    /// Service para manejar interacciones con LLM usando Semantic Kernel
    /// </summary>
    public class LLMService
    {
        private readonly Kernel _kernel;
        private readonly IChatCompletionService _chatService;
        private readonly ILogger<LLMService> _logger;

        public LLMService(Kernel kernel, ILoggerFactory loggerFactory)
        {
            _kernel = kernel;
            _chatService = kernel.GetRequiredService<IChatCompletionService>();
            _logger = loggerFactory.CreateLogger<LLMService>();
        }

        /// <summary>
        /// Obtiene una respuesta del LLM para un mensaje dado
        /// </summary>
        public async Task<string> GetCompletionAsync(string userMessage, string? systemPrompt = null)
        {
            try
            {
                _logger.LogInformation($"Procesando mensaje LLM: {userMessage}");

                var chatHistory = new ChatHistory();
                
                if (!string.IsNullOrEmpty(systemPrompt))
                {
                    chatHistory.AddSystemMessage(systemPrompt);
                }

                chatHistory.AddUserMessage(userMessage);

                var response = await _chatService.GetChatMessageContentAsync(
                    chatHistory,
                    new PromptExecutionSettings()
                );

                var result = response.Content ?? string.Empty;
                _logger.LogInformation($"Respuesta LLM generada exitosamente");
                
                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError($"Error en LLM Service: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// Obtiene una respuesta con historial de conversación
        /// </summary>
        public async Task<string> GetChatCompletionAsync(List<(string role, string content)> messages)
        {
            try
            {
                _logger.LogInformation($"Procesando chat con {messages.Count} mensajes");

                var chatHistory = new ChatHistory();

                foreach (var (role, content) in messages)
                {
                    if (role.ToLower() == "system")
                        chatHistory.AddSystemMessage(content);
                    else if (role.ToLower() == "assistant")
                        chatHistory.AddAssistantMessage(content);
                    else
                        chatHistory.AddUserMessage(content);
                }

                var response = await _chatService.GetChatMessageContentAsync(chatHistory);
                return response.Content ?? string.Empty;
            }
            catch (Exception ex)
            {
                _logger.LogError($"Error en Chat Completion: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// Invoca una función semántica compilada
        /// </summary>
        public async Task<string> InvokeFunctionAsync(string functionName, Dictionary<string, object> arguments)
        {
            try
            {
                _logger.LogInformation($"Invocando función: {functionName}");

                var function = _kernel.Plugins.GetFunction("DefaultPlugin", functionName);
                if (function == null)
                    throw new InvalidOperationException($"Función {functionName} no encontrada");

                var result = await _kernel.InvokeAsync(function, new KernelArguments(arguments));
                return result.ToString() ?? string.Empty;
            }
            catch (Exception ex)
            {
                _logger.LogError($"Error invocando función: {ex.Message}");
                throw;
            }
        }
    }
}
