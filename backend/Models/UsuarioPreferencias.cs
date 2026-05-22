using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace RutaSegura.Models;

/// <summary>Preferencias personales del usuario (rutas y notificaciones).</summary>
public class UsuarioPreferencias
{
    [Key]
    public int UsuarioId { get; set; }

    [ForeignKey(nameof(UsuarioId))]
    public Usuario? Usuario { get; set; }

    public bool EvitarZonasOscurasNoche { get; set; } = true;

    /// <summary>peaton | bike</summary>
    [Required]
    [MaxLength(20)]
    public string ModoMovilidadPredeterminado { get; set; } = "peaton";

    public bool AlertasRiesgoTiempoReal { get; set; } = true;

    public bool AvisoAutomaticoLlegada { get; set; } = true;

    public DateTime ActualizadoEn { get; set; } = DateTime.UtcNow;
}
