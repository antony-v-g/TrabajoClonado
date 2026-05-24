using System.Globalization;

namespace RutaSegura.Services;

/// <summary>Analiza WeatherAPI y deriva riesgo de movilidad, advertencias y ajustes ML.</summary>
public static class ClimaImpactoAnalyzer
{
    public static ClimaImpacto Analizar(ClimaResponse clima, float horaLocal)
    {
        var desc = Normalizar(clima.Descripcion);
        var lluvia = Contiene(desc, "lluvia", "llov", "chubasc", "rain", "drizzle", "llovizna");
        var tormenta = Contiene(desc, "tormenta", "storm", "thunder", "rayo", "granizo", "trueno");
        var neblina = Contiene(
            desc,
            "neblina",
            "niebla",
            "bruma",
            "fog",
            "mist",
            "humo",
            "nieve",
            "snow");
        var nublado = Contiene(desc, "nublado", "overcast", "cloud");

        if (clima.PrecipMm >= 0.3) lluvia = true;
        if (clima.PrecipMm >= 4) tormenta = true;
        if (clima.VisKm > 0 && clima.VisKm < 4) neblina = true;

        var visibilidadBaja = neblina || tormenta || lluvia && (horaLocal >= 18 || horaLocal < 6);
        var condicion = 0f;
        if (nublado) condicion += 0.12f;
        if (lluvia) condicion += 0.35f;
        if (neblina) condicion += 0.28f;
        if (tormenta) condicion += 0.45f;
        if (visibilidadBaja && (horaLocal >= 19 || horaLocal < 6)) condicion += 0.15f;
        condicion = Math.Clamp(condicion, 0f, 1f);

        var riesgoMovilidad = condicion >= 0.55f
            ? "Alto"
            : condicion >= 0.25f
                ? "Moderado"
                : "Bajo";

        var advertencias = new List<string>();
        if (tormenta)
            advertencias.Add("Tormenta detectada: evita rutas expuestas y busca refugio seguro.");
        else if (lluvia)
            advertencias.Add("Lluvia activa: preferir avenidas iluminadas y evitar callejones oscuros.");
        if (neblina)
            advertencias.Add("Neblina o visibilidad reducida: reduce velocidad y usa rutas principales.");
        if (visibilidadBaja && (horaLocal >= 19 || horaLocal < 6))
            advertencias.Add("Poca visibilidad nocturna: se recomienda la ruta con mejor iluminación.");
        if (advertencias.Count == 0 && condicion >= 0.15f)
            advertencias.Add("Condiciones climáticas moderadas: mantén precaución extra al caminar.");

        var recomendacionRuta = condicion >= 0.35f
            ? "Se recomienda la ruta principal por mejor iluminación y mayor tránsito."
            : "Condiciones favorables; puedes elegir ruta equilibrada o rápida.";

        var emoji = tormenta ? "⛈️" : lluvia ? "🌧️" : neblina ? "🌫️" : nublado ? "☁️" : "🌤️";

        return new ClimaImpacto(
            Lluvia: lluvia,
            Neblina: neblina,
            Tormenta: tormenta,
            VisibilidadBaja: visibilidadBaja,
            CondicionClima: (float)Math.Round(condicion, 2),
            RiesgoMovilidad: riesgoMovilidad,
            Emoji: emoji,
            Advertencias: advertencias,
            RecomendacionRuta: recomendacionRuta);
    }

    public static float AjustarIluminacion(float iluminacionBase, ClimaImpacto impacto)
    {
        var factor = 1f;
        if (impacto.Tormenta) factor -= 0.35f;
        else if (impacto.Lluvia) factor -= 0.22f;
        if (impacto.Neblina) factor -= 0.18f;
        if (impacto.VisibilidadBaja) factor -= 0.12f;
        return Math.Clamp(iluminacionBase * factor, 0.08f, 1f);
    }

    public static float IluminacionPorDefecto(ClimaResponse clima, ClimaImpacto impacto)
    {
        var baseIlum = clima.TemperaturaC < 18 ? 0.45f : 0.72f;
        return AjustarIluminacion(baseIlum, impacto);
    }

    public static string ElevarNivelPorClima(string nivel, ClimaImpacto impacto)
    {
        if (impacto.CondicionClima < 0.3f) return nivel;
        var n = ZoneSafetyPresentation.Normalize(nivel);
        if (impacto.CondicionClima >= 0.65f || impacto.Tormenta)
        {
            if (n == ZoneSafetyPresentation.Segura) return ZoneSafetyPresentation.Moderada;
            if (n == ZoneSafetyPresentation.Moderada) return ZoneSafetyPresentation.Peligrosa;
        }
        else if (impacto.CondicionClima >= 0.3f && n == ZoneSafetyPresentation.Segura)
        {
            return ZoneSafetyPresentation.Moderada;
        }

        return n;
    }

    public static int AjustarRiesgoSosPct(int basePct, ClimaImpacto impacto, int reportesRecientes)
    {
        var pct = basePct;
        if (impacto.Tormenta) pct += 18;
        else if (impacto.Lluvia) pct += 10;
        if (impacto.Neblina || impacto.VisibilidadBaja) pct += 8;
        if (impacto.CondicionClima >= 0.5f) pct += 6;
        if (reportesRecientes >= 2) pct += 5;
        return Math.Clamp(pct, 40, 98);
    }

    public static float HoraLocalPeru()
    {
        var utc = DateTime.UtcNow;
        var peru = utc.AddHours(-5);
        return peru.Hour + peru.Minute / 60f;
    }

    private static string Normalizar(string s) =>
        s.Trim().ToLowerInvariant()
            .Normalize(System.Text.NormalizationForm.FormD)
            .Where(c => char.GetUnicodeCategory(c) != System.Globalization.UnicodeCategory.NonSpacingMark)
            .Aggregate("", (a, c) => a + c);

    private static bool Contiene(string desc, params string[] tokens) =>
        tokens.Any(t => desc.Contains(t, StringComparison.Ordinal));
}

public record ClimaImpacto(
    bool Lluvia,
    bool Neblina,
    bool Tormenta,
    bool VisibilidadBaja,
    float CondicionClima,
    string RiesgoMovilidad,
    string Emoji,
    IReadOnlyList<string> Advertencias,
    string RecomendacionRuta);

public record ClimaContextoResponse(
    ClimaResponse Clima,
    ClimaImpacto Impacto,
    float HoraLocal);
