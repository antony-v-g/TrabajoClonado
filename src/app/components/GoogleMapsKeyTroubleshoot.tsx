/** Pasos concretos cuando Google Maps muestra el recuadro gris o rechaza la clave. */
export function GoogleMapsKeyTroubleshoot() {
  return (
    <div className="max-w-lg rounded-2xl border border-amber-200 bg-amber-50/95 p-5 text-left text-sm text-amber-950 shadow-lg">
      <p className="font-bold text-base text-amber-900 mb-3">
        La clave de API es rechazada o no es válida para el mapa
      </p>
      <p className="text-amber-800/90 mb-3">
        Revisa en Google Cloud, en <strong>este orden</strong>:
      </p>
      <ol className="list-decimal list-inside space-y-2 text-amber-900/90 mb-4">
        <li>
          <a
            className="text-indigo-700 underline font-medium"
            href="https://console.cloud.google.com/google/maps-apis/api-list"
            target="_blank"
            rel="noopener noreferrer"
          >
            APIs habilitadas
          </a>
          : busca y habilita <strong>Maps JavaScript API</strong> (no basta con Geocoding
          u otras).
        </li>
        <li>
          Para el <strong>buscador de direcciones y lugares</strong>, en la misma lista
          habilita <strong>Places API</strong> (a veces como &quot;Places API (New)&quot;);
          el mapa carga con solo Maps JS, el autocompletado requiere Places.
        </li>
        <li>
          <a
            className="text-indigo-700 underline font-medium"
            href="https://console.cloud.google.com/billing"
            target="_blank"
            rel="noopener noreferrer"
          >
            Facturación
          </a>
          : vinculada al proyecto. Google exige facturación para Maps (hay cuota
          gratuita; puedes poner presupuestos/alertas).
        </li>
        <li>
          <a
            className="text-indigo-700 underline font-medium"
            href="https://console.cloud.google.com/google/maps-apis/credentials"
            target="_blank"
            rel="noopener noreferrer"
          >
            Credenciales
          </a>
          : en tu clave, restricción <strong>Referentes HTTP</strong>. Copia tal cual
          (sin barra final sola; usa <code className="bg-white/80 px-1 rounded">/*</code>):{" "}
          <code className="block bg-white/80 px-1 rounded mt-1 text-xs break-all">
            https://rutasegura-ubg3.onrender.com/*
          </code>
          <code className="block bg-white/80 px-1 rounded mt-1 text-xs">
            http://localhost:5173/*
          </code>
          No uses solo <code className="bg-white/80 px-1 rounded">…com/</code> — eso no
          autoriza <code className="bg-white/80 px-1 rounded">/mapa</code>. En F12 → Red, abre{" "}
          <code className="bg-white/80 px-1 rounded">maps/api/js</code> y confirma que el{" "}
          <code className="bg-white/80 px-1 rounded">key=</code> sea esta misma clave en Google
          Cloud.
        </li>
        <li>Guarda cambios, espera 1–2 min y recarga la app (F5).</li>
      </ol>
      <p className="text-xs text-amber-800/80">
        Documentación:{" "}
        <a
          className="text-indigo-700 underline"
          href="https://developers.google.com/maps/documentation/javascript/error-messages"
          target="_blank"
          rel="noopener noreferrer"
        >
          Errores de la API de Maps
        </a>{" "}
        · en el navegador, F12 → Consola: suele salir un mensaje del tipo{" "}
        <code className="bg-white/60 px-1 rounded">Google Maps JavaScript API error: ...</code>
      </p>
    </div>
  );
}
