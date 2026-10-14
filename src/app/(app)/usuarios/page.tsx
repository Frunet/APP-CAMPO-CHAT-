import { redirect } from "next/navigation";

// La gestión de usuarios vive ahora en el módulo Maestros
export default function Usuarios() {
  redirect("/maestros?seccion=usuarios");
}
