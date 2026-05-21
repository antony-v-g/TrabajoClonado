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
    private MLContext? _ml;
    private string[] _incidentLabels = ["Robo", "Asalto", "Accidente", "ZonaOscura", "Otro"];

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

    public async Task EnsureModelsAsync(CancellationToken ct = default)
    {
        if (!ClassifierReady || !RecommenderReady)
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            await _trainer.TrainAllAsync(db, ct);
        }

        ReloadEngines();
    }

    public void ReloadEngines()
    {
        lock (_lock)
        {
            _ml = new MLContext();
            _classifier?.Dispose();
            _recommender?.Dispose();
            _classifier = null;
            _recommender = null;

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
        }
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
            var stars = Math.Clamp(pred.Score, 1f, 5f);
            list.Add(
                new RouteRecommendationResult(
                    id,
                    nombre,
                    modo,
                    Math.Round(stars, 2),
                    Math.Round(stars / 5f * 100, 0)));
        }

        return list.OrderByDescending(r => r.PreferenceScore).ToList();
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
            _trainer.ClassifierPath,
            _trainer.RecommenderPath,
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
    string RutaClasificador,
    string RutaRecomendador,
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
