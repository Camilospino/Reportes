# Mejoras futuras (fuera del presupuesto actual)

Ordenadas por valor estimado para la operación. Los esfuerzos son aproximados
(1 día ≈ 8 h de un desarrollador senior).

| # | Mejora | Valor | Esfuerzo | Costo mensual extra |
|---|---|---|---|---|
| 1 | **Cola de envíos persistente** (IndexedDB + Service Worker): fotos y resultados sobreviven al cierre del navegador o a quedarse sin batería; se envían solos al volver la señal | Alto | 4–6 días | $0 |
| 2 | **Notificaciones** al técnico de reportes nuevos o asignados (Web Push; SMS/WhatsApp como alternativa) | Alto | 3–4 días (push) | $0 push · WhatsApp/SMS por mensaje |
| 3 | **Exportar a Excel/CSV** el listado filtrado y la bitácora | Medio-alto | 1–2 días | $0 |
| 4 | **Geolocalización de evidencia:** guardar la ubicación del celular al enviar y mostrar distancia a la dirección (antifraude) | Medio-alto | 2–3 días | $0 |
| 5 | **Firma del cliente** en pantalla al cerrar el trabajo | Medio | 2 días | $0 |
| 6 | **Limpieza automática de fotos huérfanas** (subidas y nunca enviadas) | Bajo | 0,5 días | $0 |
| 7 | **Más de un administrador con permisos distintos** (supervisor solo lectura, coordinador por zona) | Medio | 3–4 días | $0 |
| 8 | **Indicadores**: tiempos promedio de atención por técnico y categoría, tasa de rechazo | Medio | 3–5 días | $0 |
| 9 | **Recuperación de contraseña por correo/SMS** | Bajo-medio | 1–2 días | Correo transaccional gratis hasta ~3.000/mes |
| 10 | **Mapa de reportes** (pines por estado) | Medio | 2–3 días | $0 con OpenStreetMap |
| 11 | **Rutas optimizadas** para el día del técnico | Medio | 5+ días | API de rutas por uso |
| 12 | **Monitoreo de errores** (Sentry) y alertas | Medio | 0,5 días | Plan gratuito |
| 13 | **Autenticación de dos factores** para administradores | Medio | 1–2 días | $0 |
| 14 | **App nativa** (solo si se requiere cámara/GPS en segundo plano o modo offline total) | Según caso | 4–8 semanas | Cuentas de tiendas |
| 15 | **Alta disponibilidad**: BD gestionada, réplica, varias instancias (mover límite de login a BD/Redis) | Bajo hoy | 3–5 días | +COP 60.000–200.000 |

## Recomendación
Con el próximo presupuesto, priorizar **1 + 3 + 6** (≈ 1,5 semanas): resuelven los problemas más probables
de campo (señal intermitente) y de oficina (reportes en Excel) sin aumentar el costo mensual.
