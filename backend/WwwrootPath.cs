namespace RutaSegura;

/// <summary>
/// Localiza backend/wwwroot aunque ContentRoot apunte a bin/Debug (dotnet run / IDE).
/// </summary>
public static class WwwrootPath
{
    public static string Resolve()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var csproj = Path.Combine(dir.FullName, "RutaSegura.csproj");
            if (File.Exists(csproj))
            {
                var wwwroot = Path.Combine(dir.FullName, "wwwroot");
                if (Directory.Exists(wwwroot))
                    return wwwroot;
            }

            dir = dir.Parent;
        }

        var fromCwd = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
        if (Directory.Exists(fromCwd))
            return Path.GetFullPath(fromCwd);

        return Path.Combine(AppContext.BaseDirectory, "wwwroot");
    }
}
