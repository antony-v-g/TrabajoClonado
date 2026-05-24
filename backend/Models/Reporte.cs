using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace RutaSegura.Models
{
    public class Reporte
    {
        [Key]
        public int Id { get; set; }

        [Required(ErrorMessage = "El tipo de incidente es requerido.")]
        public string TipoIncidente { get; set; } = string.Empty;

        [Required]
        public string Ubicacion { get; set; } = string.Empty;
        
        public string? Latitud { get; set; }
        public string? Longitud { get; set; }

        public string? Descripcion { get; set; }
        public string? UrlFotoEvidencia { get; set; }

        public DateTime FechaReporte { get; set; } = DateTime.UtcNow;

        public string Estado { get; set; } = "Pendiente"; // Pendiente, Aprobado, Rechazado

        // Relación con el usuario
        public int UsuarioId { get; set; }
        [ForeignKey("UsuarioId")]
        public virtual Usuario? Usuario { get; set; }
        public int? CatalogoId { get; set; }
        [ForeignKey("CatalogoId")]
        public virtual Catalogo? Catalogo { get; set; }
        public int? ProyectoId { get; set; }
        [ForeignKey("ProyectoId")]
        public virtual Proyecto? Proyecto { get; set; }
        
        // Campo para predicción IA
        public float NivelConfianzaIA { get; set; }

        /// <summary>Tipo sugerido por ML.NET al crear el reporte (p. ej. Robo, Vandalismo).</summary>
        [MaxLength(50)]
        public string? TipoPredichoMl { get; set; }

        public bool EsAnonimo { get; set; }
    }
}