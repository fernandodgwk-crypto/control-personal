// Aprueba una solicitud de acceso de Control de Personal: crea la cuenta con la contraseña inicial (o usa la que
// ya existe con ese correo, p. ej. de Surtido de Línea), le asigna el rol, liga el correo a la ficha del número de
// empleado y marca la solicitud como aprobada. Solo la puede llamar un administrador de Control de Personal.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Método no permitido" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data: rolCaller, error: eRol } = await caller.rpc("mi_rol");
  if (eRol || rolCaller !== "admin") return json(403, { error: "Solo el administrador puede aprobar solicitudes." });
  const { data: { user: quien } } = await caller.auth.getUser();

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "Solicitud inválida." }); }
  const id = String(body.solicitud_id ?? "");
  const rol = String(body.rol ?? "");
  const num = String(body.num ?? "").trim();
  const nombre = String(body.nombre ?? "").trim();
  const password = String(body.password ?? "");

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: roles } = await admin.from("roles").select("nombre");
  if (!rol || rol === "sin_acceso" || !(roles ?? []).some((r) => r.nombre === rol)) return json(400, { error: "Rol inválido." });
  const { data: sol } = await admin.from("cp_solicitudes_acceso").select("*").eq("id", id).maybeSingle();
  if (!sol || sol.estado !== "pendiente") return json(404, { error: "La solicitud ya no está pendiente." });
  const email = String(sol.email).toLowerCase();

  // Ficha del personal: si el número existe, no debe estar ligada a otro correo.
  let ficha: { num: string; nombre: string; email: string | null } | null = null;
  if (num) {
    const { data } = await admin.from("empleados").select("num,nombre,email").eq("num", num).maybeSingle();
    ficha = data;
    if (ficha?.email && ficha.email.trim() && ficha.email.trim().toLowerCase() !== email) {
      return json(409, { error: `La ficha ${num} (${ficha.nombre}) ya tiene el correo ${ficha.email}.` });
    }
  }

  // Cuenta: se crea con la contraseña inicial; si el correo ya tiene cuenta, se usa esa y no se toca su contraseña.
  let userId = "", existente = false;
  const creado = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { nombre: nombre || sol.nombre, num, debe_cambiar: true },
  });
  if (creado.data?.user) {
    userId = creado.data.user.id;
  } else {
    for (let page = 1; page <= 20 && !userId; page++) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      const u = data?.users.find((x) => (x.email ?? "").toLowerCase() === email);
      if (u) { userId = u.id; existente = true; }
      if (!data || data.users.length < 200) break;
    }
    if (!userId) {
      const msg = String(creado.error?.message ?? "");
      return json(400, { error: /password/i.test(msg) ? "La contraseña inicial debe tener al menos 8 caracteres." : "No se pudo crear la cuenta: " + msg });
    }
  }

  const { error: eP } = await admin.from("perfiles").upsert({ id: userId, email, rol }, { onConflict: "id" });
  if (eP) return json(500, { error: "No se pudo asignar el rol: " + eP.message });
  if (ficha && !(ficha.email ?? "").trim()) {
    await admin.from("empleados").update({ email, actualizado: new Date().toISOString() }).eq("num", ficha.num);
  }
  await admin.from("cp_solicitudes_acceso").update({
    estado: "aprobada", rol, revisado: new Date().toISOString(), revisado_por: quien?.email ?? "",
  }).eq("id", id);
  return json(200, { ok: true, existente, email, ficha: ficha?.nombre ?? null });
});
