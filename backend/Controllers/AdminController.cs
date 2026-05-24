using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RutaSegura.Data;
using RutaSegura.Models;
using RutaSegura.Services;

namespace RutaSegura.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Administrador")]
public class AdminController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly RedisService _redis;
    private readonly MlNetService _ml;
    private readonly SistemaConfigService _config;
    private readonly ExternalApisService _external;
    private readonly AdminPredictivoService _predictivo;
    private readonly AlertasInteligentesService _alertasInteligentes;
    private readonly ReporteGeocodingService _geocoding;

    public AdminController(
        ApplicationDbContext context,
        RedisService redis,
        MlNetService ml,
        SistemaConfigService config,
        ExternalApisService external,
        AdminPredictivoService predictivo,
        AlertasInteligentesService alertasInteligentes,
        ReporteGeocodingService geocoding)
    {
        _context = context;
        _redis = redis;
        _ml = ml;
        _config = config;
        _external = external;
        _predictivo = predictivo;
        _alertasInteligentes = alertasInteligentes;
        _geocoding = geocoding;
    }

    /// <summary>Predicciones ML.NET por zona (tendencia 7d vs semana anterior).</summary>
    [HttpGet("predicciones")]
    public async Task<IActionResult> GetPredicciones(
        [FromQuery] int take = 6,
        CancellationToken ct = default)
    {
        var cacheKey = $"admin:predicciones:v1:{Math.Clamp(take, 1, 12)}";
        if (_redis.IsEnabled)
        {
            var cached = await _redis.GetStringAsync(cacheKey);
            if (cached != null)
            {
                var parsed = ApiJson.Deserialize<List<PrediccionZonaDto>>(cached);
                if (parsed != null)
                {
                    return Ok(new
                    {
                        cacheRedisActivo = true,
                        servidoDesdeCache = true,
                        predicciones = parsed,
                    });
                }
            }
        }

        var list = await _predictivo.GetPrediccionesAsync(take, ct);
        if (_redis.IsEnabled)
        {
            await _redis.SetStringAsync(
                cacheKey,
                ApiJson.Serialize(list),
                TimeSpan.FromMinutes(5));
        }

        return Ok(new
        {
            cacheRedisActivo = _redis.IsEnabled,
            servidoDesdeCache = false,
            predicciones = list,
        });
    }

    /// <summary>Estado de notificaciones push (FCM / webhook).</summary>
    [HttpGet("push-estado")]
    public IActionResult GetPushEstado()
    {
        var fcm = !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("FIREBASE_SERVER_KEY"))
            || !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("FCM_SERVER_KEY"));
        return Ok(new
        {
            fcmConfigurado = fcm,
            fcmTopic = Environment.GetEnvironmentVariable("FCM_TOPIC") ?? "rutasegura-alertas",
            mensaje = fcm
                ? "Firebase Cloud Messaging listo (clave en .env)."
                : "Sin FCM: configure FIREBASE_SERVER_KEY o webhook PushNotificacionUrl en admin.",
        });
    }

    /// <summary>Estado de Redis para el panel admin (caché corta).</summary>
    [HttpGet("redis-estado")]
    public async Task<IActionResult> GetRedisEstado(CancellationToken ct)
    {
        var cacheKey = AdminCacheKeys.RedisEstado;

        if (_redis.IsEnabled)
        {
            var cached = await _redis.GetStringAsync(cacheKey);
            if (cached != null)
            {
                var parsed = ApiJson.Deserialize<RedisEstadoDto>(cached);
                if (parsed != null)
                {
                    return Ok(
                        new
                        {
                            parsed.Habilitado,
                            parsed.Mensaje,
                            parsed.ClavesCacheAdmin,
                            servidoDesdeCache = true,
                        });
                }
            }
        }

        var dto = new RedisEstadoDto(
            _redis.IsEnabled,
            _redis.GetStatusMessage(),
            _redis.IsEnabled ? await ContarClavesAdminAsync() : 0,
            false);

        if (_redis.IsEnabled)
        {
            await _redis.SetStringAsync(
                cacheKey,
                ApiJson.Serialize(dto),
                TimeSpan.FromSeconds(30));
        }

        return Ok(dto);
    }

    /// <summary>Resumen del dashboard con ML.NET en zonas y caché Redis.</summary>
    [HttpGet("resumen")]
    public async Task<IActionResult> GetResumen(CancellationToken ct)
    {
        var cacheKey = AdminCacheKeys.Resumen;
        if (_redis.IsEnabled)
        {
            var cached = await _redis.GetStringAsync(cacheKey);
            if (cached != null)
            {
                var parsed = ApiJson.Deserialize<object>(cached);
                if (parsed != null)
                {
                    return Ok(
                        new Dictionary<string, object?>
                        {
                            ["cacheRedisActivo"] = true,
                            ["servidoDesdeCache"] = true,
                            ["datos"] = parsed,
                        });
                }
            }
        }

        await _ml.EnsureModelsAsync(ct);

        var now = DateTime.UtcNow;
        var hoy = now.Date;
        var inicio7d = hoy.AddDays(-6);
        var fin7d = hoy.AddDays(1);
        var inicio14d = hoy.AddDays(-13);
        var finAnterior7d = hoy.AddDays(-6);

        var usuariosActivos = await _context.Usuarios
            .AsNoTracking()
            .CountAsync(u => u.Estado == "Activo", ct);
        var reportesPendientes = await _context.Reportes
            .AsNoTracking()
            .CountAsync(r => r.Estado == "Pendiente", ct);

        var regEstaSemana = await _context.Usuarios.CountAsync(
            u => u.FechaRegistro >= inicio7d && u.FechaRegistro < fin7d, ct);
        var regAnterior = await _context.Usuarios.CountAsync(
            u => u.FechaRegistro >= inicio14d && u.FechaRegistro < finAnterior7d, ct);
        var deltaUsuarios = DeltaPct(regEstaSemana, regAnterior);

        var ruta7d = await _context.RutasHistorial.CountAsync(
            r => r.CreadoEn >= inicio7d && r.CreadoEn < fin7d, ct);
        var rutaAnt = await _context.RutasHistorial.CountAsync(
            r => r.CreadoEn >= inicio14d && r.CreadoEn < finAnterior7d, ct);
        var deltaRutas = DeltaPct(ruta7d, rutaAnt);

        var rep7d = await _context.Reportes.CountAsync(
            r => r.FechaReporte >= inicio7d && r.FechaReporte < fin7d, ct);
        var repAnt = await _context.Reportes.CountAsync(
            r => r.FechaReporte >= inicio14d && r.FechaReporte < finAnterior7d, ct);
        var deltaReportes = DeltaPct(rep7d, repAnt);

        var pend7d = await _context.Reportes.CountAsync(
            r => r.Estado == "Pendiente" && r.FechaReporte >= inicio7d && r.FechaReporte < fin7d, ct);
        var pendSemAnt = await _context.Reportes.CountAsync(
            r => r.Estado == "Pendiente" && r.FechaReporte >= inicio14d
                && r.FechaReporte < finAnterior7d, ct);
        var deltaPendientes = DeltaPct(pend7d, pendSemAnt);

        var alertas7d = await _context.AlertasSistema.CountAsync(
            a => a.CreadaEn >= inicio7d && a.CreadaEn < fin7d, ct);
        var alertasAnt = await _context.AlertasSistema.CountAsync(
            a => a.CreadaEn >= inicio14d && a.CreadaEn < finAnterior7d, ct);
        var deltaAlertas = DeltaPct(alertas7d, alertasAnt);

        var reportesRango = await _context.Reportes
            .AsNoTracking()
            .Where(r => r.FechaReporte >= inicio7d && r.FechaReporte < fin7d)
            .Select(r => r.FechaReporte)
            .ToListAsync(ct);

        var porDia = new List<object>();
        for (var d = 0; d < 7; d++)
        {
            var day = inicio7d.AddDays(d);
            var dayEnd = day.AddDays(1);
            var n = reportesRango.Count(t => t >= day && t < dayEnd);
            porDia.Add(new { fecha = day, reportes = n });
        }

        var desde7dR = inicio7d;
        var topZonas = await _context.Reportes
            .AsNoTracking()
            .Where(r => r.FechaReporte >= desde7dR)
            .GroupBy(r => r.Ubicacion)
            .Select(
                g => new
                {
                    ubicacion = g.Key,
                    cnt = g.Count(),
                    avgIa = g.Average(x => (double)x.NivelConfianzaIA),
                })
            .OrderByDescending(x => x.cnt)
            .ThenByDescending(x => x.avgIa)
            .Take(5)
            .ToListAsync(ct);

        var hora = (float)now.Hour;
        var riesgo = new List<object>();
        foreach (var z in topZonas)
        {
            var pct = (int)Math.Clamp(Math.Round(z.avgIa * 100.0 * 0.6 + z.cnt * 5.0), 0, 99);
            var mlZona = _ml.ClassifyZoneSafety(
                Math.Min(z.cnt / 15f, 1f),
                0.45f,
                z.avgIa > 0.5 ? 0.35f : 0.65f,
                hora);
            var display = ZoneSafetyPresentation.ToDisplay(mlZona.Nivel, mlZona.ConfianzaPct);
            riesgo.Add(
                new
                {
                    titulo = z.ubicacion,
                    riesgoPorcentaje = pct,
                    horarioSugerido = SuggestedHorario(z.cnt),
                    nivelZonaMl = display.Etiqueta,
                    indicadorZona = display.IndicadorVisual,
                    reportesEnZona = z.cnt,
                    confianzaMlPct = mlZona.ConfianzaPct,
                });
        }

        var payload = new
        {
            usuariosActivos,
            reportesPendientes,
            rutasConsultadas7Dias = ruta7d,
            alertasEmitidas7Dias = alertas7d,
            deltas = new
            {
                usuariosRegistradosSemana = deltaUsuarios,
                reportesCreadosSemana = deltaReportes,
                rutasConsultadasSemana = deltaRutas,
                reportesPendientesVsDia = deltaPendientes,
                alertasSemana = deltaAlertas,
            },
            volumenPorDia = porDia,
            zonasRiesgo = riesgo,
            mlZonasActivo = _ml.ZoneSafetyReady,
        };

        if (_redis.IsEnabled)
        {
            await _redis.SetStringAsync(
                cacheKey,
                ApiJson.Serialize(payload),
                TimeSpan.FromMinutes(3));
        }

        return Ok(
            new
            {
                cacheRedisActivo = _redis.IsEnabled,
                servidoDesdeCache = false,
                datos = payload,
            });
    }

    [HttpGet("puntos-mapa")]
    public async Task<IActionResult> GetPuntosMapa(
        [FromQuery] int maxDias = 30,
        CancellationToken ct = default)
    {
        var d = Math.Clamp(maxDias, 1, 365);
        var cfg = await _config.GetAsync(ct);
        var desde = DateTime.UtcNow.AddDays(-d);

        // Reportes viejos sin GPS: intentar geocodificar por dirección (máx. 10 por carga).
        var sinCoords = await _context.Reportes
            .Where(r =>
                r.FechaReporte >= desde
                && (r.Latitud == null || r.Latitud == "" || r.Longitud == null || r.Longitud == "")
                && r.Ubicacion != null
                && r.Ubicacion != "")
            .OrderByDescending(r => r.FechaReporte)
            .Take(10)
            .ToListAsync(ct);

        var coordsActualizadas = false;
        foreach (var r in sinCoords)
        {
            if (await _geocoding.EnsureCoordinatesAsync(r, ct))
                coordsActualizadas = true;
        }

        if (coordsActualizadas)
            await _context.SaveChangesAsync(ct);

        var list = await _context.Reportes
            .AsNoTracking()
            .Where(r => r.FechaReporte >= desde
                && r.Latitud != null
                && r.Longitud != null
                && r.Latitud != ""
                && r.Longitud != "")
            .Select(
                r => new
                {
                    r.Id,
                    r.TipoIncidente,
                    r.Ubicacion,
                    r.Descripcion,
                    r.Latitud,
                    r.Longitud,
                    r.Estado,
                    r.FechaReporte,
                })
            .ToListAsync(ct);

        var result = new List<object>();
        foreach (var r in list)
        {
            if (double.TryParse(
                    r.Latitud?.Replace(',', '.'),
                    System.Globalization.NumberStyles.Any,
                    System.Globalization.CultureInfo.InvariantCulture,
                    out var la)
                && double.TryParse(
                    r.Longitud?.Replace(',', '.'),
                    System.Globalization.NumberStyles.Any,
                    System.Globalization.CultureInfo.InvariantCulture,
                    out var lo))
            {
                var esMenor = SistemaConfigService.EsReporteMenor(
                    r.FechaReporte,
                    cfg.CaducidadReporteMenorHoras);
                result.Add(
                    new
                    {
                        r.Id,
                        r.TipoIncidente,
                        ubicacion = r.Ubicacion ?? "",
                        descripcion = r.Descripcion,
                        lat = la,
                        lng = lo,
                        r.Estado,
                        fechaReporte = r.FechaReporte,
                        esReporteMenor = esMenor,
                        etiquetaReciente = esMenor
                            ? $"Reciente (< {cfg.CaducidadReporteMenorHoras} h)"
                            : null,
                    });
            }
        }

        return Ok(
            new
            {
                cacheRedisActivo = _redis.IsEnabled,
                servidoDesdeCache = false,
                puntos = result,
            });
    }

    [HttpGet("alertas")]
    public async Task<IActionResult> GetAlertas(CancellationToken ct)
    {
        var cacheKey = AdminCacheKeys.Alertas;
        if (_redis.IsEnabled)
        {
            var cached = await _redis.GetStringAsync(cacheKey);
            if (cached != null)
            {
                var parsed = ApiJson.Deserialize<List<AlertaSistema>>(cached);
                if (parsed != null)
                {
                    return Ok(
                        new
                        {
                            cacheRedisActivo = true,
                            servidoDesdeCache = true,
                            alertas = parsed,
                        });
                }
            }
        }

        var data = await _context.AlertasSistema
            .AsNoTracking()
            .OrderByDescending(a => a.CreadaEn)
            .Take(100)
            .ToListAsync(ct);

        if (_redis.IsEnabled)
        {
            await _redis.SetStringAsync(
                cacheKey,
                ApiJson.Serialize(data),
                TimeSpan.FromMinutes(2));
        }

        return Ok(
            new
            {
                cacheRedisActivo = _redis.IsEnabled,
                servidoDesdeCache = false,
                alertas = data,
            });
    }

    [HttpPost("alertas/generar")]
    public async Task<IActionResult> GenerarAlertasPreventivas(CancellationToken ct)
    {
        await _ml.EnsureModelsAsync(ct);
        var inicio7d = DateTime.UtcNow.Date.AddDays(-7);
        var top = await _context.Reportes
            .AsNoTracking()
            .Where(r => r.FechaReporte >= inicio7d)
            .GroupBy(r => r.Ubicacion)
            .Select(
                g => new
                {
                    ubic = g.Key,
                    cnt = g.Count(),
                    avgIa = g.Average(x => (double)x.NivelConfianzaIA),
                })
            .OrderByDescending(x => x.cnt)
            .Take(3)
            .ToListAsync(ct);

        if (top.Count == 0)
        {
            return Ok(
                new
                {
                    creadas = 0,
                    message = "No hay reportes recientes para generar predicción.",
                    cacheInvalidado = _redis.IsEnabled,
                });
        }

        var predicciones = await _predictivo.GetPrediccionesAsync(8, ct);
        var hora = (float)DateTime.UtcNow.Hour;
        var pushCount = 0;

        foreach (var t in top)
        {
            var pred = predicciones.FirstOrDefault(p =>
                string.Equals(p.Ubicacion.Trim(), t.ubic.Trim(), StringComparison.OrdinalIgnoreCase));

            var mlZona = _ml.ClassifyZoneSafety(
                Math.Min(t.cnt / 15f, 1f),
                0.5f,
                0.5f,
                hora);
            var display = ZoneSafetyPresentation.ToDisplay(mlZona.Nivel, mlZona.ConfianzaPct);
            var riesgo = pred?.RiesgoPredichoPct
                ?? (int)Math.Clamp(
                    Math.Round(mlZona.ConfianzaPct * 0.5 + t.cnt * 4.0),
                    0,
                    99);

            var titulo = pred?.MensajePredictivo.StartsWith('⚠') == true
                ? pred.MensajePredictivo
                : AdminPredictivoService.ConstruirMensaje(
                    t.ubic,
                    t.cnt,
                    pred?.ReportesSemanaAnterior ?? 0,
                    pred?.DeltaPct ?? 0,
                    pred?.TipoIncidenteDominante ?? "Varios",
                    display.Etiqueta);

            var detalle =
                $"{display.IndicadorVisual} ML.NET zona «{display.Etiqueta}» · {t.cnt} reporte(s) · confianza IA media {(int)(t.avgIa * 100)}%. "
                + (pred != null
                    ? $"Tendencia: {pred.DeltaPct:+0.#;-0.#}% vs semana anterior."
                    : "");

            pushCount += await _alertasInteligentes.CrearAlertaConPushAsync(
                titulo.Length > 200 ? titulo[..197] + "…" : titulo,
                detalle,
                t.ubic,
                riesgo,
                "Auto+ML",
                ct);
        }

        return Ok(
            new
            {
                creadas = pushCount,
                pushIntentados = top.Count,
                message = "Alertas preventivas generadas (ML.NET + Redis + push si FCM/webhook configurado).",
                cacheInvalidado = _redis.IsEnabled,
            });
    }

    /// <summary>Análisis ML.NET de un reporte pendiente (clasificación + zona).</summary>
    [HttpGet("reportes/{id:int}/analisis-ml")]
    public async Task<IActionResult> AnalisisReporteMl(int id, CancellationToken ct)
    {
        await _ml.EnsureModelsAsync(ct);
        var r = await _context.Reportes.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (r == null) return NotFound();

        var hasCoords =
            !string.IsNullOrWhiteSpace(r.Latitud) && !string.IsNullOrWhiteSpace(r.Longitud);
        var clasif = _ml.ClassifyIncident(
            r.Descripcion,
            r.Ubicacion,
            hasCoords,
            r.FechaReporte);

        var reportesZona = await _context.Reportes.CountAsync(
            rep => rep.Ubicacion == r.Ubicacion && rep.FechaReporte >= DateTime.UtcNow.AddDays(-30),
            ct);
        var mlZona = _ml.ClassifyZoneSafety(
            Math.Min(reportesZona / 15f, 1f),
            0.5f,
            r.TipoIncidente.Contains("ZonaOscura", StringComparison.OrdinalIgnoreCase) ? 0.25f : 0.6f,
            (float)r.FechaReporte.Hour);
        var zonaDisplay = ZoneSafetyPresentation.ToDisplay(mlZona.Nivel, mlZona.ConfianzaPct);

        var coincideTipo = clasif != null
            && string.Equals(clasif.TipoPredicho, r.TipoIncidente, StringComparison.OrdinalIgnoreCase);

        return Ok(
            new
            {
                reporteId = r.Id,
                tipoDeclarado = r.TipoIncidente,
                nivelConfianzaIaGuardado = r.NivelConfianzaIA,
                clasificacion = clasif == null
                    ? null
                    : new
                    {
                        clasif.TipoPredicho,
                        clasif.ConfianzaPct,
                        coincideConDeclarado = coincideTipo,
                        clasif.ProbabilidadesPorTipo,
                    },
                zona = new
                {
                    zonaDisplay.IndicadorVisual,
                    zonaDisplay.Etiqueta,
                    mlZona.ConfianzaPct,
                    reportesZona30d = reportesZona,
                },
                sugerencia = coincideTipo && r.NivelConfianzaIA >= 70
                    ? "Alta confianza: candidato a auto-aprobación."
                    : "Revisar manualmente antes de aprobar.",
            });
    }

    /// <summary>Aprueba pendientes con confianza IA ≥ umbral de configuración.</summary>
    [HttpPost("reportes/auto-aprobar")]
    public async Task<IActionResult> AutoAprobarReportes(CancellationToken ct)
    {
        var cfg = await _context.ConfiguracionSistema.AsNoTracking().FirstOrDefaultAsync(ct)
            ?? new ConfiguracionSistema();
        var umbral = cfg.AutoAprobarConfianzaMinPct;

        var pendientes = await _context.Reportes
            .Where(r => r.Estado == "Pendiente" && r.NivelConfianzaIA >= umbral)
            .ToListAsync(ct);

        foreach (var r in pendientes)
            r.Estado = "Aprobado";

        await _context.SaveChangesAsync(ct);

        if (pendientes.Count > 0)
            await AdminCacheKeys.InvalidateAllAsync(_redis);

        return Ok(
            new
            {
                aprobados = pendientes.Count,
                umbralPct = umbral,
                message = pendientes.Count > 0
                    ? $"Se aprobaron {pendientes.Count} reporte(s) con IA ≥ {umbral}%."
                    : $"Ningún pendiente supera el umbral ({umbral}%).",
                cacheInvalidado = _redis.IsEnabled && pendientes.Count > 0,
            });
    }

    /// <summary>Resumen de alertas y eventos de riesgo (7 días) para Configuración admin.</summary>
    [HttpGet("alertas-riesgo/resumen")]
    public async Task<IActionResult> GetAlertasRiesgoResumen(CancellationToken ct)
    {
        var cfg = await _config.GetAsync(ct);
        var desde = DateTime.UtcNow.AddDays(-7);
        var alertas = await _context.AlertasSistema
            .AsNoTracking()
            .Where(a => a.CreadaEn >= desde)
            .OrderByDescending(a => a.CreadaEn)
            .ToListAsync(ct);

        static bool EsSos(AlertaSistema a) =>
            a.Titulo.Contains("SOS", StringComparison.OrdinalIgnoreCase)
            || (a.Prioridad == "alta" && a.Origen == "Usuario");

        static bool EsLlegueBien(AlertaSistema a) =>
            a.Titulo.Contains("llegó bien", StringComparison.OrdinalIgnoreCase)
            || a.Titulo.Contains("llego bien", StringComparison.OrdinalIgnoreCase);

        var resumen = new
        {
            total = alertas.Count,
            alta = alertas.Count(a => a.Prioridad == "alta"),
            media = alertas.Count(a => a.Prioridad == "media"),
            baja = alertas.Count(a => a.Prioridad == "baja"),
            preventivasMl = alertas.Count(
                a => a.Origen.Contains("Auto", StringComparison.OrdinalIgnoreCase)),
            sos = alertas.Count(EsSos),
            llegueBien = alertas.Count(EsLlegueBien),
            desdeUtc = desde,
        };

        var ultimas = alertas
            .Take(5)
            .Select(
                a => new
                {
                    a.Id,
                    a.Titulo,
                    a.Prioridad,
                    a.Origen,
                    a.RiesgoEstimadoPct,
                    a.CreadaEn,
                })
            .ToList();

        return Ok(
            new
            {
                umbralRiesgoAlertaAltaPct = cfg.UmbralRiesgoAlertaAltaPct,
                umbralRiesgoAlertaMediaPct = cfg.UmbralRiesgoAlertaMediaPct,
                resumen7d = resumen,
                ultimas,
            });
    }

    [HttpGet("configuracion")]
    public async Task<IActionResult> GetConfiguracion(CancellationToken ct)
    {
        var cacheKey = AdminCacheKeys.Config;
        if (_redis.IsEnabled)
        {
            var cached = await _redis.GetStringAsync(cacheKey);
            if (cached != null)
            {
                var parsed = ApiJson.Deserialize<object>(cached);
                if (parsed != null)
                {
                    return Ok(
                        new
                        {
                            cacheRedisActivo = true,
                            servidoDesdeCache = true,
                            datos = parsed,
                        });
                }
            }
        }

        var row = await EnsureConfigRowAsync(ct);
        var datos = MapConfig(row);

        if (_redis.IsEnabled)
        {
            await _redis.SetStringAsync(
                cacheKey,
                ApiJson.Serialize(datos),
                TimeSpan.FromMinutes(10));
        }

        return Ok(
            new
            {
                cacheRedisActivo = _redis.IsEnabled,
                servidoDesdeCache = false,
                datos,
            });
    }

    public class PutConfigRequest
    {
        [Range(0, 100)]
        public int? PesoZonasOscurasPct { get; set; }
        [Range(1, 168)]
        public int? CaducidadReporteMenorHoras { get; set; }
        [Range(50, 100)]
        public int? AutoAprobarConfianzaMinPct { get; set; }
        [MaxLength(500)]
        public string? PushNotificacionUrl { get; set; }
        [MaxLength(2000)]
        public string? GoogleMapsKeyAlmacenada { get; set; }
        [Range(1, 100)]
        public int? UmbralRiesgoAlertaAltaPct { get; set; }
        [Range(1, 99)]
        public int? UmbralRiesgoAlertaMediaPct { get; set; }
    }

    [HttpPut("configuracion")]
    public async Task<IActionResult> PutConfiguracion(
        [FromBody] PutConfigRequest? body,
        CancellationToken ct)
    {
        if (body == null) return BadRequest();
        var row = await _context.ConfiguracionSistema.FirstOrDefaultAsync(ct)
            ?? await EnsureConfigRowAsync(ct);

        if (body.PesoZonasOscurasPct is { } a) row.PesoZonasOscurasPct = a;
        if (body.CaducidadReporteMenorHoras is { } b) row.CaducidadReporteMenorHoras = b;
        if (body.AutoAprobarConfianzaMinPct is { } c) row.AutoAprobarConfianzaMinPct = c;
        if (body.PushNotificacionUrl != null) row.PushNotificacionUrl = body.PushNotificacionUrl;
        if (body.GoogleMapsKeyAlmacenada != null)
            row.GoogleMapsKeyAlmacenada = string.IsNullOrWhiteSpace(body.GoogleMapsKeyAlmacenada)
                ? null
                : body.GoogleMapsKeyAlmacenada.Trim();
        if (body.UmbralRiesgoAlertaAltaPct is { } alta)
            row.UmbralRiesgoAlertaAltaPct = Math.Clamp(alta, 1, 100);
        if (body.UmbralRiesgoAlertaMediaPct is { } media)
            row.UmbralRiesgoAlertaMediaPct = Math.Clamp(
                media,
                1,
                Math.Max(1, row.UmbralRiesgoAlertaAltaPct - 1));

        await _context.SaveChangesAsync(ct);
        if (_redis.IsEnabled)
        {
            await _redis.RemoveAsync(AdminCacheKeys.Config);
            await _config.InvalidarCachésDependientesAsync(_redis);
        }

        return Ok(
            new
            {
                message = "Política de alertas y riesgo guardada.",
                datos = MapConfig(row),
                cacheInvalidado = _redis.IsEnabled,
            });
    }

    /// <summary>Fuerza recarga de datos en mapa, alertas y panel admin (Redis).</summary>
    [HttpPost("cache/limpiar")]
    public async Task<IActionResult> LimpiarCache(CancellationToken ct)
    {
        if (_redis.IsEnabled)
        {
            await _config.InvalidarCachésDependientesAsync(_redis);
            await AdminCacheKeys.InvalidateAllAsync(_redis);
        }

        return Ok(
            new
            {
                message = _redis.IsEnabled
                    ? "Caché Redis limpiada. Los próximos datos saldrán de SQLite."
                    : "Redis no está activo; no hay caché que limpiar.",
                redisActivo = _redis.IsEnabled,
            });
    }

    [HttpGet("db-health")]
    [AllowAnonymous]
    public async Task<IActionResult> GetDbHealth(CancellationToken ct)
    {
        try
        {
            var can = await _context.Database.CanConnectAsync(ct);
            return Ok(
                new
                {
                    ok = can,
                    message = can ? "Conexión a SQLite correcta" : "No se pudo conectar",
                    redis = new
                    {
                        habilitado = _redis.IsEnabled,
                        configurado = _redis.IsConfigured,
                        message = _redis.GetStatusMessage(),
                        clavesAdmin = _redis.IsEnabled ? await ContarClavesAdminAsync() : 0,
                    },
                });
        }
        catch (Exception ex)
        {
            return Ok(
                new
                {
                    ok = false,
                    message = ex.Message,
                    redis = new { habilitado = _redis.IsEnabled, message = ex.Message },
                });
        }
    }

    /// <summary>Motor predictivo: correlación reportes nocturnos + clima actual (WeatherAPI).</summary>
    [HttpGet("analisis-clima-incidentes")]
    public async Task<IActionResult> AnalisisClimaIncidentes(CancellationToken ct)
    {
        var reportes = await _context.Reportes.AsNoTracking().ToListAsync(ct);
        var total = reportes.Count;
        var nocturnos = reportes.Count(r =>
        {
            var h = r.FechaReporte.AddHours(-5).Hour;
            return h >= 22 || h < 6;
        });
        var tiposNocturnos = reportes
            .Where(r =>
            {
                var h = r.FechaReporte.AddHours(-5).Hour;
                return h >= 22 || h < 6;
            })
            .GroupBy(r => r.TipoIncidente)
            .Select(g => new { tipo = g.Key, cantidad = g.Count() })
            .OrderByDescending(x => x.cantidad)
            .Take(5)
            .ToList();

        var porHora = Enumerable.Range(0, 24)
            .Select(h => new
            {
                hora = $"{h:00}:00",
                reportes = reportes.Count(r => r.FechaReporte.AddHours(-5).Hour == h),
            })
            .ToList();

        var ctx = await _external.GetClimaContextoAsync(-12.0464, -77.0428, null, ct);
        var pctNocturno = total > 0 ? Math.Round(nocturnos * 100.0 / total, 1) : 0;
        var climaAdverso = ctx.Impacto.CondicionClima >= 0.35f;

        var insight =
            total == 0
                ? "Sin reportes aún. Con clima adverso el motor elevará riesgo preventivamente."
                : pctNocturno >= 45
                    ? $"El {pctNocturno}% de incidentes ocurren de noche (22:00–06:00). "
                      + (climaAdverso
                          ? $"Hoy hay {ctx.Clima.Descripcion.ToLowerInvariant()}: ML.NET incrementa CondicionClima y prioriza rutas seguras."
                          : "Patrón compatible con mayor riesgo en lluvias nocturnas cuando el clima empeora.")
                    : $"El {pctNocturno}% de reportes son nocturnos. "
                      + (climaAdverso
                          ? "Clima adverso activo: reforzar alertas en zonas oscuras."
                          : "Clima actual favorable para movilidad urbana.");

        return Ok(new
        {
            totalReportes = total,
            reportesNocturnos = nocturnos,
            porcentajeNocturno = pctNocturno,
            tiposEnHorarioNocturno = tiposNocturnos,
            distribucionPorHora = porHora,
            climaActual = ctx.Clima,
            climaImpacto = ctx.Impacto,
            motorPredictivo = new
            {
                titulo = "Correlación clima · incidentes nocturnos",
                insight,
                recomendacionAdmin = climaAdverso
                    ? "Revisar mapa de calor y alertas en distritos con reportes nocturnos + lluvia."
                    : "Monitorear franjas 20:00–23:00 donde concentran los reportes.",
            },
        });
    }

    private async Task<ConfiguracionSistema> EnsureConfigRowAsync(CancellationToken ct)
    {
        var row = await _context.ConfiguracionSistema.FirstOrDefaultAsync(ct);
        if (row != null) return row;
        row = new ConfiguracionSistema { Id = 1 };
        _context.ConfiguracionSistema.Add(row);
        await _context.SaveChangesAsync(ct);
        return row;
    }

    private static object MapConfig(ConfiguracionSistema row) =>
        new
        {
            row.Id,
            row.PesoZonasOscurasPct,
            row.CaducidadReporteMenorHoras,
            row.AutoAprobarConfianzaMinPct,
            row.UmbralRiesgoAlertaAltaPct,
            row.UmbralRiesgoAlertaMediaPct,
            row.PushNotificacionUrl,
            hasGoogleKey = !string.IsNullOrEmpty(row.GoogleMapsKeyAlmacenada),
        };

    private async Task<int> ContarClavesAdminAsync()
    {
        if (!_redis.IsEnabled) return 0;
        var keys = new[]
        {
            AdminCacheKeys.Resumen,
            AdminCacheKeys.Alertas,
            AdminCacheKeys.Config,
            AdminCacheKeys.RedisEstado,
            AdminCacheKeys.PuntosMapa(60),
            AdminCacheKeys.PuntosMapa(30),
        };
        var n = 0;
        foreach (var k in keys)
        {
            if (await _redis.GetStringAsync(k) != null)
                n++;
        }

        return n;
    }

    private static int DeltaPct(int ahora, int anterior)
    {
        if (anterior <= 0) return ahora > 0 ? 100 : 0;
        return (int)Math.Round((ahora - (double)anterior) * 100.0 / anterior);
    }

    private static string SuggestedHorario(int conteo)
    {
        if (conteo >= 8) return "Horario crítico: 18:00 - 23:00";
        if (conteo >= 4) return "Horario crítico: 20:00 - 23:00";
        if (conteo >= 2) return "Concentración de reportes: revisar de tarde a noche";
        return "Horario crítico: Todo el día (baja frecuencia de datos)";
    }
}

public record RedisEstadoDto(
    bool Habilitado,
    string Mensaje,
    int ClavesCacheAdmin,
    bool ServidoDesdeCache);
