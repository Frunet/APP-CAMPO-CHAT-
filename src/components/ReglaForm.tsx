import ActionForm, { Field } from "./ActionForm";
import { guardarRegla } from "@/lib/actions";
import { TIPOS_REGLA } from "@/lib/avisos/tipos";

type Props = {
  regla?: any; fincas: { id: string; nombre: string }[]; perfiles?: { id: string; nombre: string; rol: string }[];
};
const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export default function ReglaForm({ regla, fincas, perfiles }: Props) {
  const p = regla?.parametros ?? {};
  return (
    <ActionForm action={guardarRegla} label={regla ? "Guardar regla" : "Crear regla"} reset={!regla} className="grid gap-3 sm:grid-cols-3">
      {regla && <input type="hidden" name="id" value={regla.id} />}
      <Field label="Tipo de aviso *">
        <select name="tipo" className="input" defaultValue={regla?.tipo ?? "cosecha_proxima"} required>
          {Object.entries(TIPOS_REGLA).map(([k, v]) => <option key={k} value={k}>{v.etiqueta}</option>)}
        </select>
      </Field>
      <Field label="Nombre *"><input name="nombre" className="input" required defaultValue={regla?.nombre ?? ""} /></Field>
      <Field label="Finca (vacío = todas)">
        <select name="finca_id" className="input" defaultValue={regla?.finca_id ?? ""}><option value="">Todas</option>{fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select>
      </Field>
      <Field label="Hora (Madrid)"><input type="time" name="hora" className="input" required defaultValue={regla?.hora?.slice(0, 5) ?? "08:00"} /></Field>
      <Field label="Periodicidad">
        <select name="periodicidad" className="input" defaultValue={regla?.periodicidad ?? "diaria"}><option value="diaria">Diaria</option><option value="semanal">Semanal</option><option value="mensual">Mensual</option></select>
      </Field>
      <Field label="Prioridad">
        <select name="prioridad" className="input" defaultValue={regla?.prioridad ?? "media"}><option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option><option value="critica">Crítica</option></select>
      </Field>
      <Field label="Día de la semana (semanal)">
        <select name="dia_semana" className="input" defaultValue={regla?.dia_semana ?? 1}>{DIAS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select>
      </Field>
      <Field label="Día del mes (mensual, 1-28)"><input name="dia_mes" type="number" min={1} max={28} className="input" defaultValue={regla?.dia_mes ?? 1} /></Field>
      <Field label="Antelación / días (según tipo)"><input name="dias" inputMode="numeric" className="input" defaultValue={p.dias ?? p.dias_atras ?? ""} placeholder="p. ej. 7" /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enviar_email" defaultChecked={regla?.enviar_email ?? true} /> Enviar también por correo</label>
      {perfiles && (
        <div className="col-span-full">
          <span className="mb-1 block text-xs font-medium text-stone-600">Destinatarios (vacío = administradores y responsables de la finca)</span>
          <div className="flex flex-wrap gap-3">
            {perfiles.map((u) => (
              <label key={u.id} className="flex items-center gap-1 text-sm">
                <input type="checkbox" name="destinatarios" value={u.id} defaultChecked={regla?.destinatarios?.includes(u.id)} /> {u.nombre} <span className="text-xs text-stone-400">({u.rol})</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </ActionForm>
  );
}
