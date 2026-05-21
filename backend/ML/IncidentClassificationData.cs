using Microsoft.ML.Data;

namespace RutaSegura.ML;

/// <summary>Entrada para clasificar tipo de incidente (multiclass).</summary>
public class IncidentTrainingRow
{
    public string Label { get; set; } = string.Empty;

    public float HourOfDay { get; set; }
    public float DayOfWeek { get; set; }
    public float DescriptionLength { get; set; }
    public float HasCoordinates { get; set; }
    public float UbicacionLength { get; set; }
    public float IsNight { get; set; }
}

public class IncidentPredictionInput
{
    public float HourOfDay { get; set; }
    public float DayOfWeek { get; set; }
    public float DescriptionLength { get; set; }
    public float HasCoordinates { get; set; }
    public float UbicacionLength { get; set; }
    public float IsNight { get; set; }
}

public class IncidentPredictionOutput
{
    [ColumnName("PredictedLabel")]
    public string PredictedLabel { get; set; } = string.Empty;

    public float[]? Score { get; set; }
}
