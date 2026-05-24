using Microsoft.EntityFrameworkCore;
using Microsoft.ML;
using RutaSegura.Data;
using RutaSegura.ML;

namespace RutaSegura.Services;

public class MlNetService
{
    private readonly MlModelTrainer _trainer;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<MlNetService> _logger;
    private readonly object _lock = new();

    private PredictionEngine<IncidentTrainingRow, IncidentPredictionOutput>? _classifier;
    private PredictionEngine<RouteRecommendationInput, RouteRecommendationOutput>? _recommender;
    private PredictionEngine<ZoneSafetyTrainingRow, ZoneSafetyPredictionOutput>? _zoneSafety;
    private MLContext? _ml;
    private readonly SemaphoreSlim _trainGate = new(1, 1);
    private string[] _incidentLabels = ["Robo", "Asalto", "Accidente", "ZonaOscura", "Vandalismo", "Otro"];
    private string[] _zoneLabels =
    [
        ZoneSafetyPresentation.Segura,
        ZoneSafetyPresentation.Moderada,
        ZoneSafetyPresentation.Peligrosa,
    ];

    public MlNetService(
        MlModelTrainer trainer,
        IServiceScopeFactory scopeFactory,
        ILogger<MlNetService> logger)
    {
        _trainer = trainer;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public bool ClassifierReady => File.Exists(_trainer.ClassifierPath);
    public bool RecommenderReady => File.Exists(_trainer.RecommenderPath);
    public bool ZoneSafetyReady => File.Exists(_trainer.ZoneSafetyPath);

    public async Task EnsureModelsAsync(CancellationToken ct = default)
    {
        if (ClassifierReady && RecommenderReady && ZoneSafetyReady)
        {
            ReloadEngines();
            return;
        }

        await _trainGate.WaitAsync(ct);
        try
        {
            if (!ClassifierReady || !RecommenderReady || !ZoneSafetyReady)
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                await _trainer.TrainAllAsync(db, ct);
            }

            ReloadEngines();
        }
        finally
        {
            _trainGate.Release();
        }
    }

    public void ReloadEngines()
    {
        lock (_lock)
        {
            _ml = new MLContext();
            _classifier?.Dispose();
            _recommender?.Dispose();
            _zoneSafety?.Dispose();
            _classifier = null;
            _recommender = null;
            _zoneSafety = null;

            if (File.Exists(_trainer.ClassifierPath))
            {
                try
                {
                    var model = _ml.Model.Load(_trainer.ClassifierPath, out _);
                    _classifier = _ml.Model.CreatePredictionEngine<IncidentTrainingRow, IncidentPredictionOutput>(
                        model);
                    _logger.LogInformation("Clasificador ML.NET cargado");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "No se pudo cargar el clasificador ML.NET");
                }
            }

            if (File.Exists(_trainer.RecommenderPath))
            {
                try
                {
                    var model = _ml.Model.Load(_trainer.RecommenderPath, out _);
                    _recommender = _ml.Model.CreatePredictionEngine<RouteRecommendationInput, RouteRecommendationOutput>(
                        model);
                    _logger.LogInformation("Recomendador ML.NET cargado");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "No se pudo cargar el recomendador ML.NET");
                }
            }

            if (File.Exists(_trainer.ZoneSafetyPath))
            {
                try
                {
                    var model = _ml.Model.Load(_trainer.ZoneSafetyPath, out _);
                    _zoneSafety = _ml.Model.CreatePredictionEngine<
                        ZoneSafetyTrainingRow,
                        ZoneSafetyPredictionOutput>(model);
                    _logger.LogInformation("Clasificador de seguridad de zona ML.NET cargado");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "No se pudo cargar el clasificador de zona ML.NET");
                }
            }
        }
    }

    public ZoneSafetyResult ClassifyZoneSafety(
        float cantidadReportes,
        float trafico,
        float iluminacion,
        float hora,
        float incidentesRecientes = 0f,
        float condicionClima = 0f)
    {
        var input = new ZoneSafetyTrainingRow
        {
            Label = ZoneSafetyPresentation.Segura,
            CantidadReportes = Math.Clamp(cantidadReportes, 0f, 1f),
            Trafico = Math.Clamp(trafico, 0f, 1f),
            Iluminacion = Math.Clamp(iluminacion, 0f, 1f),
            Hora = Math.Clamp(hora, 0f, 23.99f),
            IncidentesRecientes = Math.Clamp(incidentesRecientes, 0f, 1f),
            CondicionClima = Math.Clamp(condicionClima, 0f, 1f),
        };

        if (_zoneSafety != null)
        {
            var pred = _zoneSafety.Predict(input);
            var scores = BuildZoneScoreMap(pred);
            var nivel = ZoneSafetyPresentation.Normalize(pred.PredictedLabel);
            var conf = scores.TryGetValue(nivel, out var c) ? c * 100.0 : 75.0;
            return new ZoneSafetyResult(nivel, Math.Round(conf, 1));
        }

        return ClassifyZoneSafetyHeuristic(input);
    }

    private ZoneSafetyResult ClassifyZoneSafetyHeuristic(ZoneSafetyTrainingRow input)
    {
        var riesgo =
            input.CantidadReportes * 0.35f
            + input.Trafico * 0.18f
            + (1f - input.Iluminacion) * 0.22f
            + (input.Hora >= 19f || input.Hora < 6f ? 0.10f : 0f)
            + input.IncidentesRecientes * 0.15f
            + input.CondicionClima * 0.12f;
        var nivel = riesgo >= 0.62f
            ? ZoneSafetyPresentation.Peligrosa
            : riesgo >= 0.38f
                ? ZoneSafetyPresentation.Moderada
                : ZoneSafetyPresentation.Segura;
        return new ZoneSafetyResult(nivel, Math.Round(riesgo * 100, 1));
    }

    private Dictionary<string, float> BuildZoneScoreMap(ZoneSafetyPredictionOutput pred)
    {
        var map = new Dictionary<string, float>(StringComparer.OrdinalIgnoreCase);
        if (pred.Score == null || pred.Score.Length == 0)
        {
            map[pred.PredictedLabel] = 0.75f;
            return map;
        }

        for (var i = 0; i < Math.Min(pred.Score.Length, _zoneLabels.Length); i++)
            map[_zoneLabels[i]] = pred.Score[i];

        return map;
    }

    public IncidentClassificationResult? ClassifyIncident(
        string? descripcion,
        string? ubicacion,
        bool hasCoordinates,
        DateTime? when = null)
    {
        if (_classifier == null) return null;

        var dt = when ?? DateTime.UtcNow;
        var descLen = (descripcion ?? "").Length;
        // Label es obligatorio en el esquema del modelo guardado (MapValueToKey); no afecta la predicción real.
        var input = new IncidentTrainingRow
        {
            Label = "Otro",
            HourOfDay = dt.Hour,
            DayOfWeek = (float)dt.DayOfWeek,
            DescriptionLength = Math.Min(descLen, 500),
            HasCoordinates = hasCoordinates ? 1f : 0f,
            UbicacionLength = Math.Min((ubicacion ?? "").Length, 200),
            IsNight = dt.Hour >= 19 || dt.Hour < 6 ? 1f : 0f,
        };

        var pred = _classifier.Predict(input);
        var scores = BuildScoreMap(pred);
        var confidence = scores.TryGetValue(pred.PredictedLabel, out var c) ? c : 0.5f;

        return new IncidentClassificationResult(
            pred.PredictedLabel,
            Math.Round(confidence * 100, 1),
            scores);
    }

    public IReadOnlyList<RouteRecommendationResult> RecommendRouteProfiles(
        int usuarioId,
        string origen,
        string destino)
    {
        if (_recommender == null) return Array.Empty<RouteRecommendationResult>();

        var userKey = (uint)Math.Clamp(usuarioId, 1, 999);
        var variants = new[]
        {
            ("segura", "peaton", "Ruta segura (ML)"),
            ("rapida", "bike", "Ruta rápida (ML)"),
            ("equilibrada", "caminar", "Ruta equilibrada (ML)"),
        };

        var list = new List<RouteRecommendationResult>();
        foreach (var (id, modo, nombre) in variants)
        {
            var key = RouteProfileKeyUtil.FromTexts(origen, destino, modo);
            var pred = _recommender.Predict(
                new RouteRecommendationInput { UserKey = userKey, RouteProfileKey = key });
            var stars = SanitizeRouteScore(pred.Score);
            var preferenceScore = SanitizeJsonNumber(Math.Round(stars, 2));
            var seguridadPct = SanitizeJsonNumber(Math.Round(stars / 5f * 100, 0));
            list.Add(new RouteRecommendationResult(id, nombre, modo, preferenceScore, seguridadPct));
        }

        return list.OrderByDescending(r => r.PreferenceScore).ToList();
    }

    public IReadOnlyList<RouteRecommendationResult> RecommendRouteProfilesConClima(
        int usuarioId,
        string origen,
        string destino,
        ClimaImpacto? impactoDestino)
    {
        var list = RecommendRouteProfiles(usuarioId, origen, destino).ToList();
        if (impactoDestino is null || impactoDestino.CondicionClima < 0.25f)
            return list;

        var safe = list.FirstOrDefault(r => r.VarianteId == "segura");
        var rest = list.Where(r => r.VarianteId != "segura").ToList();
        if (safe is null) return list;

        var boosted = safe with
        {
            PreferenceScore = Math.Min(5, safe.PreferenceScore + 0.6f),
            SeguridadPct = Math.Min(100, safe.SeguridadPct + 12),
            Nombre = "Ruta segura (ML + clima)",
        };
        return new[] { boosted }.Concat(rest).ToList();
    }

    private static float SanitizeRouteScore(float score)
    {
        if (float.IsNaN(score) || float.IsInfinity(score))
            return 3.5f;
        return Math.Clamp(score, 1f, 5f);
    }

    private static double SanitizeJsonNumber(double value)
    {
        if (double.IsNaN(value) || double.IsInfinity(value))
            return 0;
        return value;
    }

    public async Task<MlStatusDto> GetStatusAsync(CancellationToken ct = default)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var reportes = await db.Reportes.CountAsync(ct);
        var rutas = await db.RutasHistorial.CountAsync(ct);

        return new MlStatusDto(
            ClassifierReady,
            RecommenderReady,
            ZoneSafetyReady,
            _trainer.ClassifierPath,
            _trainer.RecommenderPath,
            _trainer.ZoneSafetyPath,
            reportes,
            rutas,
            _incidentLabels);
    }

    public async Task<MlTrainResult> RetrainAsync(CancellationToken ct = default)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var result = await _trainer.TrainAllAsync(db, ct);
        ReloadEngines();
        _logger.LogInformation("Modelos ML.NET reentrenados");
        return result;
    }

    private Dictionary<string, float> BuildScoreMap(IncidentPredictionOutput pred)
    {
        var map = new Dictionary<string, float>(StringComparer.OrdinalIgnoreCase);
        if (pred.Score == null || pred.Score.Length == 0)
        {
            map[pred.PredictedLabel] = 0.75f;
            return map;
        }

        for (var i = 0; i < Math.Min(pred.Score.Length, _incidentLabels.Length); i++)
            map[_incidentLabels[i]] = pred.Score[i];

        return map;
    }
}

public record IncidentClassificationResult(
    string TipoPredicho,
    double ConfianzaPct,
    IReadOnlyDictionary<string, float> ProbabilidadesPorTipo);

public record RouteRecommendationResult(
    string VarianteId,
    string Nombre,
    string ModoSugerido,
    double PreferenceScore,
    double SeguridadPct);

public record MlStatusDto(
    bool ClasificacionLista,
    bool RecomendacionLista,
    bool SeguridadZonaLista,
    string RutaClasificador,
    string RutaRecomendador,
    string RutaSeguridadZona,
    int ReportesEnBd,
    int RutasEnBd,
    string[] TiposIncidente);

public class MlStartupHostedService : IHostedService
{
    private readonly IServiceProvider _sp;

    public MlStartupHostedService(IServiceProvider sp) => _sp = sp;

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var scope = _sp.CreateScope();
            var ml = scope.ServiceProvider.GetRequiredService<MlNetService>();
            await ml.EnsureModelsAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            var log = _sp.GetRequiredService<ILogger<MlStartupHostedService>>();
            log.LogWarning(ex, "Error al preparar modelos ML.NET al inicio.");
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
