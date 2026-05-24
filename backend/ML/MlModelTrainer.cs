using Microsoft.EntityFrameworkCore;
using Microsoft.ML;
using Microsoft.ML.Data;
using Microsoft.ML.Trainers;
using RutaSegura.Data;
using RutaSegura.Models;
using RutaSegura.Services;

namespace RutaSegura.ML;

public class MlModelTrainer
{
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<MlModelTrainer> _logger;
    private readonly MlCsvDatasetLoader _csv;

    public MlModelTrainer(
        IWebHostEnvironment env,
        ILogger<MlModelTrainer> logger,
        MlCsvDatasetLoader csv)
    {
        _env = env;
        _logger = logger;
        _csv = csv;
    }

    public string ModelsDir => MlModelPaths.ResolveModelsDir(_env.ContentRootPath);

    public string ArtifactsDir => MlModelPaths.ResolveLegacyArtifactsDir(_env.ContentRootPath);

    public string ClassifierPath => ResolveModelPath(MlModelPaths.IncidentClassifierFile);

    public string RecommenderPath => ResolveModelPath(MlModelPaths.RouteRecommenderFile);

    public string ZoneSafetyPath => ResolveModelPath(MlModelPaths.ZoneClassifierFile);

    private string ResolveModelPath(string fileName)
    {
        var primary = Path.Combine(ModelsDir, fileName);
        if (File.Exists(primary)) return primary;
        return Path.Combine(ArtifactsDir, fileName);
    }

    public async Task<MlTrainResult> TrainAllAsync(ApplicationDbContext db, CancellationToken ct = default)
    {
        Directory.CreateDirectory(ModelsDir);
        Directory.CreateDirectory(ArtifactsDir);
        var incident = await TrainIncidentClassifierAsync(db, ct);
        var routes = await TrainRouteRecommenderAsync(db, ct);
        var zones = await TrainZoneSafetyClassifierAsync(db, ct);
        return new MlTrainResult(incident, routes, zones);
    }

    public async Task<MlModelMetrics> TrainZoneSafetyClassifierAsync(
        ApplicationDbContext db,
        CancellationToken ct = default)
    {
        var rows = await BuildZoneSafetyTrainingRowsAsync(db, ct);
        var ml = new MLContext(seed: 42);
        var data = ml.Data.LoadFromEnumerable(rows);
        var split = ml.Data.TrainTestSplit(data, testFraction: 0.2);

        var featurize = ml.Transforms.Concatenate(
            "Features",
            nameof(ZoneSafetyTrainingRow.CantidadReportes),
            nameof(ZoneSafetyTrainingRow.Trafico),
            nameof(ZoneSafetyTrainingRow.Iluminacion),
            nameof(ZoneSafetyTrainingRow.Hora),
            nameof(ZoneSafetyTrainingRow.IncidentesRecientes),
            nameof(ZoneSafetyTrainingRow.CondicionClima));

        var trainer = ml.Transforms.Conversion.MapValueToKey("Label")
            .Append(
                ml.MulticlassClassification.Trainers.SdcaMaximumEntropy(
                    labelColumnName: "Label",
                    featureColumnName: "Features"))
            .Append(ml.Transforms.Conversion.MapKeyToValue("PredictedLabel"));

        var model = featurize.Append(trainer).Fit(split.TrainSet);
        var predictions = model.Transform(split.TestSet);
        var metrics = ml.MulticlassClassification.Evaluate(
            predictions,
            labelColumnName: "Label",
            predictedLabelColumnName: "PredictedLabel",
            scoreColumnName: "Score");

        ml.Model.Save(model, split.TrainSet.Schema, ZoneSafetyPath);
        _logger.LogInformation(
            "Clasificador de seguridad de zona guardado en {Path} ({Rows} filas, macroAccuracy {Acc:P1})",
            ZoneSafetyPath,
            rows.Count,
            metrics.MacroAccuracy);

        return new MlModelMetrics(
            "Seguridad de zona",
            rows.Count,
            metrics.MacroAccuracy,
            metrics.LogLoss);
    }

    internal async Task<List<ZoneSafetyTrainingRow>> BuildZoneSafetyTrainingRowsAsync(
        ApplicationDbContext db,
        CancellationToken ct)
    {
        var reportes = await db.Reportes.AsNoTracking().ToListAsync(ct);
        var porZona = reportes
            .GroupBy(r => (r.Ubicacion ?? "").Trim().ToLowerInvariant())
            .ToDictionary(g => g.Key, g => g.Count());

        var rows = new List<ZoneSafetyTrainingRow>();
        if (_csv.ZoneCsvExists)
            rows.AddRange(_csv.LoadZoneRows());

        foreach (var r in reportes.Where(r => !string.IsNullOrWhiteSpace(r.Ubicacion)))
        {
            var zona = (r.Ubicacion ?? "").Trim().ToLowerInvariant();
            var cantidad = porZona.TryGetValue(zona, out var c) ? c : 1;
            var f = ZoneFeatureBuilder.FromReporte(r, cantidad);
            var incidentes = Math.Clamp((cantidad - 1) / 4f, 0f, 1f);
            var label = InferZoneLabel(
                f.CantidadReportes,
                f.Trafico,
                f.Iluminacion,
                f.Hora,
                incidentes,
                0f);
            rows.Add(
                new ZoneSafetyTrainingRow
                {
                    Label = label,
                    CantidadReportes = f.CantidadReportes,
                    Trafico = f.Trafico,
                    Iluminacion = f.Iluminacion,
                    Hora = f.Hora,
                    IncidentesRecientes = incidentes,
                    CondicionClima = 0f,
                });
        }

        if (rows.Count < 8)
            rows.AddRange(GenerateSyntheticZoneRows());
        return rows;
    }

    private static string InferZoneLabel(
        float cantidad,
        float trafico,
        float iluminacion,
        float hora,
        float incidentesRecientes,
        float condicionClima = 0f)
    {
        var riesgo =
            cantidad * 0.35f
            + trafico * 0.18f
            + (1f - iluminacion) * 0.22f
            + (hora >= 19f || hora < 6f ? 0.10f : 0f)
            + incidentesRecientes * 0.15f
            + condicionClima * 0.12f;
        if (riesgo >= 0.62f) return ZoneSafetyPresentation.Peligrosa;
        if (riesgo >= 0.38f) return ZoneSafetyPresentation.Moderada;
        return ZoneSafetyPresentation.Segura;
    }

    private static IEnumerable<ZoneSafetyTrainingRow> GenerateSyntheticZoneRows()
    {
        var rnd = new Random(99);
        for (var i = 0; i < 90; i++)
        {
            var cantidad = (float)rnd.NextDouble();
            var trafico = (float)rnd.NextDouble();
            var iluminacion = (float)rnd.NextDouble();
            var hora = rnd.Next(0, 24) + rnd.Next(0, 60) / 60f;
            var incidentes = (float)rnd.NextDouble();
            var clima = (float)(rnd.NextDouble() * 0.85);
            yield return new ZoneSafetyTrainingRow
            {
                Label = InferZoneLabel(cantidad, trafico, iluminacion, hora, incidentes, clima),
                CantidadReportes = cantidad,
                Trafico = trafico,
                Iluminacion = iluminacion,
                Hora = hora,
                IncidentesRecientes = incidentes,
                CondicionClima = clima,
            };
        }
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

    internal async Task<List<RouteInteractionRow>> BuildRouteInteractionRowsAsync(
        ApplicationDbContext db,
        CancellationToken ct)
    {
        var rows = new List<RouteInteractionRow>();
        if (_csv.RoutesCsvExists)
            rows.AddRange(_csv.LoadRouteRows());

        var historial = await db.RutasHistorial.AsNoTracking().ToListAsync(ct);
        rows.AddRange(historial.Select(ToRouteInteraction));
        if (rows.Count < 10)
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
        if (t.Contains("zona", StringComparison.OrdinalIgnoreCase)
            && t.Contains("oscur", StringComparison.OrdinalIgnoreCase))
            return "ZonaOscura";
        if (t.Equals("Acoso", StringComparison.OrdinalIgnoreCase)) return "Asalto";
        if (t.Equals("Sin Iluminación", StringComparison.OrdinalIgnoreCase)) return "ZonaOscura";
        if (t.Equals("Hueco en Vía", StringComparison.OrdinalIgnoreCase)) return "Accidente";
        if (t.Equals("Otro peligro", StringComparison.OrdinalIgnoreCase)) return "Otro";
        if (t.Equals("Vandalismo", StringComparison.OrdinalIgnoreCase)) return "Vandalismo";
        if (t.Equals("Zona Oscura", StringComparison.OrdinalIgnoreCase)
            || t.Equals("ZonaOscura", StringComparison.OrdinalIgnoreCase))
            return "ZonaOscura";
        return t;
    }

    private static IEnumerable<IncidentTrainingRow> GenerateSyntheticIncidentRows()
    {
        var rnd = new Random(42);
        var labels = new[] { "Robo", "Asalto", "Accidente", "ZonaOscura", "Vandalismo", "Otro" };
        for (var i = 0; i < 120; i++)
        {
            var label = labels[i % labels.Length];
            var hour = label switch
            {
                "Robo" => rnd.Next(18, 24),
                "Asalto" => rnd.Next(20, 24),
                "Accidente" => rnd.Next(7, 20),
                "ZonaOscura" => rnd.Next(19, 24),
                "Vandalismo" => rnd.Next(14, 23),
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

public record MlTrainResult(
    MlModelMetrics Incident,
    MlModelMetrics Recommendation,
    MlModelMetrics ZoneSafety);

public record MlModelMetrics(
    string ModelName,
    int TrainingRows,
    double PrimaryMetric,
    double SecondaryMetric);
