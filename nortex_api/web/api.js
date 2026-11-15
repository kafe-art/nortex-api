/* NORTEX — llamadas a la API y manejo de errores.
 * Dirección de la API: ?api=https://mi-servidor (se recuerda), o el mismo origen si la página la
 * sirve la propia API en /app, o http://127.0.0.1:8000 en desarrollo. */

const params = new URLSearchParams(location.search);
if (params.get("api")) localStorage.setItem("nortexApi", params.get("api").replace(/\/$/, ""));
export const API = params.get("api")?.replace(/\/$/, "")
  || (location.protocol.startsWith("http") && location.pathname.startsWith("/app") ? location.origin
      : localStorage.getItem("nortexApi") || "http://127.0.0.1:8000");

export function textoError(cuerpo, status) {
  const d = cuerpo?.detail ?? cuerpo;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((e) => `${(e.loc || []).slice(1).join(".")}: ${e.msg}`).join("\n");
  if (d?.mensaje) return d.mensaje + "\n" + (d.filas || []).map((f) => `línea ${f.linea}: ${
    (f.errores || []).map((e) => (typeof e === "string" ? e : `${(e.loc || []).join(".")} ${e.msg}`)).join("; ")}`)
    .join("\n");
  return `Error ${status}`;
}

export async function api(ruta, opciones = {}) {
  let r;
  try { r = await fetch(API + ruta, opciones); } catch {
    throw new Error("No hay conexión con la API de NORTEX. Revise su internet e intente de nuevo.");
  }
  const tipo = r.headers.get("content-type") || "";
  const cuerpo = tipo.includes("json") ? await r.json() : await r.text();
  if (!r.ok) throw new Error(textoError(cuerpo, r.status));
  return cuerpo;
}

export const post = (ruta, datos) => api(ruta, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(datos) });

/* Las evaluaciones se guardan en memoria: la misma consulta no se repite (datos móviles). */
const memoria = new Map();
export function evaluar(funcion, cuerpo) {
  const clave = funcion + JSON.stringify(cuerpo);
  if (!memoria.has(clave)) {
    const promesa = post(`/evaluar/${funcion}`, cuerpo);
    promesa.catch(() => memoria.delete(clave));
    memoria.set(clave, promesa);
  }
  return memoria.get(clave);
}
const lecturas = new Map();
export function leer(ruta) {
  if (!lecturas.has(ruta)) {
    const promesa = api(ruta);
    promesa.catch(() => lecturas.delete(ruta));
    lecturas.set(ruta, promesa);
  }
  return lecturas.get(ruta);
}
/** Olvida lo guardado: llamar cuando cambian los datos (descarga, CSV, validación). */
export function olvidar() { memoria.clear(); lecturas.clear(); }
