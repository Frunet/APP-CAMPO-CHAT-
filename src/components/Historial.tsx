import { createClient } from "@/lib/supabase/server";

const OCULTOS = new Set(["updated_at", "created_at"]);

/** Historial de cambios de un registro (audit_log; visible solo para administradores por RLS). */
export default async function Historial({ tabla, id }: { tabla: string; id: string }) {
  const db = await createClient();
  const { data } = await db.from("audit_log").select("id,accion,usuario_id,antes,despues,fecha")
    .eq("tabla", tabla).eq("registro_id", id).order("fecha", { ascending: false });
  const ids = [...new Set((data ?? []).map((a) => a.usuario_id).filter(Boolean))];
  const { data: perfiles } = ids.length ? await db.from("profiles").select("id,nombre").in("id", ids) : { data: [] };
  const nombre = new Map((perfiles ?? []).map((p) => [p.id, p.nombre]));

  if (!data?.length)
    return <p className="text-sm text-stone-500">Historial no disponible (solo lo ven los administradores).</p>;

  return (
    <ul className="space-y-2 text-sm">
      {data.map((a) => {
        const cambios = a.accion === "UPDATE"
          ? Object.keys(a.despues ?? {}).filter((k) => !OCULTOS.has(k) && JSON.stringify(a.antes?.[k]) !== JSON.stringify(a.despues[k]))
          : [];
        return (
          <li key={a.id} className="rounded-lg border border-stone-200 p-2">
            <div className="text-xs text-stone-500">
              {new Date(a.fecha).toLocaleString("es-ES")} · {a.accion === "INSERT" ? "Creado" : a.accion === "UPDATE" ? "Modificado" : "Eliminado"} por {nombre.get(a.usuario_id ?? "") ?? "sistema"}
            </div>
            {cambios.map((k) => (
              <div key={k}><b>{k}</b>: <span className="text-red-600 line-through">{String(a.antes?.[k] ?? "—")}</span> → <span className="text-green-700">{String(a.despues[k] ?? "—")}</span></div>
            ))}
          </li>
        );
      })}
    </ul>
  );
}
