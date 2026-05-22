using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RutaSegura.Migrations
{
    /// <inheritdoc />
    public partial class AddUsuarioPreferencias : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "UsuarioPreferencias",
                columns: table => new
                {
                    UsuarioId = table.Column<int>(type: "INTEGER", nullable: false),
                    EvitarZonasOscurasNoche = table.Column<bool>(type: "INTEGER", nullable: false),
                    ModoMovilidadPredeterminado = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    AlertasRiesgoTiempoReal = table.Column<bool>(type: "INTEGER", nullable: false),
                    AvisoAutomaticoLlegada = table.Column<bool>(type: "INTEGER", nullable: false),
                    ActualizadoEn = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UsuarioPreferencias", x => x.UsuarioId);
                    table.ForeignKey(
                        name: "FK_UsuarioPreferencias_Usuarios_UsuarioId",
                        column: x => x.UsuarioId,
                        principalTable: "Usuarios",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "UsuarioPreferencias");
        }
    }
}
