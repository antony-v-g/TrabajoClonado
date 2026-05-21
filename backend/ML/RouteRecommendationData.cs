using Microsoft.ML.Data;

namespace RutaSegura.ML;

/// <summary>Interacción usuario–perfil de ruta para Matrix Factorization.</summary>
public class RouteInteractionRow
{
    [KeyType(count: 1000)]
    public uint UserKey { get; set; }

    [KeyType(count: 5000)]
    public uint RouteProfileKey { get; set; }

    public float Label { get; set; }
}

/// <summary>Entrada de predicción; los KeyType deben coincidir con <see cref="RouteInteractionRow"/>.</summary>
public class RouteRecommendationInput
{
    [KeyType(count: 1000)]
    public uint UserKey { get; set; }

    [KeyType(count: 5000)]
    public uint RouteProfileKey { get; set; }
}

public class RouteRecommendationOutput
{
    public float Score { get; set; }
}
