using Microsoft.ML;
using Microsoft.ML.Data;
using RutaSegura.ML;

namespace RutaSegura.Services;

/// <summary>
/// Carga datasets CSV compatibles con ML.NET Model Builder (Data Classification / Recommendation).
/// </summary>
public class MlCsvDatasetLoader
{
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<MlCsvDatasetLoader> _logger;

    public MlCsvDatasetLoader(IWebHostEnvironment env, ILogger<MlCsvDatasetLoader> logger)
    {
        _env = env;
        _logger = logger;
    }

    public bool ZoneCsvExists => File.Exists(MlModelPaths.ZoneCsvPath(_env.ContentRootPath));

    public bool RoutesCsvExists => File.Exists(MlModelPaths.RoutesCsvPath(_env.ContentRootPath));

    public IReadOnlyList<ZoneSafetyTrainingRow> LoadZoneRows()
    {
        var path = MlModelPaths.ZoneCsvPath(_env.ContentRootPath);
        if (!File.Exists(path))
            return Array.Empty<ZoneSafetyTrainingRow>();

        var ml = new MLContext(seed: 42);
        var data = ml.Data.LoadFromTextFile<ZoneSafetyCsvRow>(
            path,
            separatorChar: ',',
            hasHeader: true);

        var rows = ml.Data.CreateEnumerable<ZoneSafetyCsvRow>(data, reuseRowObject: false)
            .Select(r => new ZoneSafetyTrainingRow
            {
                Label = ZoneSafetyPresentation.Normalize(r.Label),
                CantidadReportes = Clamp01(r.CantidadReportes),
                Hora = Math.Clamp(r.Hora, 0f, 23.99f),
                Iluminacion = Clamp01(r.Iluminacion),
                Trafico = Clamp01(r.Trafico),
                IncidentesRecientes = Clamp01(r.IncidentesRecientes),
                CondicionClima = Clamp01(r.CondicionClima),
            })
            .ToList();

        _logger.LogInformation("CSV zona: {Count} filas desde {Path}", rows.Count, path);
        return rows;
    }

    public IReadOnlyList<RouteInteractionRow> LoadRouteRows()
    {
        var path = MlModelPaths.RoutesCsvPath(_env.ContentRootPath);
        if (!File.Exists(path))
            return Array.Empty<RouteInteractionRow>();

        var ml = new MLContext(seed: 42);
        var data = ml.Data.LoadFromTextFile<RouteRecommendationCsvRow>(
            path,
            separatorChar: ',',
            hasHeader: true);

        var rows = ml.Data.CreateEnumerable<RouteRecommendationCsvRow>(data, reuseRowObject: false)
            .Select(r => new RouteInteractionRow
            {
                UserKey = (uint)Math.Clamp((int)r.UserId, 1, 999),
                RouteProfileKey = (uint)Math.Clamp((int)r.RouteId, 1, 5000),
                Label = Math.Clamp(r.Label, 1f, 5f),
            })
            .ToList();

        _logger.LogInformation("CSV rutas: {Count} filas desde {Path}", rows.Count, path);
        return rows;
    }

    private static float Clamp01(float v) => Math.Clamp(v, 0f, 1f);

    private sealed class ZoneSafetyCsvRow
    {
        [LoadColumn(0)]
        public string Label { get; set; } = string.Empty;

        [LoadColumn(1)]
        public float CantidadReportes { get; set; }

        [LoadColumn(2)]
        public float Hora { get; set; }

        [LoadColumn(3)]
        public float Iluminacion { get; set; }

        [LoadColumn(4)]
        public float Trafico { get; set; }

        [LoadColumn(5)]
        public float IncidentesRecientes { get; set; }

        [LoadColumn(6)]
        public float CondicionClima { get; set; }
    }

    private sealed class RouteRecommendationCsvRow
    {
        [LoadColumn(0)]
        public float UserId { get; set; }

        [LoadColumn(1)]
        public float RouteId { get; set; }

        [LoadColumn(2)]
        public float Label { get; set; }
    }
}
