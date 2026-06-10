using System.ComponentModel;
using Microsoft.SemanticKernel;
using Microsoft.EntityFrameworkCore;
using RutaSegura.Data;
using RutaSegura.Models;

namespace RutaSegura.Services.Plugins
{
    /// <summary>
    /// Plugin para obtener recomendaciones basadas en datos del sistema y perfil del usuario.
    /// </summary>
    public class RecommendationPlugin
    {
        private readonly ApplicationDbContext _context;
        private readonly ILogger<RecommendationPlugin> _logger;

        public RecommendationPlugin(ApplicationDbContext context, ILogger<RecommendationPlugin> logger)
        {
            _context = context ?? throw new ArgumentNullException(nameof(context));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        [KernelFunction("get_user_safety_profile")]
        [Description("Obtiene el perfil de seguridad del usuario basado en su historial de rutas y preferencias.")]
        public async Task<string> GetUserSafetyProfile(
            [Description("ID del usuario")] string userId,
            CancellationToken cancellationToken = default)
        {
            try
            {
                if (!int.TryParse(userId, out var userIdInt))
                    return "ID de usuario inválido.";

                var usuario = await _context.Usuarios
                    .AsNoTracking()
                    .FirstOrDefaultAsync(u => u.Id == userIdInt, cancellationToken);

                if (usuario == null)
                    return "Usuario no encontrado.";

                var preferencias = await _context.Set<UsuarioPreferencias>()
                    .AsNoTracking()
                    .FirstOrDefaultAsync(p => p.UsuarioId == userIdInt, cancellationToken);

                var resultado = $"""
                    Perfil de seguridad de {usuario.Nombre}:
                    - Email: {usuario.Email}
                    - Rol: {usuario.Rol}
                    - Preferencias de alertas: {(preferencias?.AlertasRiesgoTiempoReal == true ? "Activas" : "Inactivas")}
                    - Fecha de registro: {usuario.FechaRegistro:g}
                    - Estado: {usuario.Estado}
                    """;

                return resultado;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error obteniendo perfil de usuario {UserId}", userId);
                return $"Error: {ex.Message}";
            }
        }

        [KernelFunction("get_personalized_recommendations")]
        [Description("Genera recomendaciones personalizadas basadas en horarios, patrones y zona habitual del usuario.")]
        public async Task<string> GetPersonalizedRecommendations(
            [Description("ID del usuario")] string userId,
            [Description("Zona o área donde viaja frecuentemente")] string frequentZone = "general",
            CancellationToken cancellationToken = default)
        {
            try
            {
                if (!int.TryParse(userId, out var userIdInt))
                    return "ID de usuario inválido.";

                var recomendaciones = new List<string>
                {
                    "✓ Mantén tu teléfono cargado y comparte tu ubicación con un contacto de confianza",
                    "✓ Verifica las condiciones de seguridad antes de partir",
                    "✓ Evita viajes nocturnos en zonas con alto índice de incidentes",
                    "✓ Usa rutas iluminadas y conocidas",
                    "✓ Activa las notificaciones de alertas del sistema"
                };

                var usuarioZones = await _context.Set<UbicacionGuardada>()
                    .Where(u => u.UsuarioId == userIdInt)
                    .CountAsync(cancellationToken);

                if (usuarioZones < 3)
                    recomendaciones.Add("✓ Guarda más ubicaciones favoritas para análisis más precisos");

                var resultado = $"""
                    Recomendaciones personalizadas para {userId}:
                    Zona: {frequentZone}

                    {string.Join("\n", recomendaciones)}

                    Última actualización: {DateTime.UtcNow:g}
                    """;

                return resultado;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error generando recomendaciones personalizadas");
                return $"Error: {ex.Message}";
            }
        }

        [KernelFunction("check_emergency_contacts")]
        [Description("Verifica si el usuario tiene contactos de emergencia configurados.")]
        public async Task<string> CheckEmergencyContacts(
            [Description("ID del usuario")] string userId,
            CancellationToken cancellationToken = default)
        {
            try
            {
                if (!int.TryParse(userId, out var userIdInt))
                    return "ID de usuario inválido.";

                var contactos = await _context.Contactos
                    .Where(c => c.UsuarioId == userIdInt && c.EsPrincipal)
                    .CountAsync(cancellationToken);

                var todas = await _context.Contactos
                    .Where(c => c.UsuarioId == userIdInt)
                    .CountAsync(cancellationToken);

                var resultado = contactos > 0
                    ? $"✓ Tienes {contactos} contacto(s) principal(es) configurado(s) de un total de {todas}."
                    : $"⚠ No tienes contactos principales. Te recomendamos agregar al menos 2 contactos de confianza.";

                return resultado;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error verificando contactos de emergencia");
                return $"Error: {ex.Message}";
            }
        }
    }
}
