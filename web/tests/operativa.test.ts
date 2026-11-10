import assert from "node:assert/strict";
import { test } from "node:test";
import { leerFilasHoras, fechaExcel, horasExcel, nombreComparable } from "../src/lib/importacion-horas";
import { fechasSemana, inicioSemana, costesPorTarea, avisosHoras, type ParteOperativo } from "../src/lib/operativa";
const cab = ["FECHA", "NOMBRE", "Horas Diarias", "Finca/Invernadero", "Instalación", "Suelos", "Liado/ Guía de planta", "Otros cuidados planta", "Riego", "Cosecha", "Otros", "Tareas", "TOTAL"];
test("reparte las horas por finca sin sumar dos veces el total diario", () => {
  const r = leerFilasHoras([cab, ["05/11/2026", "Nombre Apellido", 7, "PAI MANGO", 0, 3, 0, 0, 0, 0, 0, "Arrancar cultivo", 3], ["05/11/2026", "Nombre Apellido", 7, "AVO CASA", 0, 0, 0, 4, 0, 0, 0, "Tala", 4]], "horas.xlsx", "DATOS");
  assert.equal(r.length, 2); assert.equal(r.reduce((s, x) => s + x.horas, 0), 7); assert(r.every((x) => !x.error));
});
test("separa categorías y detecta totales, fechas y celdas no válidas", () => {
  const fila = ["05/11/2026", "Nombre", 7, "Casa", 0, 3, 0, 0, 0, 0, 4, "Detalle", 7];
  const r = leerFilasHoras([cab, fila], "f.xlsx", "DATOS");assert.equal(r.length, 2);assert.deepEqual(r.map((x) => x.mayor), ["Suelos", "Otros"]);
  assert.match(leerFilasHoras([cab, [...fila.slice(0, 12), 8]], "f", "D")[0].error, /TOTAL/);
  assert.match(leerFilasHoras([cab, ["31/11/2026", ...fila.slice(1)]], "f", "D")[0].error, /Fecha/);
  const invalida = [...fila];invalida[5] = "#VALUE!";assert.match(leerFilasHoras([cab, invalida], "f", "D")[0].error, /Horas/);
});
test("admite una hoja simple y horas decimales o en formato reloj", () => {
  const r = leerFilasHoras([["Fecha", "Nombre", "Finca", "TOTAL"], ["2026-11-05", "Nombre", "Casa", "7,5"]], "f", "D");
  assert.equal(r[0].horas, 7.5);assert.equal(r[0].error, "");assert.equal(horasExcel("07:30"), 7.5);assert.equal(horasExcel("07:99"), null);assert.equal(fechaExcel("2026-02-30"), null);
  assert.equal(nombreComparable("Apellido José (Lomas)"), nombreComparable("JOSE APELLIDO"));
});
const parte = { id: "1", fecha: "2026-11-05", finca_id: "a", trabajador_id: "t", trabajador_nombre: null, mayor: "Suelos", tipo_trabajo: "Hierba", actividad: "Desbrozadora", horas_totales: 7, horas_extra_totales: 0, coste_total: null, trabajadores: { nombre: "Prueba", codigo: "1" } } as ParteOperativo;
test("los avisos suman la jornada entre fincas sin confundir tareas diferentes con duplicados", () => {
  assert.equal(avisosHoras([parte, { ...parte, id: "2", finca_id: "b", horas_totales: 6 }]).length, 1);
  assert.equal(avisosHoras([parte, { ...parte, id: "2", horas_totales: 2, actividad: "Tractor" }]).length, 0);
  assert(avisosHoras([parte, { ...parte, id: "2" }]).some((x) => /duplicado/.test(x)));
});
test("un coste ausente no se convierte en coste cero", () => {
  const [g] = costesPorTarea([parte, { ...parte, id: "2", coste_total: 0 }]);assert.equal(g.sinTarifa, 1);assert.equal(g.horas, 14);assert.equal(g.coste, 0);
});
test("las semanas cruzan meses y años sin desplazarse de día", () => {
  assert.equal(inicioSemana("2027-01-01"), "2026-12-28");assert.equal(fechasSemana("2026-12-28")[6], "2027-01-03");
});
