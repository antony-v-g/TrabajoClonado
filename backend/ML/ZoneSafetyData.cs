using Microsoft.ML.Data;

namespace RutaSegura.ML;

/// <summary>Clasificación de seguridad de zona (multiclass ML.NET).</summary>
public class ZoneSafetyTrainingRow
{
    public string Label { get; set; } = string.Empty;

    public float CantidadReportes { get; set; }
    public float Trafico { get; set; }
    public float Iluminacion { get; set; }
    public float Hora { get; set; }
}

public class ZoneSafetyPredictionOutput
{
    [ColumnName("PredictedLabel")]
    public string PredictedLabel { get; set; } = string.Empty;

    public float[]? Score { get; set; }
}
