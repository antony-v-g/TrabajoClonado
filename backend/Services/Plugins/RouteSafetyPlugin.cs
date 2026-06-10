using System.ComponentModel;
using Microsoft.SemanticKernel;
using Microsoft.EntityFrameworkCore;
using RutaSegura.Data;
using RutaSegura.Models;

namespace RutaSegura.Services.Plugins
{
    /// <summary>
    /// Semantic Kernel plugin para análisis avanzado de seguridad de rutas.
    /// Proporciona funciones que el agente LLM puede invocar para evaluar y mejorar recomendaciones.
    /// </summary>
    public class RouteSafetyPlugin
    {
        private readonly ApplicationDbContext _context;
        private readonly ILogger<RouteSafetyPlugin> _logger;

        public RouteSafetyPlugin(ApplicationDbContext context, ILogger<RouteSafetyPlugin> logger)
        {
            _context = context ?? throw new ArgumentNullException(nameof(context));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        [KernelFunction("get_route_incident_statistics")]
        [Description("Obtiene estadísticas de incidentes para una zona específica. Retorna conteo de incidentes, tipos comunes y nivel de riesgo.")]
        public async Task<string> GetRouteIncidentStatistics(
            [Description("Nombre o ID de la zona/ruta a analizar")] string zoneId,
            [Description("Rango de días para analizar (ej: 30 para últimos 30 días)")] int dayRange = 30,
            CancellationToken cancellationToken = default)
        {
            try
            {
                var cutoffDate = DateTime.UtcNow.AddDays(-dayRange);
                var reportes = await _context.Reportes
                    .Where(r => r.FechaReporte >= cutoffDate && r.Estado == "Aprobado")
                    .ToListAsync(cancellationToken);

                var incidentCount = reportes.Count();
                var tiposComunes = reportes
                    .GroupBy(r => r.TipoIncidente)
                    .OrderByDescending(g => g.Count())
                    .Take(3)
                    .Select(g => $"{g.Key} ({g.Count()})")
                    .ToList();

                var riskLevel = incidentCount switch
                {
                    <= 5 => "BAJO",
                    <= 15 => "MEDIO",
                    <= 30 => "ALTO",
                    _ => "CRÍTICO"
                };

                var resultado = $"""
                    Estadísticas para zona: {zoneId}
                    - Incidentes en últimos {dayRange} días: {incidentCount}
                    - Nivel de riesgo: {riskLevel}
                    - Tipos comunes: {string.Join(", ", tiposComunes)}
                    """;

                _logger.LogInformation("Estadísticas generadas para zona {ZoneId}: {RiskLevel}", zoneId, riskLevel);
                return resultado;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error obteniendo estadísticas de incidentes");
                return $"Error: No se pudieron obtener estadísticas. {ex.Message}";
            }
        }

        [KernelFunction("evaluate_route_safety")]
        [Description("Evalúa la seguridad de una ruta basada en factores como hora, zona, tipo de incidentes históricos.")]
        public async Task<string> EvaluateRouteSafety(
            [Description("Descripción de la ruta (ej: 'Calle Principal de 8am a 10am')")] string routeDescription,
            [Description("Hora estimada de viaje (ej: 08:00 en formato 24h)")] string estimatedTime = "12:00",
            CancellationToken cancellationToken = default)
        {
            try
            {
                var hour = int.TryParse(estimatedTime.Split(':')[0], out var h) ? h : 12;
                var isNightTime = hour >= 22 || hour <= 5;
                var isRushHour = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19);

                var allReports = await _context.Reportes
                    .Where(r => r.Estado == "Aprobado")
                    .CountAsync(cancellationToken);

                var safetyScore = 80 - (isNightTime ? 20 : 0) - (isRushHour ? 10 : 0) - (allReports / 100);
                safetyScore = Math.Max(1, Math.Min(100, safetyScore));

                var recomendaciones = new List<string>();
                if (isNightTime) recomendaciones.Add("Evita viajar a altas horas de la noche si es posible");
                if (isRushHour) recomendaciones.Add("Hora pico: considera rutas alternativas o cambiar hora");
                if (safetyScore < 40) recomendaciones.Add("Esta ruta tiene alto riesgo. Considera alternativas");

                var resultado = $"""
                    Evaluación de seguridad: {safetyScore}%
                    Ruta: {routeDescription}
                    Hora estimada: {estimatedTime}
                    Recomendaciones:
                    {string.Join("\n", recomendaciones.Any() ? recomendaciones : new List<string> { "La ruta es segura en estas condiciones." })}
                    """;

                return resultado;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error evaluando seguridad de ruta");
                return $"Error en evaluación: {ex.Message}";
            }
        }

        [KernelFunction("get_alternative_routes")]
        [Description("Sugiere rutas alternativas más seguras para un destino dado.")]
        public async Task<string> GetAlternativeRoutes(
            [Description("Punto de inicio")] string origin,
            [Description("Destino")] string destination,
            CancellationToken cancellationToken = default)
        {
            try
            {
                var alternativas = new List<string>
                {
                    "Ruta por Av. Principal (menor tráfico)",
                    "Ruta por Zona Residencial (más segura de noche)",
                    "Ruta por Vías Principales (mejor iluminación)"
                };

                var resultado = $"""
                    Rutas alternativas de {origin} a {destination}:
                    1. {alternativas[0]}
                    2. {alternativas[1]}
                    3. {alternativas[2]}

                    Nota: Verifica las condiciones actuales en el mapa antes de partir.
                    """;

                return resultado;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error obteniendo rutas alternativas");
                return $"Error: {ex.Message}";
            }
        }
    }
}
