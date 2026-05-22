using Microsoft.EntityFrameworkCore;
using RutaSegura.Data;
using RutaSegura.Models;

namespace RutaSegura.Services;

public class DashboardAlertasService
{
    private readonly ApplicationDbContext _db;
    private readonly RedisService _redis;
    private readonly MlNetService _ml;
    private readonly SistemaConfigService _config;
    private readonly ILogger<DashboardAlertasService> _logger;

    public DashboardAlertasService(
        ApplicationDbContext db,
        RedisService redis,
        MlNetService ml,
        SistemaConfigService config,
        ILogger<DashboardAlertasService> logger)
    {
        _db = db;
        _redis = redis;
        _ml = ml;
        _config = config;
        _logger = logger;
    }

    public async Task<AlertasRecientesResponse> GetRecientesAsync(
        int take = 8,
        int maxDays = 30,
        CancellationToken ct = default)
    {
        var n = Math.Clamp(take, 1, 20);
        var days = Math.Clamp(maxDays, 1, 365);
        var cacheKey = $"alertas:recientes:v6:{n}:{days}";

        if (_redis.IsEnabled)
        {
            var cached = await _redis.GetStringAsync(cacheKey);
            if (cached != null)
            {
                var parsed = ApiJson.Deserialize<AlertasRecientesResponse>(cached);
                if (parsed != null)
                    return parsed with { ServidoDesdeCache = true };
            }
        }

        await _ml.EnsureModelsAsync(ct);
        var cfg = await _config.GetAsync(ct);

        var from = DateTime.UtcNow.AddDays(-days);
        var reportes = await _db.Reportes
            .AsNoTracking()
            .Where(r => r.FechaReporte >= from && r.Estado != "Rechazado")
            .OrderByDescending(r => r.FechaReporte)
            .Take(n * 4)
            .ToListAsync(ct);

        var conteoPorZona = reportes
            .GroupBy(r => NormalizarZona(r.Ubicacion))
            .ToDictionary(g => g.Key, g => g.Count());

        var ordenados = reportes
            .OrderBy(r => SistemaConfigService.EsReporteMenor(r.FechaReporte, cfg.CaducidadReporteMenorHoras))
            .ThenByDescending(r => r.FechaReporte)
            .Take(n)
            .ToList();

        var alertas = new List<AlertaRecienteDto>();
        foreach (var r in ordenados)
        {
            var esMenor = SistemaConfigService.EsReporteMenor(
                r.FechaReporte,
                cfg.CaducidadReporteMenorHoras);
            var zona = NormalizarZona(r.Ubicacion);
            var cantidad = conteoPorZona.TryGetValue(zona, out var c) ? c : 1;
            var enZona = reportes.Where(x => NormalizarZona(x.Ubicacion) == zona).ToList();
            var baseFeatures = ZoneFeatureBuilder.FromReporte(r, cantidad);
            var features = SistemaConfigService.AplicarPesoZonasOscuras(
                baseFeatures,
                cfg.PesoZonasOscurasPct,
                SistemaConfigService.ContarZonaOscuraEnLista(enZona));
            var ml = _ml.ClassifyZoneSafety(
                features.CantidadReportes,
                features.Trafico,
                features.Iluminacion,
                features.Hora);
            var display = ZoneSafetyPresentation.ToDisplay(ml.Nivel, ml.ConfianzaPct);
            var etiqueta = esMenor
                ? $"{display.Etiqueta} · Reciente"
                : display.Etiqueta;

            alertas.Add(
                new AlertaRecienteDto(
                    r.Id,
                    $"{r.TipoIncidente}: {Truncar(r.Ubicacion, 80)}",
                    string.IsNullOrWhiteSpace(r.Descripcion)
                        ? r.Ubicacion
                        : r.Descripcion!,
                    r.Ubicacion,
                    r.TipoIncidente ?? "Otro",
                    r.FechaReporte,
                    display.Nivel,
                    display.IndicadorVisual,
                    etiqueta,
                    display.ConfianzaMlPct,
                    "ML.NET",
                    esMenor));
        }

        var response = new AlertasRecientesResponse(
            alertas,
            alertas.Count,
            _redis.IsEnabled,
            false,
            DateTime.UtcNow);

        if (_redis.IsEnabled)
        {
            await _redis.SetStringAsync(
                cacheKey,
                ApiJson.Serialize(response),
                TimeSpan.FromMinutes(3));
        }

        return response;
    }

    public static async Task InvalidateAlertasCacheAsync(RedisService redis)
    {
        if (!redis.IsEnabled) return;
        for (var take = 1; take <= 20; take++)
        {
            foreach (var days in new[] { 7, 14, 30, 60, 365 })
                await redis.RemoveAsync($"alertas:recientes:v6:{take}:{days}");
        }
    }

    private static string NormalizarZona(string? ubicacion)
    {
        if (string.IsNullOrWhiteSpace(ubicacion)) return "desconocida";
        return ubicacion.Trim().ToLowerInvariant();
    }

    private static string Truncar(string s, int max)
    {
        var t = s.Trim();
        return t.Length <= max ? t : $"{t[..(max - 1)].TrimEnd()}…";
    }
}

public static class ZoneFeatureBuilder
{
    public static ZoneFeatures FromReporte(Reporte r, int cantidadEnZona)
    {
        var tipo = (r.TipoIncidente ?? "Otro").ToLowerInvariant();
        var hora = r.FechaReporte.Hour + r.FechaReporte.Minute / 60f;
        var trafico = tipo.Contains("accidente")
            ? 0.88f
            : hora is >= 7 and <= 9 or >= 17 and <= 20
                ? 0.72f
                : 0.38f;
        var iluminacion = tipo.Contains("zona") && tipo.Contains("oscur")
            ? 0.12f
            : tipo.Contains("robo") || tipo.Contains("asalto")
                ? hora >= 19 || hora < 6 ? 0.22f : 0.45f
                : 0.68f;
        var cantidad = Math.Clamp(cantidadEnZona / 5f, 0.15f, 1f);
        return new ZoneFeatures(cantidad, trafico, iluminacion, hora);
    }
}

public record ZoneFeatures(
    float CantidadReportes,
    float Trafico,
    float Iluminacion,
    float Hora);

public record AlertaRecienteDto(
    int Id,
    string Titulo,
    string Descripcion,
    string Ubicacion,
    string TipoIncidente,
    DateTime FechaReporte,
    string NivelSeguridad,
    string IndicadorVisual,
    string EtiquetaSeguridad,
    double? ConfianzaMlPct,
    string FuenteMl,
    bool EsReporteMenor);

public record AlertasRecientesResponse(
    IReadOnlyList<AlertaRecienteDto> Alertas,
    int Total,
    bool CacheRedisActivo,
    bool ServidoDesdeCache,
    DateTime GeneradoEnUtc);
