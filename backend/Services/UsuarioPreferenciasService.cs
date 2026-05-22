using Microsoft.EntityFrameworkCore;
using RutaSegura.Data;
using RutaSegura.Models;

namespace RutaSegura.Services;

public class UsuarioPreferenciasService
{
    private readonly ApplicationDbContext _db;
    private readonly RedisService _redis;

    public UsuarioPreferenciasService(ApplicationDbContext db, RedisService redis)
    {
        _db = db;
        _redis = redis;
    }

    public static string CacheKey(int userId) => $"usuario:preferencias:v1:{userId}";

    public async Task<UsuarioPreferenciasDto> GetOrCreateAsync(int userId, CancellationToken ct = default)
    {
        if (_redis.IsEnabled)
        {
            var cached = await _redis.GetStringAsync(CacheKey(userId));
            if (cached != null)
            {
                var parsed = ApiJson.Deserialize<UsuarioPreferenciasDto>(cached);
                if (parsed != null)
                    return parsed with { ServidoDesdeCache = true };
            }
        }

        var row = await _db.UsuarioPreferencias
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.UsuarioId == userId, ct);

        if (row is null)
        {
            row = CrearPredeterminadas(userId);
            _db.UsuarioPreferencias.Add(row);
            await _db.SaveChangesAsync(ct);
        }

        var dto = ToDto(row, _redis.IsEnabled, false);
        await CacheAsync(userId, dto);
        return dto;
    }

    public async Task<UsuarioPreferenciasDto> GuardarAsync(
        int userId,
        ActualizarPreferenciasRequest req,
        CancellationToken ct = default)
    {
        var row = await _db.UsuarioPreferencias
            .FirstOrDefaultAsync(p => p.UsuarioId == userId, ct);

        if (row is null)
        {
            row = CrearPredeterminadas(userId);
            _db.UsuarioPreferencias.Add(row);
        }

        row.EvitarZonasOscurasNoche = req.EvitarZonasOscurasNoche;
        row.ModoMovilidadPredeterminado = NormalizarModo(req.ModoMovilidadPredeterminado);
        row.AlertasRiesgoTiempoReal = req.AlertasRiesgoTiempoReal;
        row.AvisoAutomaticoLlegada = req.AvisoAutomaticoLlegada;
        row.ActualizadoEn = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);

        await _redis.RemoveAsync(CacheKey(userId));

        var dto = ToDto(row, _redis.IsEnabled, false);
        await CacheAsync(userId, dto);
        return dto;
    }

    public async Task<AvisoLlegadaResponse?> RegistrarAvisoSinLlegadaAsync(
        int userId,
        string? destino,
        CancellationToken ct = default)
    {
        var prefs = await GetOrCreateAsync(userId, ct);
        if (!prefs.AvisoAutomaticoLlegada)
            return null;

        var usuario = await _db.Usuarios.AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (usuario is null) return null;

        var contactos = await _db.Contactos.AsNoTracking()
            .Where(c => c.UsuarioId == userId)
            .OrderByDescending(c => c.EsPrincipal)
            .Take(5)
            .Select(c => c.Nombre)
            .ToListAsync(ct);

        var dest = string.IsNullOrWhiteSpace(destino) ? "trayecto en curso" : destino.Trim();
        var nombres = contactos.Count > 0
            ? string.Join(", ", contactos)
            : "ningún contacto configurado";

        var alerta = new AlertaSistema
        {
            Titulo = $"Aviso: {usuario.Nombre} no confirmó llegada",
            Detalle =
                $"El usuario salió de la navegación sin marcar «Llegué bien» hacia {dest}. "
                + $"Contactos a notificar (simulado): {nombres}.",
            Prioridad = "media",
            Origen = "PreferenciaUsuario",
            UbicacionRef = dest,
            RiesgoEstimadoPct = 35,
            CreadaEn = DateTime.UtcNow,
        };
        _db.AlertasSistema.Add(alerta);
        await _db.SaveChangesAsync(ct);

        return new AvisoLlegadaResponse(
            true,
            $"Se registró el aviso automático. Tus contactos ({contactos.Count}) serían notificados en producción.",
            contactos,
            alerta.Id,
            prefs.CacheRedisActivo);
    }

    private async Task CacheAsync(int userId, UsuarioPreferenciasDto dto)
    {
        if (!_redis.IsEnabled) return;
        await _redis.SetStringAsync(
            CacheKey(userId),
            ApiJson.Serialize(dto),
            TimeSpan.FromMinutes(30));
    }

    private static UsuarioPreferencias CrearPredeterminadas(int userId) =>
        new()
        {
            UsuarioId = userId,
            EvitarZonasOscurasNoche = true,
            ModoMovilidadPredeterminado = "peaton",
            AlertasRiesgoTiempoReal = true,
            AvisoAutomaticoLlegada = true,
            ActualizadoEn = DateTime.UtcNow,
        };

    private static string NormalizarModo(string? modo)
    {
        var m = (modo ?? "peaton").Trim().ToLowerInvariant();
        return m is "bike" or "bicicleta" ? "bike" : "peaton";
    }

    private static UsuarioPreferenciasDto ToDto(
        UsuarioPreferencias row,
        bool redisActivo,
        bool desdeCache) =>
        new(
            row.EvitarZonasOscurasNoche,
            row.ModoMovilidadPredeterminado,
            row.AlertasRiesgoTiempoReal,
            row.AvisoAutomaticoLlegada,
            row.ActualizadoEn,
            redisActivo,
            desdeCache);
}

public record UsuarioPreferenciasDto(
    bool EvitarZonasOscurasNoche,
    string ModoMovilidadPredeterminado,
    bool AlertasRiesgoTiempoReal,
    bool AvisoAutomaticoLlegada,
    DateTime ActualizadoEn,
    bool CacheRedisActivo,
    bool ServidoDesdeCache);

public record ActualizarPreferenciasRequest(
    bool EvitarZonasOscurasNoche,
    string ModoMovilidadPredeterminado,
    bool AlertasRiesgoTiempoReal,
    bool AvisoAutomaticoLlegada);

public record AvisoLlegadaResponse(
    bool Registrado,
    string Mensaje,
    IReadOnlyList<string> Contactos,
    int AlertaSistemaId,
    bool CacheRedisActivo);
