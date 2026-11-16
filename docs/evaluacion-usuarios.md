# Evaluación de tareas con personas

Estado inicial: sin resultados de usuarios reales. Las pruebas automatizadas verifican funcionamiento y accesibilidad técnica, pero no demuestran facilidad de uso con personas.

## Preparación

1. Usa una instalación independiente de prueba y datos ficticios. No crees ni cierres órdenes reales para evaluar la interfaz.
2. Invita a participantes de los perfiles que utilizarán el sistema. Incluye producción, almacén y administración; varía experiencia, dispositivo y uso de teclado.
3. Explica el propósito, la información que se registrará y cuándo se borrará. No se graba pantalla, voz, contraseñas ni acciones. Acuerda un código anónimo como P01.
4. Abre `/evaluacion` como observador y el sistema de prueba en otra pestaña. Marca las dos confirmaciones solo cuando se cumplan. Si el navegador ya contiene resultados, se mostrarán después de autorizar su lectura.

## Guion

Prepara para cada tarea un código, producto y período concretos que existan en los datos ficticios. Lee el objetivo sin señalar los controles. Inicia el cronómetro al terminar de leerlo. Pide a la persona que explique qué está buscando. Intervén solo cuando lo necesite; registra cada ayuda y el punto de bloqueo. No cuentes una tarea incompleta como éxito.

| Tarea | Criterio de finalización |
| --- | --- |
| Encontrar una orden | Identifica su estado y la siguiente acción sin ejecutarla. |
| Revisar material | Distingue existencias, reservas y disponibilidad del material indicado. |
| Crear una orden | Guarda una orden de prueba con producto, responsable y fechas correctos. |
| Resolver incidencia | Documenta una solución válida en la incidencia ficticia indicada. |
| Obtener reporte | Aplica el período solicitado y descarga el resultado. |

## Medición y decisiones

La herramienta conserva el resultado, duración con pausas, cantidad de ayudas, dispositivo elegido y una nota opcional. Muestra tasa de finalización y resultados por tarea; el tiempo medio incluye solo tareas completadas y se indica expresamente. Compara la misma tarea y condiciones antes y después de un cambio. Con pocas observaciones, interpreta las cifras como señales para investigar y no como una estimación representativa de toda la población.

Para cada dificultad repetida, registra: evidencia anónima, paso donde ocurre, consecuencia, propuesta concreta, responsable y resultado de la repetición. Prioriza bloqueos y errores de registro antes que preferencias visuales. No marques los criterios del piloto como aprobados automáticamente.

## Conservación

Las observaciones se guardan en `localStorage` del navegador del observador tras la autorización; no se transmiten a la API. Desmarcar la autorización pausa la evaluación y descarta una tarea en curso, pero no elimina lo guardado. Utiliza **Borrar registros** y confirma para eliminar los datos locales. Los JSON descargados deben gestionarse y borrarse por separado. Acuerda una fecha de eliminación antes de comenzar y protege el perfil del equipo.
