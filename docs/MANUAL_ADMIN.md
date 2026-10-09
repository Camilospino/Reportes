# Manual del administrador

## Ingresar
Abra la dirección de la aplicación, escriba su **usuario** y **contraseña** y toque **Ingresar**.
Por seguridad, la sesión de administrador dura 12 horas.

## Panel
Muestra cuántos reportes hay en cada estado. Toque una tarjeta para ver esos reportes.
Debajo, **Por revisar** lista los reportes que los técnicos ya atendieron (Realizado, Aplazado, Cliente ausente),
empezando por los más antiguos.

## Crear un reporte
1. Toque **+ Nuevo reporte**.
2. Complete la **dirección** (calle y barrio; la ciudad siempre es Cartagena de Indias, Bolívar), el **punto de referencia** (ayuda mucho al técnico),
   la **categoría**, la **prioridad**, la **descripción** y los datos del **cliente** (nombre, teléfono y **número de contrato**, que aparece en su factura).
3. **Técnico asignado** (opcional):
   - Sin asignar → lo ven todos los técnicos y lo toma el primero que pueda.
   - Asignado → solo ese técnico lo ve y lo puede tomar.
4. Toque **Publicar reporte**. Queda en estado **Pendiente**.

## Buscar y filtrar
En **Reportes** puede buscar por dirección (no importan mayúsculas ni tildes: "bogota" encuentra "Bogotá")
y filtrar por estado, prioridad, técnico y rango de fechas de creación. Toque **Limpiar** para quitar filtros.
Puede guardar la página en favoritos: los filtros quedan en la dirección.

## Ver un reporte
El detalle muestra los datos, un botón para **abrir la dirección en Google Maps**, otro para **llamar al cliente**
y el **Historial**: quién hizo qué y cuándo, con notas, motivos y **fotos** (tóquelas para verlas en grande).

## Editar un reporte
Solo mientras está **Pendiente** o **En proceso** (botón **Editar**). Si ya está En proceso, no se puede
cambiar el técnico. Cada cambio queda en el historial con el valor anterior y el nuevo.

## Revisar el trabajo del técnico

| Estado del reporte | Opciones |
|---|---|
| **Realizado** | **Verificar cierre** (queda Verificado, final) o **Rechazar cierre** con comentario (vuelve a Pendiente con el mismo técnico, que verá su comentario) |
| **Aplazado** / **Cliente ausente** | **Reprogramar** con instrucciones (vuelve a Pendiente) o **Cancelar** |
| Pendiente / En proceso | **Cancelar** (con motivo) |

Los comentarios son obligatorios al rechazar, reprogramar o cancelar.

## Técnicos
En **Técnicos**:
- **Crear técnico:** nombre, usuario (ej. `jperez`) y teléfono. El sistema muestra **una sola vez**
  una contraseña temporal: entréguela al técnico. Al ingresar, se le pedirá crear la suya.
- **Restablecer contraseña:** si el técnico la olvidó. Genera una nueva temporal y cierra sus sesiones.
- **Desactivar:** si el técnico ya no trabaja con ustedes. No puede ingresar más, pero su historial se conserva.
  Si tenía reportes en proceso, edítelos o cancélelos y vuelva a crearlos para otro técnico.

## Su contraseña
En **Mi contraseña** puede cambiarla. Si la olvida, quien administra el servidor puede restablecerla
con el comando `admin:create` (ver docs/DESPLIEGUE.md, paso 5).

## Buenas prácticas
- Escriba direcciones completas y un punto de referencia claro.
- Revise los reportes **Por revisar** a diario.
- No comparta su usuario: la bitácora registra quién hizo cada cambio.
