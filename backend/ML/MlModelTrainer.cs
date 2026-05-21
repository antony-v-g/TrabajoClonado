using Microsoft.EntityFrameworkCore;
using Microsoft.ML;
using Microsoft.ML.Data;
using Microsoft.ML.Trainers;
using RutaSegura.Data;
using RutaSegura.Models;

namespace RutaSegura.ML;

public class MlModelTrainer
{
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<MlModelTrainer> _logger;

    public MlModelTrainer(IWebHostEnvironment env, ILogger<MlModelTrainer> logger)
    {
        _env = env;
        _logger = logger;
    }

    public string ArtifactsDir =>
        Path.Combine(_env.ContentRootPath, "ML", "Artifacts");

    public string ClassifierPath => Path.Combine(ArtifactsDir, "incident-classifier.zip");
    public string RecommenderPath => Path.Combine(ArtifactsDir, "route-recommender.zip");

    public async Task<MlTrainResult> TrainAllAsync(ApplicationDbContext db, CancellationToken ct = default)
    {
        Directory.CreateDirectory(ArtifactsDir);
        var incident = await TrainIncidentClassifierAsync(db, ct);
        var routes = await TrainRouteRecommenderAsync(db, ct);
        return new MlTrainResult(incident, routes);
    }

    public async Task<MlModelMetrics> TrainIncidentClassifierAsync(
        ApplicationDbContext db,
        CancellationToken ct = default)
    {
        var rows = await BuildIncidentTrainingRowsAsync(db, ct);
        var ml = new MLContext(seed: 42);
        var data = ml.Data.LoadFromEnumerable(rows);
        var split = ml.Data.TrainTestSplit(data, testFraction: 0.2);

        var featurize = ml.Transforms.Concatenate(
            "Features",
            nameof(IncidentTrainingRow.HourOfDay),
            nameof(IncidentTrainingRow.DayOfWeek),
            nameof(IncidentTrainingRow.DescriptionLength),
            nameof(IncidentTrainingRow.HasCoordinates),
            nameof(IncidentTrainingRow.UbicacionLength),
            nameof(IncidentTrainingRow.IsNight));

        var trainer = ml.Transforms.Conversion.MapValueToKey("Label")
            .Append(
                ml.MulticlassClassification.Trainers.SdcaMaximumEntropy(
                    labelColumnName: "Label",
                    featureColumnName: "Features"))
            .Append(ml.Transforms.Conversion.MapKeyToValue("PredictedLabel"));

        var trainingPipeline = featurize.Append(trainer);
        var model = trainingPipeline.Fit(split.TrainSet);
        var predictions = model.Transform(split.TestSet);
        var metrics = ml.MulticlassClassification.Evaluate(
            predictions,
            labelColumnName: "Label",
            predictedLabelColumnName: "PredictedLabel",
            scoreColumnName: "Score");

        ml.Model.Save(model, split.TrainSet.Schema, ClassifierPath);
        _logger.LogInformation(
            "Clasificador de incidentes guardado ({Rows} filas, macroAccuracy {Acc:P1})",
            rows.Count,
            metrics.MacroAccuracy);

        return new MlModelMetrics(
            "Clasificación de incidentes",
            rows.Count,
            metrics.MacroAccuracy,
            metrics.LogLoss);
    }

    public async Task<MlModelMetrics> TrainRouteRecommenderAsync(
        ApplicationDbContext db,
        CancellationToken ct = default)
    {
        var rows = await BuildRouteInteractionRowsAsync(db, ct);
        var ml = new MLContext(seed: 42);
        var data = ml.Data.LoadFromEnumerable(rows);
        var split = ml.Data.TrainTestSplit(data, testFraction: 0.2);

        var options = new MatrixFactorizationTrainer.Options
        {
            MatrixColumnIndexColumnName = nameof(RouteInteractionRow.UserKey),
            MatrixRowIndexColumnName = nameof(RouteInteractionRow.RouteProfileKey),
            LabelColumnName = nameof(RouteInteractionRow.Label),
            NumberOfIterations = 20,
            ApproximationRank = 8,
        };

        var pipeline = ml.Recommendation().Trainers.MatrixFactorization(options);
        var model = pipeline.Fit(split.TrainSet);
        var predictions = model.Transform(split.TestSet);
        var metrics = ml.Regression.Evaluate(predictions, labelColumnName: "Label");

        ml.Model.Save(model, split.TrainSet.Schema, RecommenderPath);
        _logger.LogInformation(
            "Recomendador de rutas guardado ({Rows} filas, R² {R2:F3})",
            rows.Count,
            metrics.RSquared);

        return new MlModelMetrics(
            "Recomendación de rutas",
            rows.Count,
            metrics.RSquared,
            metrics.RootMeanSquaredError);
    }

    internal static async Task<List<IncidentTrainingRow>> BuildIncidentTrainingRowsAsync(
        ApplicationDbContext db,
        CancellationToken ct)
    {
        var reportes = await db.Reportes.AsNoTracking().ToListAsync(ct);
        var rows = reportes
            .Where(r => !string.IsNullOrWhiteSpace(r.TipoIncidente))
            .Select(ToIncidentRow)
            .ToList();

        rows.AddRange(GenerateSyntheticIncidentRows());
        return rows;
    }

    internal static async Task<List<RouteInteractionRow>> BuildRouteInteractionRowsAsync(
        ApplicationDbContext db,
        CancellationToken ct)
    {
        var historial = await db.RutasHistorial.AsNoTracking().ToListAsync(ct);
        var rows = historial.Select(ToRouteInteraction).ToList();
        rows.AddRange(GenerateSyntheticRouteInteractions(historial));
        return rows;
    }

    private static IncidentTrainingRow ToIncidentRow(Reporte r)
    {
        var dt = r.FechaReporte;
        var descLen = (r.Descripcion ?? "").Length;
        var hasCoords =
            !string.IsNullOrWhiteSpace(r.Latitud) && !string.IsNullOrWhiteSpace(r.Longitud)
                ? 1f
                : 0f;
        return new IncidentTrainingRow
        {
            Label = NormalizeIncidentLabel(r.TipoIncidente),
            HourOfDay = dt.Hour,
            DayOfWeek = (float)dt.DayOfWeek,
            DescriptionLength = Math.Min(descLen, 500),
            HasCoordinates = hasCoords,
            UbicacionLength = Math.Min(r.Ubicacion.Length, 200),
            IsNight = dt.Hour >= 19 || dt.Hour < 6 ? 1f : 0f,
        };
    }

    private static RouteInteractionRow ToRouteInteraction(RutaHistorial r)
    {
        var profileKey = RouteProfileKeyUtil.FromTexts(r.OrigenTexto, r.DestinoTexto, r.Modo);
        var safety = ScoreRoutePreference(r.Modo, r.KmAprox, r.MinutosAprox);
        return new RouteInteractionRow
        {
            UserKey = (uint)Math.Clamp(r.UsuarioId, 1, 999),
            RouteProfileKey = profileKey,
            Label = safety,
        };
    }

    private static float ScoreRoutePreference(string modo, double km, int minutos)
    {
        var m = modo.ToLowerInvariant();
        var score = 3.5f;
        if (m.Contains("peat") || m == "caminar") score += 0.8f;
        if (m.Contains("bike") || m.Contains("bici")) score += 0.3f;
        if (km <= 4) score += 0.6f;
        else if (km > 10) score -= 0.5f;
        if (minutos <= 25) score += 0.2f;
        return Math.Clamp(score, 1f, 5f);
    }

    private static string NormalizeIncidentLabel(string tipo)
    {
        var t = tipo.Trim();
        if (t.Equals("Zona Oscura", StringComparison.OrdinalIgnoreCase)
            || t.Equals("ZonaOscura", StringComparison.OrdinalIgnoreCase))
            return "ZonaOscura";
        return t;
    }

    private static IEnumerable<IncidentTrainingRow> GenerateSyntheticIncidentRows()
    {
        var rnd = new Random(42);
        var labels = new[] { "Robo", "Asalto", "Accidente", "ZonaOscura", "Otro" };
        for (var i = 0; i < 120; i++)
        {
            var label = labels[i % labels.Length];
            var hour = label switch
            {
                "Robo" => rnd.Next(18, 24),
                "Asalto" => rnd.Next(20, 24),
                "Accidente" => rnd.Next(7, 20),
                "ZonaOscura" => rnd.Next(19, 24),
                _ => rnd.Next(8, 22),
            };
            yield return new IncidentTrainingRow
            {
                Label = label,
                HourOfDay = hour,
                DayOfWeek = rnd.Next(0, 7),
                DescriptionLength = rnd.Next(20, 180),
                HasCoordinates = rnd.NextDouble() > 0.25 ? 1f : 0f,
                UbicacionLength = rnd.Next(12, 80),
                IsNight = hour >= 19 || hour < 6 ? 1f : 0f,
            };
        }
    }

    private static IEnumerable<RouteInteractionRow> GenerateSyntheticRouteInteractions(
        List<RutaHistorial> seed)
    {
        var rnd = new Random(7);
        var modos = new[] { "peaton", "bike", "caminar" };
        var pairs = new[]
        {
            ("Miraflores", "San Isidro"),
            ("Barranco", "Surco"),
            ("La Molina", "Monterrico"),
            ("Centro de Lima", "Magdalena"),
            ("San Miguel", "Pueblo Libre"),
        };

        for (var u = 1; u <= 8; u++)
        {
            for (var p = 0; p < pairs.Length; p++)
            {
                foreach (var modo in modos)
                {
                    var km = 2.5 + rnd.NextDouble() * 8;
                    var row = new RouteInteractionRow
                    {
                        UserKey = (uint)u,
                        RouteProfileKey = RouteProfileKeyUtil.FromTexts(
                            pairs[p].Item1,
                            pairs[p].Item2,
                            modo),
                        Label = ScoreRoutePreference(modo, km, (int)(km * 12)),
                    };
                    yield return row;
                }
            }
        }

        foreach (var h in seed.Take(20))
        {
            yield return ToRouteInteraction(h);
        }
    }
}

public static class RouteProfileKeyUtil
{
    public static uint FromTexts(string origen, string destino, string modo)
    {
        var key = $"{origen}|{destino}|{modo}".ToLowerInvariant();
        return (uint)(Math.Abs(key.GetHashCode()) % 4999 + 1);
    }
}

public record MlTrainResult(MlModelMetrics Incident, MlModelMetrics Recommendation);

public record MlModelMetrics(
    string ModelName,
    int TrainingRows,
    double PrimaryMetric,
    double SecondaryMetric);
