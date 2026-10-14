import { NextResponse } from "next/server";
import { generarPdf } from "@/lib/informes-export";
import { prepararInforme } from "@/lib/informes-ruta";

export async function GET(req: Request) {
  const r = await prepararInforme(req);
  if ("error" in r && r.error) return r.error;
  const bytes = await generarPdf(r.inf!, r.ctx!);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="informe_${r.inf!.filtros.desde}_${r.inf!.filtros.hasta}.pdf"`,
    },
  });
}
