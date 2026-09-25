import tls from "node:tls";

let applied = false;

/**
 * Suma los certificados raíz del sistema operativo a los que trae Node.
 *
 * Así funcionan, sin desactivar la verificación TLS, las APIs con un certificado propio
 * que el equipo ya confía (entornos de prueba, proxies corporativos, NINOX_BASE_URL
 * apuntando a un servidor interno). Se desactiva con TLS_USE_SYSTEM_CA=false.
 */
export function trustSystemCertificates(): void {
  if (applied) return;
  applied = true;
  if (process.env.TLS_USE_SYSTEM_CA?.trim().toLowerCase() === "false") return;

  if (typeof tls.setDefaultCACertificates !== "function" || typeof tls.getCACertificates !== "function") {
    console.warn("[tls] Esta versión de Node no permite usar los certificados del sistema (requiere 22.19+ o 24.5+).");
    return;
  }
  try {
    tls.setDefaultCACertificates([...tls.getCACertificates("default"), ...tls.getCACertificates("system")]);
  } catch (error) {
    console.warn("[tls] No se pudieron cargar los certificados del sistema:", error instanceof Error ? error.message : error);
  }
}
