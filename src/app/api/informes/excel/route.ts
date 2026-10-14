import { NextResponse } from "next/server";
import { generarExcel } from "@/lib/informes-export";
import { prepararInforme } from "@/lib/informes-ruta";

export async function GET(req: Request) {
  const r = await prepararInforme(req);
  if ("error" in r && r.error) return r.error;
  const buf = generarExcel(r.inf!, r.ctx!);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="informe_${r.inf!.filtros.desde}_${r.inf!.filtros.hasta}.xlsx"`,
    },
  });
}
