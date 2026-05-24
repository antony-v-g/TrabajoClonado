namespace RutaSegura.Services;

/// <summary>Revisa predicciones cada 15 min y genera alertas + push si aplica.</summary>
public class AlertasInteligentesBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<AlertasInteligentesBackgroundService> _logger;

    public AlertasInteligentesBackgroundService(
        IServiceScopeFactory scopes,
        ILogger<AlertasInteligentesBackgroundService> logger)
    {
        _scopes = scopes;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromSeconds(45), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopes.CreateScope();
                var svc = scope.ServiceProvider.GetRequiredService<AlertasInteligentesService>();
                var n = await svc.GenerarDesdePrediccionesAsync(stoppingToken);
                if (n > 0)
                    _logger.LogInformation("Alertas inteligentes automáticas: {Count} nueva(s)", n);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Ciclo de alertas inteligentes falló");
            }

            await Task.Delay(TimeSpan.FromMinutes(15), stoppingToken);
        }
    }
}
