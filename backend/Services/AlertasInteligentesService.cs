using Microsoft.EntityFrameworkCore;
using RutaSegura.Data;
using RutaSegura.Models;

namespace RutaSegura.Services;

/// <summary>
/// Alertas automáticas: detecta zonas activas, SOS y dispara push (FCM/webhook) + Redis.
/// </summary>
public class AlertasInteligentesService
{
    private readonly ApplicationDbContext _db;
    private readonly RedisService _redis;
    private readonly MlNetService _ml;
    private readonly SistemaConfigService _config;
    private readonly AdminPredictivoService _predictivo;
    private readonly PushNotificationService _push;
    private readonly ILogger<AlertasInteligentesService> _logger;

    public AlertasInteligentesService(
        ApplicationDbContext db,
        RedisService redis,
        MlNetService ml,
        SistemaConfigService config,
        AdminPredictivoService predictivo,
        PushNotificationService push,
        ILogger<AlertasInteligentesService> logger)
    {
        _db = db;
        _redis = redis;
        _ml = ml;
        _config = config;
        _predictivo = predictivo;
        _push = push;
        _logger = logger;
    }

    /// <summary>Tras un reporte nuevo: alerta si la zona supera umbral de actividad.</summary>
    public async Task<int> EvaluarTrasReporteAsync(string ubicacion, CancellationToken ct = default)
    {
        var norm = ubicacion.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(norm)) return 0;

        var desde = DateTime.UtcNow.AddDays(-7);
        var cnt = await _db.Reportes.CountAsync(
            r => r.Ubicacion.ToLower() == norm && r.FechaReporte >= desde && r.Estado != "Rechazado",
            ct);

        if (cnt < 3) return 0;

        var cacheKey = $"alertas:auto-zona:v1:{norm}:{cnt}";
        if (_redis.IsEnabled && await _redis.GetStringAsync(cacheKey) != null)
            return 0;

        var predicciones = await _predictivo.GetPrediccionesAsync(8, ct);
        var match = predicciones.FirstOrDefault(p =>
            p.Ubicacion.Trim().Equals(ubicacion.Trim(), StringComparison.OrdinalIgnoreCase)
            || p.Ubicacion.Trim().ToLowerInvariant() == norm);

        var mensaje = match?.MensajePredictivo
            ?? AdminPredictivoService.ConstruirMensaje(ubicacion, cnt, 0, 100, "Varios", "Moderada");

        var creadas = await CrearAlertaConPushAsync(
            $"🔴 Zona activa: {Truncar(ubicacion, 70)}",
            mensaje,
            ubicacion,
            Math.Min(60 + cnt * 8, 95),
            "Auto+ML",
            ct);

        if (_redis.IsEnabled)
            await _redis.SetStringAsync(cacheKey, "1", TimeSpan.FromHours(6));

        return creadas;
    }

    /// <summary>Job periódico: genera alertas desde predicciones que requieren atención.</summary>
    public async Task<int> GenerarDesdePrediccionesAsync(CancellationToken ct = default)
    {
        var predicciones = await _predictivo.GetPrediccionesAsync(6, ct);
        var cfg = await _config.GetAsync(ct);
        var creadas = 0;

        foreach (var p in predicciones.Where(x => x.RequiereAlerta))
        {
            var dupKey = $"alertas:pred:v1:{p.Ubicacion.Trim().ToLowerInvariant()}:{DateTime.UtcNow:yyyyMMdd}";
            if (_redis.IsEnabled && await _redis.GetStringAsync(dupKey) != null)
                continue;

            var prioridad = SistemaConfigService.PrioridadDesdeRiesgoPct(
                p.RiesgoPredichoPct,
                cfg.UmbralRiesgoAlertaAltaPct,
                cfg.UmbralRiesgoAlertaMediaPct);

            var n = await CrearAlertaConPushAsync(
                p.MensajePredictivo.StartsWith('⚠') ? p.MensajePredictivo : $"⚠️ {p.MensajePredictivo}",
                $"ML.NET · {p.EtiquetaZona} · {p.Reportes7d} reporte(s) (7d) · tipo: {p.TipoIncidenteDominante}. "
                + $"Confianza zona {p.ConfianzaMlPct:0.#}%.",
                p.Ubicacion,
                p.RiesgoPredichoPct,
                "Auto+ML",
                ct);

            if (n > 0)
            {
                creadas += n;
                if (_redis.IsEnabled)
                    await _redis.SetStringAsync(dupKey, "1", TimeSpan.FromHours(12));
            }
        }

        return creadas;
    }

    public async Task<int> CrearAlertaConPushAsync(
        string titulo,
        string detalle,
        string? ubicacionRef,
        int riesgoPct,
        string origen,
        CancellationToken ct)
    {
        var cfg = await _config.GetAsync(ct);
        var alerta = new AlertaSistema
        {
            Titulo = titulo,
            Detalle = detalle,
            Prioridad = SistemaConfigService.PrioridadDesdeRiesgoPct(
                riesgoPct,
                cfg.UmbralRiesgoAlertaAltaPct,
                cfg.UmbralRiesgoAlertaMediaPct),
            Origen = origen,
            UbicacionRef = ubicacionRef,
            RiesgoEstimadoPct = riesgoPct,
            CreadaEn = DateTime.UtcNow,
        };

        _db.AlertasSistema.Add(alerta);
        await _db.SaveChangesAsync(ct);

        await DashboardAlertasService.InvalidateAlertasCacheAsync(_redis);
        await AdminCacheKeys.InvalidateAllAsync(_redis);
        if (_redis.IsEnabled)
            await _redis.RemoveAsync("admin:predicciones:v1:6");

        var push = await _push.EnviarAlertaAsync(titulo, detalle, cfg.PushNotificacionUrl, ct);
        _logger.LogInformation(
            "Alerta {Id} creada. Push: {Canal} {Ok}",
            alerta.Id,
            push.Canal,
            push.Enviado);

        return 1;
    }

    private static string Truncar(string s, int max)
    {
        var t = s.Trim();
        return t.Length <= max ? t : $"{t[..(max - 1)].TrimEnd()}…";
    }
}
