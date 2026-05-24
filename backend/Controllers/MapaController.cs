using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RutaSegura.Data;
using RutaSegura.Models;
using RutaSegura.Services;

namespace RutaSegura.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class MapaController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly RedisService _redis;
    private readonly MlNetService _ml;
    private readonly SistemaConfigService _config;
    private readonly ExternalApisService _external;

    public MapaController(
        ApplicationDbContext db,
        RedisService redis,
        MlNetService ml,
        SistemaConfigService config,
        ExternalApisService external)
    {
        _db = db;
        _redis = redis;
        _ml = ml;
        _config = config;
        _external = external;
    }

    private int GetUserId() =>
        int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    /// <summary>Contexto del mapa: último evento en Redis, ML zona y estado de caché.</summary>
    [HttpGet("contexto")]
    public async Task<IActionResult> GetContexto(
        [FromQuery] string? ubicacion = null,
        CancellationToken ct = default)
    {
        var userId = GetUserId();
        await _ml.EnsureModelsAsync(ct);

        var cfg = await _config.GetAsync(ct);
        var zonaTexto = string.IsNullOrWhiteSpace(ubicacion) ? "Lima, Perú" : ubicacion.Trim();
        var reportesZona = await ContarReportesZonaAsync(zonaTexto, ct);
        var enZona = await ListarReportesZonaAsync(zonaTexto, ct);
        var baseFeatures = ZoneFeatureBuilder.FromReporte(
            new Reporte
            {
                TipoIncidente = "Otro",
                Ubicacion = zonaTexto,
                FechaReporte = DateTime.UtcNow,
            },
            reportesZona);
        var features = SistemaConfigService.AplicarPesoZonasOscuras(
            baseFeatures,
            cfg.PesoZonasOscurasPct,
            SistemaConfigService.ContarZonaOscuraEnLista(enZona));
        var mlZona = _ml.ClassifyZoneSafety(
            features.CantidadReportes,
            features.Trafico,
            features.Iluminacion,
            features.Hora);
        var display = ZoneSafetyPresentation.ToDisplay(mlZona.Nivel, mlZona.ConfianzaPct);

        MapaUltimoEventoDto? ultimo = null;
        var servidoDesdeCache = false;
        if (_redis.IsEnabled)
        {
            var cached = await _redis.GetStringAsync($"mapa:ultimo-evento:{userId}");
            if (cached != null)
            {
                ultimo = ApiJson.Deserialize<MapaUltimoEventoDto>(cached);
                servidoDesdeCache = ultimo != null;
            }
        }

        return Ok(
            new MapaContextoResponse(
                _redis.IsEnabled,
                servidoDesdeCache,
                ultimo,
                display.Nivel,
                display.IndicadorVisual,
                display.Etiqueta,
                display.ConfianzaMlPct,
                reportesZona,
                cfg.PesoZonasOscurasPct,
                cfg.CaducidadReporteMenorHoras,
                DateTime.UtcNow));
    }

    /// <summary>Incidentes con coordenadas para capa de exploración en el mapa (SQLite + Redis).</summary>
    [HttpGet("incidentes")]
    [AllowAnonymous]
    public async Task<IActionResult> GetIncidentes(
        [FromQuery] int maxDays = 30,
        [FromQuery] int take = 50,
        CancellationToken ct = default)
    {
        var days = Math.Clamp(maxDays, 1, 365);
        var n = Math.Clamp(take, 1, 100);
        var cfg = await _config.GetAsync(ct);
        var cacheKey = $"mapa:incidentes:v2:{days}:{n}";

        if (_redis.IsEnabled)
        {
            var cached = await _redis.GetStringAsync(cacheKey);
            if (cached != null)
            {
                var parsed = ApiJson.Deserialize<MapaIncidentesResponse>(cached);
                if (parsed != null)
                    return Ok(parsed with { ServidoDesdeCache = true });
            }
        }

        var desde = DateTime.UtcNow.AddDays(-days);
        var raw = await _db.Reportes
            .AsNoTracking()
            .Where(r =>
                r.FechaReporte >= desde
                && r.Estado != "Rechazado"
                && r.Latitud != null
                && r.Longitud != null
                && r.Latitud != ""
                && r.Longitud != "")
            .OrderByDescending(r => r.FechaReporte)
            .Take(n * 2)
            .Select(r => new
            {
                r.Id,
                Tipo = r.TipoIncidente ?? "Otro",
                r.Latitud,
                r.Longitud,
                Ubicacion = r.Ubicacion ?? "",
                r.Descripcion,
                r.FechaReporte,
            })
            .ToListAsync(ct);

        var incidentes = new List<MapaIncidenteDto>();
        foreach (var r in raw.OrderBy(x =>
                     SistemaConfigService.EsReporteMenor(x.FechaReporte, cfg.CaducidadReporteMenorHoras)))
        {
            if (!TryParseCoord(r.Latitud, out var lat)
                || !TryParseCoord(r.Longitud, out var lng))
                continue;

            var esMenor = SistemaConfigService.EsReporteMenor(
                r.FechaReporte,
                cfg.CaducidadReporteMenorHoras);
            var (color, label) = EstiloPorTipo(r.Tipo, esMenor);
            var desc = string.IsNullOrWhiteSpace(r.Descripcion)
                ? r.Ubicacion
                : r.Descripcion;
            if (esMenor)
                desc = $"[Reciente < {cfg.CaducidadReporteMenorHoras}h] {desc}";

            incidentes.Add(
                new MapaIncidenteDto(
                    r.Id,
                    r.Tipo,
                    lat,
                    lng,
                    r.Ubicacion,
                    desc,
                    color,
                    label,
                    esMenor));

            if (incidentes.Count >= n) break;
        }

        var response = new MapaIncidentesResponse(
            incidentes,
            incidentes.Count,
            _redis.IsEnabled,
            false,
            DateTime.UtcNow);

        if (_redis.IsEnabled)
        {
            await _redis.SetStringAsync(
                cacheKey,
                ApiJson.Serialize(response),
                TimeSpan.FromMinutes(4));
        }

        return Ok(response);
    }

    private static bool TryParseCoord(string? value, out double result)
    {
        result = 0;
        if (string.IsNullOrWhiteSpace(value)) return false;
        return double.TryParse(
            value.Replace(',', '.'),
            System.Globalization.NumberStyles.Any,
            System.Globalization.CultureInfo.InvariantCulture,
            out result);
    }

    private static (string Color, string Label) EstiloPorTipo(string tipo, bool esMenor = false)
    {
        if (esMenor) return ("#94a3b8", "·");
        var t = tipo.ToLowerInvariant();
        if (t.Contains("robo") || t.Contains("asalto"))
            return ("#ef4444", "R");
        if (t.Contains("accidente"))
            return ("#f97316", "A");
        if (t.Contains("acoso"))
            return ("#7c3aed", "C");
        if (t.Contains("ilumin") || t.Contains("oscur"))
            return ("#64748b", "L");
        if (t.Contains("hueco") || t.Contains("vía") || t.Contains("via"))
            return ("#f59e0b", "H");
        return ("#6366f1", "!");
    }

    [HttpPost("llegue-bien")]
    public async Task<IActionResult> LlegueBien(
        [FromBody] MapaEventoRequest? body,
        CancellationToken ct = default)
    {
        var userId = GetUserId();
        var usuario = await _db.Usuarios.AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (usuario is null) return Unauthorized();

        var ubicacion = body?.UbicacionTexto?.Trim() ?? "Ubicación en mapa";
        var contactos = await _db.Contactos.AsNoTracking()
            .Where(c => c.UsuarioId == userId)
            .OrderByDescending(c => c.EsPrincipal)
            .ThenBy(c => c.Prioridad)
            .Take(5)
            .Select(c => new { c.Nombre, c.Telefono })
            .ToListAsync(ct);

        var nombres = contactos.Count > 0
            ? string.Join(", ", contactos.Select(c => c.Nombre))
            : "sin contactos de emergencia configurados";

        var alerta = new AlertaSistema
        {
            Titulo = $"{usuario.Nombre} llegó bien",
            Detalle =
                $"El usuario confirmó llegada segura. Ubicación: {ubicacion}. Notificación simulada a: {nombres}.",
            Prioridad = "baja",
            Origen = "Usuario",
            UbicacionRef = ubicacion,
            RiesgoEstimadoPct = 5,
            CreadaEn = DateTime.UtcNow,
        };
        _db.AlertasSistema.Add(alerta);
        await _db.SaveChangesAsync(ct);

        var payload = new MapaEventoResponse(
            "✅ Llegada confirmada",
            $"Se registró tu llegada segura. Tus contactos ({contactos.Count}) recibirían un aviso en un entorno de producción.",
            contactos.Count,
            contactos.Select(c => c.Nombre).ToList(),
            alerta.Id,
            _redis.IsEnabled,
            _redis.IsEnabled,
            null,
            null,
            null,
            null,
            DateTime.UtcNow);

        await GuardarEventoRedisAsync(userId, "llegue-bien", payload, ct);
        return Ok(payload);
    }

    [HttpPost("sos")]
    public async Task<IActionResult> Sos(
        [FromBody] MapaEventoRequest? body,
        CancellationToken ct = default)
    {
        var userId = GetUserId();
        var usuario = await _db.Usuarios.AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (usuario is null) return Unauthorized();

        await _ml.EnsureModelsAsync(ct);
        var ubicacion = body?.UbicacionTexto?.Trim() ?? "Ubicación en mapa";
        var lat = body?.Latitud ?? -12.0464;
        var lon = body?.Longitud ?? -77.0428;
        var horaLocal = ClimaImpactoAnalyzer.HoraLocalPeru();
        var climaCtx = await _external.GetClimaContextoAsync(lat, lon, horaLocal, ct);
        var impacto = climaCtx.Impacto;

        var cfgSos = await _config.GetAsync(ct);
        var reportesZona = await ContarReportesZonaAsync(ubicacion, ct);
        var enZonaSos = await ListarReportesZonaAsync(ubicacion, ct);
        var baseSos = ZoneFeatureBuilder.FromReporte(
            new Reporte
            {
                TipoIncidente = "Asalto",
                Ubicacion = ubicacion,
                FechaReporte = DateTime.UtcNow,
            },
            Math.Max(reportesZona, 2));
        var features = SistemaConfigService.AplicarPesoZonasOscuras(
            baseSos,
            cfgSos.PesoZonasOscurasPct,
            SistemaConfigService.ContarZonaOscuraEnLista(enZonaSos));
        var ilumAjustada = ClimaImpactoAnalyzer.AjustarIluminacion(features.Iluminacion, impacto);
        var mlZona = _ml.ClassifyZoneSafety(
            features.CantidadReportes,
            features.Trafico,
            ilumAjustada,
            features.Hora,
            incidentesRecientes: Math.Clamp(reportesZona / 6f, 0f, 1f),
            condicionClima: impacto.CondicionClima);
        var nivelElevado = ClimaImpactoAnalyzer.ElevarNivelPorClima(mlZona.Nivel, impacto);
        var display = ZoneSafetyPresentation.ToDisplay(nivelElevado, mlZona.ConfianzaPct);

        var motivos = new List<string>();
        if (display.Nivel.Contains("peligro", StringComparison.OrdinalIgnoreCase)
            || display.Nivel.Contains("moder", StringComparison.OrdinalIgnoreCase))
            motivos.Add($"Zona {display.Etiqueta.ToLowerInvariant()}");
        if (features.Iluminacion < 0.35f || ilumAjustada < 0.35f)
            motivos.Add("Zona oscura / baja iluminación");
        if (impacto.Lluvia) motivos.Add("Lluvia activa");
        if (impacto.Tormenta) motivos.Add("Tormenta o visibilidad crítica");
        if (impacto.Neblina) motivos.Add("Neblina");
        if (reportesZona >= 2) motivos.Add("Reportes recientes en la zona");

        var contactos = await _db.Contactos.AsNoTracking()
            .Where(c => c.UsuarioId == userId)
            .OrderByDescending(c => c.EsPrincipal)
            .ThenBy(c => c.Prioridad)
            .Take(5)
            .Select(c => new { c.Nombre, c.Telefono })
            .ToListAsync(ct);

        var riesgoPct = display.Nivel.Contains("peligro", StringComparison.OrdinalIgnoreCase)
            ? 92
            : display.Nivel.Contains("moder", StringComparison.OrdinalIgnoreCase)
                ? 68
                : 45;
        riesgoPct = ClimaImpactoAnalyzer.AjustarRiesgoSosPct(riesgoPct, impacto, reportesZona);

        var nivelRiesgoTexto = riesgoPct >= 80 ? "Alto" : riesgoPct >= 60 ? "Moderado" : "Bajo";

        var alerta = new AlertaSistema
        {
            Titulo = $"SOS — {usuario.Nombre}",
            Detalle =
                $"Alerta de emergencia. Nivel contextual: {nivelRiesgoTexto}. Clima: {climaCtx.Clima.Descripcion}. Zona ML: {display.Etiqueta}. Ubicación: {ubicacion}.",
            Prioridad = "alta",
            Origen = "Usuario",
            UbicacionRef = ubicacion,
            RiesgoEstimadoPct = riesgoPct,
            CreadaEn = DateTime.UtcNow,
        };
        _db.AlertasSistema.Add(alerta);
        await _db.SaveChangesAsync(ct);

        await DashboardAlertasService.InvalidateAlertasCacheAsync(_redis);

        var mensaje =
            contactos.Count > 0
                ? $"Alerta SOS enviada. Se notificaría a {contactos.Count} contacto(s) y se priorizaría asistencia."
                : "Alerta SOS registrada. Agrega contactos en Perfil para que puedan ser notificados.";

        var payload = new MapaEventoResponse(
            "🚨 SOS activado",
            mensaje,
            contactos.Count,
            contactos.Select(c => c.Nombre).ToList(),
            alerta.Id,
            _redis.IsEnabled,
            true,
            display.Nivel,
            display.IndicadorVisual,
            display.Etiqueta,
            display.ConfianzaMlPct,
            DateTime.UtcNow,
            nivelRiesgoTexto,
            motivos,
            climaCtx.Clima.Descripcion,
            riesgoPct);

        await GuardarEventoRedisAsync(userId, "sos", payload, ct);

        if (_redis.IsEnabled)
        {
            await _redis.SetStringAsync(
                $"mapa:sos-activo:{userId}",
                ApiJson.Serialize(new { activo = true, hasta = DateTime.UtcNow.AddMinutes(15) }),
                TimeSpan.FromMinutes(15));
        }

        return Ok(payload);
    }

    private async Task GuardarEventoRedisAsync(
        int userId,
        string tipo,
        MapaEventoResponse resp,
        CancellationToken ct)
    {
        if (!_redis.IsEnabled) return;

        var ultimo = new MapaUltimoEventoDto(tipo, resp.Mensaje, resp.Titulo, resp.ProcesadoEnUtc);
        await _redis.SetStringAsync(
            $"mapa:ultimo-evento:{userId}",
            ApiJson.Serialize(ultimo),
            TimeSpan.FromHours(24));

        await _redis.SetStringAsync(
            $"mapa:evento-log:{userId}:{DateTime.UtcNow.Ticks}",
            ApiJson.Serialize(resp),
            TimeSpan.FromMinutes(30));
    }

    private static string ExtraerFragmentoZona(string ubicacion)
    {
        var zona = ubicacion.Trim().ToLowerInvariant();
        if (zona.Length < 3) return zona;
        return zona.Length > 24 ? zona[..24] : zona;
    }

    private async Task<List<Reporte>> ListarReportesZonaAsync(string ubicacion, CancellationToken ct)
    {
        var fragmento = ExtraerFragmentoZona(ubicacion);
        return await _db.Reportes
            .AsNoTracking()
            .Where(r =>
                r.FechaReporte >= DateTime.UtcNow.AddDays(-30)
                && r.Estado != "Rechazado"
                && r.Ubicacion != null
                && r.Ubicacion.ToLower().Contains(fragmento))
            .Take(40)
            .ToListAsync(ct);
    }

    private async Task<int> ContarReportesZonaAsync(string ubicacion, CancellationToken ct)
    {
        var fragmento = ExtraerFragmentoZona(ubicacion);
        if (fragmento.Length < 3) return 1;
        return await _db.Reportes.AsNoTracking()
            .CountAsync(
                r =>
                    r.FechaReporte >= DateTime.UtcNow.AddDays(-30)
                    && r.Estado != "Rechazado"
                    && r.Ubicacion != null
                    && r.Ubicacion.ToLower().Contains(fragmento),
                ct);
    }
}

public record MapaIncidenteDto(
    int Id,
    string Tipo,
    double Lat,
    double Lng,
    string Ubicacion,
    string? Descripcion,
    string Color,
    string Label,
    bool EsMenor);

public record MapaIncidentesResponse(
    IReadOnlyList<MapaIncidenteDto> Incidentes,
    int Total,
    bool CacheRedisActivo,
    bool ServidoDesdeCache,
    DateTime GeneradoEnUtc);

public record MapaEventoRequest(
    double? Latitud,
    double? Longitud,
    string? UbicacionTexto);

public record MapaUltimoEventoDto(
    string Tipo,
    string Mensaje,
    string Titulo,
    DateTime ProcesadoEnUtc);

public record MapaContextoResponse(
    bool CacheRedisActivo,
    bool ServidoDesdeCache,
    MapaUltimoEventoDto? UltimoEvento,
    string NivelZonaMl,
    string IndicadorZona,
    string EtiquetaZona,
    double? ConfianzaMlPct,
    int ReportesZona30d,
    int PesoZonasOscurasPct,
    int CaducidadReporteMenorHoras,
    DateTime GeneradoEnUtc);

public record MapaEventoResponse(
    string Titulo,
    string Mensaje,
    int ContactosNotificados,
    IReadOnlyList<string> NombresContactos,
    int AlertaSistemaId,
    bool CacheRedisActivo,
    bool EventoGuardadoEnRedis,
    string? NivelZonaMl,
    string? IndicadorZona,
    string? EtiquetaZona,
    double? ConfianzaMlPct,
    DateTime ProcesadoEnUtc,
    string? NivelRiesgoContextual = null,
    IReadOnlyList<string>? MotivosRiesgo = null,
    string? ClimaResumen = null,
    int? RiesgoEstimadoPct = null);
