# Etapa 1: frontend (Vite inyecta VITE_* en el build)
FROM node:20-alpine AS frontend
WORKDIR /src
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
ARG VITE_GOOGLE_MAPS_API_KEY
ARG VITE_API_URL=
ENV VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Etapa 2: backend + wwwroot generado arriba
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["backend/RutaSegura.csproj", "backend/"]
RUN dotnet restore "backend/RutaSegura.csproj"
COPY . .
COPY --from=frontend /src/backend/wwwroot ./backend/wwwroot
RUN dotnet publish "backend/RutaSegura.csproj" -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .
COPY docker-entrypoint.sh .
RUN chmod +x docker-entrypoint.sh
RUN mkdir -p /var/data && chmod 755 /var/data
ENV ASPNETCORE_URLS=http://0.0.0.0:$PORT
EXPOSE 8080
ENTRYPOINT ["./docker-entrypoint.sh"]
