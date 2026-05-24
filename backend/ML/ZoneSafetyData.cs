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
    /// <summary>Incidentes en las últimas horas (normalizado 0–1). Columna CSV: IncidentesRecientes.</summary>
    public float IncidentesRecientes { get; set; }

    /// <summary>Condición climática adversa normalizada 0–1 (lluvia, neblina, tormenta).</summary>
    public float CondicionClima { get; set; }
}

public class ZoneSafetyPredictionOutput
{
    [ColumnName("PredictedLabel")]
    public string PredictedLabel { get; set; } = string.Empty;

    public float[]? Score { get; set; }
}
