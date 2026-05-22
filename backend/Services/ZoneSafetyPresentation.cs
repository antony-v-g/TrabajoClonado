namespace RutaSegura.Services;

public static class ZoneSafetyPresentation
{
    public const string Segura = "Segura";
    public const string Moderada = "ModeradamenteSegura";
    public const string Peligrosa = "Peligrosa";

    public static ZoneSafetyDisplay ToDisplay(string nivel, double? confianzaPct = null)
    {
        var n = Normalize(nivel);
        return n switch
        {
            Segura => new ZoneSafetyDisplay(
                Segura,
                "🟢",
                "Zona segura",
                confianzaPct),
            Moderada => new ZoneSafetyDisplay(
                Moderada,
                "🟡",
                "Riesgo moderado",
                confianzaPct),
            _ => new ZoneSafetyDisplay(
                Peligrosa,
                "🔴",
                "Zona peligrosa",
                confianzaPct),
        };
    }

    public static string Normalize(string? nivel)
    {
        if (string.IsNullOrWhiteSpace(nivel)) return Peligrosa;
        var t = nivel.Trim();
        if (t.Contains("Segura", StringComparison.OrdinalIgnoreCase)
            && !t.Contains("Moder", StringComparison.OrdinalIgnoreCase))
            return Segura;
        if (t.Contains("Moder", StringComparison.OrdinalIgnoreCase))
            return Moderada;
        return Peligrosa;
    }
}

public record ZoneSafetyDisplay(
    string Nivel,
    string IndicadorVisual,
    string Etiqueta,
    double? ConfianzaMlPct);

public record ZoneSafetyResult(string Nivel, double ConfianzaPct);
