import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// base relativa: la web vive en https://<usuario>.github.io/<repositorio>/ y se navega con rutas hash (#/horas)
export default defineConfig({ base: "./", plugins: [react(), tailwindcss()] });
