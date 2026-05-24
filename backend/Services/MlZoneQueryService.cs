using System.Text.Json;
using RutaSegura.ML;

namespace RutaSegura.Services;

/// <summary>
/// Clasificación de zona en tiempo real (ML.NET) con caché Redis.
/// </summary>
public class MlZoneQueryService
{
    private readonly MlNetService _ml;
    private readonly RedisService _redis;
    private readonly ILogger<MlZoneQueryService> _logger;

    public MlZoneQueryService(MlNetService ml, RedisService redis, ILogger<MlZoneQueryService> logger)
    {
        _ml = ml;
        _redis = redis;
        _logger = logger;
    }

    public async Task<ZonaClasificacionResponse> ClasificarAsync(
        string zona,
        float cantidadReportes,
        float hora,
        float iluminacion,
        float trafico,
        float incidentesRecientes,
        float condicionClima = 0f,
        CancellationToken ct = default)
    {
        var cacheKey =
            $"ml:zona:v2:{zona.Trim().ToLowerInvariant()}:{cantidadReportes:F2}:{hora:F1}:{iluminacion:F2}:{trafico:F2}:{incidentesRecientes:F2}:{condicionClima:F2}";

        if (_redis.IsEnabled)
        {
            var cached = await _redis.GetStringAsync(cacheKey);
            if (!string.IsNullOrEmpty(cached))
            {
                var parsed = JsonSerializer.Deserialize<ZonaClasificacionResponse>(cached);
                if (parsed is not null)
                {
                    parsed = parsed with { ServidoDesdeCache = true, Motor = "ML.NET (cache Redis)" };
                    return parsed;
                }
            }
        }

        await _ml.EnsureModelsAsync(ct);
        var result = _ml.ClassifyZoneSafety(
            cantidadReportes,
            trafico,
            iluminacion,
            hora,
            incidentesRecientes,
            condicionClima);

        var nivel = result.Nivel;
        if (condicionClima >= 0.25f)
        {
            var impacto = new ClimaImpacto(
                Lluvia: condicionClima >= 0.35f,
                Neblina: false,
                Tormenta: condicionClima >= 0.65f,
                VisibilidadBaja: condicionClima >= 0.45f && (hora >= 18 || hora < 6),
                CondicionClima: condicionClima,
                RiesgoMovilidad: condicionClima >= 0.55f ? "Alto" : "Moderado",
                Emoji: condicionClima >= 0.65f ? "⛈️" : "🌧️",
                Advertencias: Array.Empty<string>(),
                RecomendacionRuta: "");
            nivel = ClimaImpactoAnalyzer.ElevarNivelPorClima(nivel, impacto);
        }

        var display = ZoneSafetyPresentation.ToDisplay(nivel, result.ConfianzaPct);
        var response = new ZonaClasificacionResponse(
            Zona: zona.Trim(),
            Riesgo: ZoneSafetyPresentation.ToRiesgoEtiqueta(nivel),
            Confianza: Math.Round(result.ConfianzaPct / 100.0, 2),
            IndicadorVisual: display.IndicadorVisual,
            Etiqueta: display.Etiqueta,
            Motor: condicionClima >= 0.25f
                ? "ML.NET + WeatherAPI (CondicionClima)"
                : "ML.NET Data Classification (SdcaMaximumEntropy)",
            ServidoDesdeCache: false);

        if (_redis.IsEnabled)
        {
            await _redis.SetStringAsync(
                cacheKey,
                JsonSerializer.Serialize(response),
                TimeSpan.FromMinutes(15));
        }

        return response;
    }
}

public record ZonaClasificacionResponse(
    string Zona,
    string Riesgo,
    double Confianza,
    string IndicadorVisual,
    string Etiqueta,
    string Motor,
    bool ServidoDesdeCache = false);
