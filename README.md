# SIGCP–MANACO

Aplicación de gestión y control de producción de calzado, implementada en HTML, CSS y JavaScript sin frameworks ni proceso de compilación.

## Abrir

Con Apache de XAMPP iniciado: **http://localhost/SIGCP%20manaco/**.

También se puede abrir `index.html` directamente, aunque se recomienda HTTP para mantener un origen estable para los datos locales. Las fuentes de Google Fonts son opcionales: sin Internet se usan las fuentes del sistema.

## Funciones

- Panel con indicadores calculados, gráfico por modelo, alertas y órdenes recientes.
- Alta y edición de productos, tallas, características y receta de materiales por par.
- Alta y edición de materiales, niveles mínimos, entradas y salidas con motivo e historial.
- Creación de órdenes con producto, talla, cantidad, fechas, prioridad y responsable.
- Flujo: Pendiente → En producción → Control de calidad → Terminado → Despachado.
- Validación y consumo de la receta al iniciar, una sola vez. No se permite stock negativo.
- Registro y atención de incidencias. El cierre requiere acción documentada.
- Cierre de producción sujeto a incidencias resueltas y evidencia de calidad.
- Búsqueda y filtros, reportes por fecha de creación, exportación CSV e impresión a PDF mediante el navegador.
- Respaldo JSON completo y restauración con validación de estructura y relaciones.
- Bitácora de cambios, guía de uso y lista de evidencias para el piloto.
- Diseño adaptable, navegación por teclado, diálogos accesibles y respeto de movimiento reducido.

## Alcance y datos

Los registros precargados son **ficticios**. El inventario inicial de la demostración representa el saldo posterior al consumo de las órdenes que ya están en producción; no se reconstruyen movimientos anteriores ficticios. En Datos y respaldo se puede comenzar sin datos tras confirmar.

Se utiliza `localStorage` con la clave `sigcp-manaco-v1`. No hay servidor de aplicación, autenticación, permisos efectivos ni base de datos compartida. La sesión «Área de producción» es demostrativa. No introducir información sensible. Exportar respaldos antes de borrar datos del navegador o cambiar de dispositivo. Usar una sola pestaña de edición a la vez.

El porcentaje de avance por orden representa su posición entre cinco estados, no una medición física de pares fabricados. El avance global es pares de órdenes terminadas o despachadas dividido por pares planificados. El cumplimiento de fechas compara el día de término con el día comprometido. El período de reportes filtra la fecha de creación de las órdenes. Los inventarios son siempre el saldo actual. Las métricas que requieren observación física o usuarios reales se muestran como «No medido».

Para un despliegue industrial es necesario incorporar backend, cuentas personales, autorización del lado del servidor, base de datos transaccional, auditoría protegida, gestión concurrente del stock y respaldos automáticos. Estos servicios no pueden ofrecerse de forma segura con archivos estáticos exclusivamente.

## Validación

```sh
node --check app.js
node tests/workflow.test.cjs
```

Las pruebas usan almacenamiento aislado en memoria: no modifican los datos del navegador.

## Archivos

- `index.html`: estructura de la aplicación.
- `styles.css`: identidad visual, adaptación, impresión y animación.
- `app.js`: estado, validaciones, módulos, exportación y respaldo.
- `docs/analisis-informe.md`: interpretación y trazabilidad del informe.
- `tests/workflow.test.cjs`: pruebas de los flujos críticos.
