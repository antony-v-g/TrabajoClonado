using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RutaSegura.Data;
using RutaSegura.Models;
using RutaSegura.Services;

namespace RutaSegura.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AdminController : ControllerBase
    {
        private readonly ApplicationDbContext _context;

        public AdminController(ApplicationDbContext context)
        {
            _context = context;
        }

        /// <summary>Resumen del dashboard, gráfico 7 días y zonas de riesgo (desde reportes reales).</summary>
        [HttpGet("resumen")]
        public async Task<IActionResult> GetResumen()
        {
            var now = DateTime.UtcNow;
            var hoy = now.Date;
            var inicio7d = hoy.AddDays(-6);
            var fin7d = hoy.AddDays(1);
            var inicio14d = hoy.AddDays(-13);
            var finAnterior7d = hoy.AddDays(-6);

            var usuariosActivos = await _context.Usuarios
                .AsNoTracking()
                .CountAsync(u => u.Estado == "Activo");
            var reportesPendientes = await _context.Reportes
                .AsNoTracking()
                .CountAsync(r => r.Estado == "Pendiente");

            var regEstaSemana = await _context.Usuarios.CountAsync(
                u => u.FechaRegistro >= inicio7d && u.FechaRegistro < fin7d);
            var regAnterior = await _context.Usuarios.CountAsync(
                u => u.FechaRegistro >= inicio14d && u.FechaRegistro < finAnterior7d);
            var deltaUsuarios = DeltaPct(regEstaSemana, regAnterior);

            var ruta7d = await _context.RutasHistorial.CountAsync(
                r => r.CreadoEn >= inicio7d && r.CreadoEn < fin7d);
            var rutaAnt = await _context.RutasHistorial.CountAsync(
                r => r.CreadoEn >= inicio14d && r.CreadoEn < finAnterior7d);
            var deltaRutas = DeltaPct(ruta7d, rutaAnt);

            var rep7d = await _context.Reportes.CountAsync(
                r => r.FechaReporte >= inicio7d && r.FechaReporte < fin7d);
            var repAnt = await _context.Reportes.CountAsync(
                r => r.FechaReporte >= inicio14d && r.FechaReporte < finAnterior7d);
            var deltaReportes = DeltaPct(rep7d, repAnt);

            var pend7d = await _context.Reportes.CountAsync(
                r => r.Estado == "Pendiente" && r.FechaReporte >= inicio7d && r.FechaReporte < fin7d);
            var pendSemAnt = await _context.Reportes.CountAsync(
                r => r.Estado == "Pendiente" && r.FechaReporte >= inicio14d
                    && r.FechaReporte < finAnterior7d);
            var deltaPendientes = DeltaPct(pend7d, pendSemAnt);

            var alertas7d = await _context.AlertasSistema.CountAsync(
                a => a.CreadaEn >= inicio7d && a.CreadaEn < fin7d);
            var alertasAnt = await _context.AlertasSistema.CountAsync(
                a => a.CreadaEn >= inicio14d && a.CreadaEn < finAnterior7d);
            var deltaAlertas = DeltaPct(alertas7d, alertasAnt);

            var reportesRango = await _context.Reportes
                .AsNoTracking()
                .Where(r => r.FechaReporte >= inicio7d && r.FechaReporte < fin7d)
                .Select(r => r.FechaReporte)
                .ToListAsync();

            var porDia = new List<object>();
            for (var d = 0; d < 7; d++)
            {
                var day = inicio7d.AddDays(d);
                var dayEnd = day.AddDays(1);
                var n = reportesRango.Count(t => t >= day && t < dayEnd);
                porDia.Add(
                    new
                    {
                        fecha = day,
                        reportes = n,
                    });
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
                .ToListAsync();

            var riesgo = new List<object>();
            foreach (var z in topZonas)
            {
                var pct = (int)Math.Clamp(Math.Round(z.avgIa * 100.0 * 0.6 + z.cnt * 5.0), 0, 99);
                riesgo.Add(
                    new
                    {
                        titulo = z.ubicacion,
                        riesgoPorcentaje = pct,
                        horarioSugerido = SuggestedHorario(z.cnt),
                    });
            }

            return Ok(
                new
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
                });
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

        [HttpGet("puntos-mapa")]
        public async Task<IActionResult> GetPuntosMapa(
            [FromQuery] int maxDias = 30)
        {
            var d = Math.Clamp(maxDias, 1, 365);
            var desde = DateTime.UtcNow.AddDays(-d);
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
                        r.Latitud,
                        r.Longitud,
                        r.Estado,
                    })
                .ToListAsync();

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
                    result.Add(
                        new
                        {
                            r.Id,
                            r.TipoIncidente,
                            lat = la,
                            lng = lo,
                            r.Estado,
                        });
                }
            }

            return Ok(result);
        }

        [HttpGet("alertas")]
        public async Task<IActionResult> GetAlertas()
        {
            var data = await _context.AlertasSistema
                .AsNoTracking()
                .OrderByDescending(a => a.CreadaEn)
                .Take(100)
                .ToListAsync();
            return Ok(data);
        }

        [HttpPost("alertas/generar")]
        public async Task<IActionResult> GenerarAlertasPreventivas()
        {
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
                .ToListAsync();

            if (top.Count == 0)
            {
                return Ok(
                    new
                    {
                        creadas = 0,
                        message = "No hay reportes recientes para generar predicción.",
                    });
            }

            var ahora = DateTime.UtcNow;
            foreach (var t in top)
            {
                var riesgo = (int)Math.Clamp(Math.Round(t.avgIa * 100.0 * 0.5 + t.cnt * 4.0), 0, 99);
                _context.AlertasSistema.Add(
                    new AlertaSistema
                    {
                        Titulo = $"Riesgo elevado: {t.ubic}",
                        Detalle = $"Agrupación de {t.cnt} reporte(s) con confianza media IA aprox. {(int)(t.avgIa * 100)}%.",
                        Prioridad = riesgo > 80 ? "alta" : riesgo > 50 ? "media" : "baja",
                        Origen = "Auto",
                        UbicacionRef = t.ubic,
                        RiesgoEstimadoPct = riesgo,
                        CreadaEn = ahora,
                    });
            }

            await _context.SaveChangesAsync();
            return Ok(new { creadas = top.Count, message = "Alertas preventivas generadas y guardadas." });
        }

        [HttpGet("configuracion")]
        public async Task<IActionResult> GetConfiguracion()
        {
            var row = await _context.ConfiguracionSistema.AsNoTracking().FirstOrDefaultAsync();
            if (row == null)
            {
                row = new ConfiguracionSistema { Id = 1 };
                _context.ConfiguracionSistema.Add(row);
                await _context.SaveChangesAsync();
            }

            return Ok(
                new
                {
                    row.Id,
                    row.PesoZonasOscurasPct,
                    row.CaducidadReporteMenorHoras,
                    row.AutoAprobarConfianzaMinPct,
                    row.PushNotificacionUrl,
                    hasGoogleKey = !string.IsNullOrEmpty(row.GoogleMapsKeyAlmacenada),
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
        }

        [HttpPut("configuracion")]
        public async Task<IActionResult> PutConfiguracion([FromBody] PutConfigRequest? body)
        {
            if (body == null) return BadRequest();
            var row = await _context.ConfiguracionSistema.FirstOrDefaultAsync();
            if (row == null)
            {
                row = new ConfiguracionSistema { Id = 1 };
                _context.ConfiguracionSistema.Add(row);
            }

            if (body.PesoZonasOscurasPct is { } a) row.PesoZonasOscurasPct = a;
            if (body.CaducidadReporteMenorHoras is { } b) row.CaducidadReporteMenorHoras = b;
            if (body.AutoAprobarConfianzaMinPct is { } c) row.AutoAprobarConfianzaMinPct = c;
            if (body.PushNotificacionUrl != null) row.PushNotificacionUrl = body.PushNotificacionUrl;
            if (body.GoogleMapsKeyAlmacenada != null)
                row.GoogleMapsKeyAlmacenada = string.IsNullOrWhiteSpace(body.GoogleMapsKeyAlmacenada)
                    ? null
                    : body.GoogleMapsKeyAlmacenada.Trim();
            await _context.SaveChangesAsync();
            return Ok(
                new
                {
                    message = "Configuración actualizada",
                    id = row.Id,
                });
        }

        [HttpGet("db-health")]
        public async Task<IActionResult> GetDbHealth([FromServices] RedisService redis)
        {
            try
            {
                var can = await _context.Database.CanConnectAsync();
                return Ok(
                    new
                    {
                        ok = can,
                        message = can ? "Conexión a SQLite correcta" : "No se pudo conectar",
                        redis = new
                        {
                            habilitado = redis.IsEnabled,
                            message = redis.IsEnabled
                                ? "Redis activo (caché y sesiones)"
                                : "Redis no configurado — sesiones solo en base de datos",
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
                        redis = new { habilitado = redis.IsEnabled, message = ex.Message },
                    });
            }
        }
    }
}
