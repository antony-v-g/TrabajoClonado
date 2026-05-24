using Microsoft.EntityFrameworkCore;

namespace RutaSegura.Data;

/// <summary>Asegura columnas de umbrales de alertas en SQLite si la migración no se aplicó.</summary>
public static class ConfiguracionSchemaBootstrap
{
    public static async Task EnsureAlertasUmbralColumnsAsync(ApplicationDbContext db)
    {
        if (!db.Database.IsSqlite()) return;

        var existing = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var conn = db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open)
            await conn.OpenAsync();

        await using (var cmd = conn.CreateCommand())
        {
            cmd.CommandText = "PRAGMA table_info(ConfiguracionSistema)";
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
                existing.Add(reader.GetString(1));
        }

        if (!existing.Contains("UmbralRiesgoAlertaAltaPct"))
        {
            await db.Database.ExecuteSqlRawAsync(
                "ALTER TABLE ConfiguracionSistema ADD COLUMN UmbralRiesgoAlertaAltaPct INTEGER NOT NULL DEFAULT 80");
        }

        if (!existing.Contains("UmbralRiesgoAlertaMediaPct"))
        {
            await db.Database.ExecuteSqlRawAsync(
                "ALTER TABLE ConfiguracionSistema ADD COLUMN UmbralRiesgoAlertaMediaPct INTEGER NOT NULL DEFAULT 50");
        }

        await EnsureReporteMlColumnsAsync(db);
    }

    public static async Task EnsureReporteMlColumnsAsync(ApplicationDbContext db)
    {
        if (!db.Database.IsSqlite()) return;

        var existing = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var conn = db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open)
            await conn.OpenAsync();

        await using (var cmd = conn.CreateCommand())
        {
            cmd.CommandText = "PRAGMA table_info(Reportes)";
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
                existing.Add(reader.GetString(1));
        }

        if (!existing.Contains("TipoPredichoMl"))
        {
            await db.Database.ExecuteSqlRawAsync(
                "ALTER TABLE Reportes ADD COLUMN TipoPredichoMl TEXT NULL");
        }
    }
}
