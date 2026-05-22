using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RutaSegura.Migrations
{
    /// <inheritdoc />
    public partial class AddUmbralAlertasColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "UmbralRiesgoAlertaAltaPct",
                table: "ConfiguracionSistema",
                type: "INTEGER",
                nullable: false,
                defaultValue: 80);

            migrationBuilder.AddColumn<int>(
                name: "UmbralRiesgoAlertaMediaPct",
                table: "ConfiguracionSistema",
                type: "INTEGER",
                nullable: false,
                defaultValue: 50);

            migrationBuilder.UpdateData(
                table: "ConfiguracionSistema",
                keyColumn: "Id",
                keyValue: 1,
                columns: new[] { "UmbralRiesgoAlertaAltaPct", "UmbralRiesgoAlertaMediaPct" },
                values: new object[] { 80, 50 });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "UmbralRiesgoAlertaAltaPct",
                table: "ConfiguracionSistema");

            migrationBuilder.DropColumn(
                name: "UmbralRiesgoAlertaMediaPct",
                table: "ConfiguracionSistema");
        }
    }
}
