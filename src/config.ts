/**
 * Configuración del Gateway tomada de variables de entorno.
 * El IdComercio NO se configura aquí: se deriva del token emitido por WIBI
 * a partir de las credenciales del comercio (WIBI_USER / WIBI_PASS).
 */
export interface WibiConfig {
  baseUrl: string;
  apiKey: string;
  user: string;
  pass: string;
  defaultCampania?: number;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    // stderr: stdout está reservado para el transporte JSON-RPC.
    console.error(`ERROR: falta la variable de entorno ${name}`);
    process.exit(1);
  }
  return value.trim();
}

export function loadConfig(): WibiConfig {
  const defaultCampania = process.env.WIBI_DEFAULT_CAMPANIA
    ? Number(process.env.WIBI_DEFAULT_CAMPANIA)
    : undefined;

  return {
    baseUrl: (process.env.WIBI_BASE_URL || "https://apiv2.wibi.com.ar").replace(/\/$/, ""),
    apiKey: required("WIBI_API_KEY"),
    user: required("WIBI_USER"),
    pass: required("WIBI_PASS"),
    defaultCampania:
      defaultCampania && !Number.isNaN(defaultCampania) ? defaultCampania : undefined,
  };
}
