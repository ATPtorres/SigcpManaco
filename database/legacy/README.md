# Datos originales del prototipo

`original-demo-v1.json` reproduce los registros de `seed()` del commit `88eae434faeaf4c284007646cc67c5577bd8f5f2`, anterior a la implementación MySQL:

- 6 materiales con sus saldos y mínimos.
- 4 modelos, 26 variantes al separar tallas.
- 8 órdenes y 2 incidencias.
- 4 responsables distintos.

Son datos ficticios del repositorio, no registros operativos de MANACO. El código original calculaba fechas relativas al día de apertura; para hacer la migración reproducible se fijó la fecha base **2026-10-20**. El evento inicial de demostración usa esa fecha de referencia. No se afirma haber recuperado una copia privada del navegador ni horas reales de fabricación.

La importación conserva el archivo completo, su hash y el mapa de identificadores en `IMPORTACION_LEGACY`. Las decisiones para los campos que no existían están documentadas en `docs/migracion-v1.md`. No se inventan movimientos anteriores, contratos, tarifas, precios, etapas físicas ni conteos de calidad.
