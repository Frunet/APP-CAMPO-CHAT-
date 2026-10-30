// Service worker mínimo: hace la web instalable en el móvil («Añadir a la pantalla de inicio»).
// No guarda nada en caché a propósito: los datos son siempre los de la base de datos y la web siempre la última publicada.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
