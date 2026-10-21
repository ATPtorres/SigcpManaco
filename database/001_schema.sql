CREATE TABLE IF NOT EXISTS UNIDAD_MEDIDA (
 unidad_id INT PRIMARY KEY AUTO_INCREMENT, nombre VARCHAR(80) NOT NULL UNIQUE, simbolo VARCHAR(16) NOT NULL UNIQUE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS LINEA_CALZADO (
 linea_id INT PRIMARY KEY AUTO_INCREMENT, nombre VARCHAR(80) NOT NULL UNIQUE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS TALLA (
 talla_id INT PRIMARY KEY AUTO_INCREMENT, sistema VARCHAR(20) NOT NULL, valor VARCHAR(16) NOT NULL, UNIQUE(sistema,valor)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS COLOR (
 color_id INT PRIMARY KEY AUTO_INCREMENT, nombre VARCHAR(80) NOT NULL UNIQUE, tono VARCHAR(7) NOT NULL DEFAULT '#365b83'
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS MATERIAL (
 material_id INT PRIMARY KEY AUTO_INCREMENT, codigo VARCHAR(40) NOT NULL UNIQUE, nombre VARCHAR(120) NOT NULL,
 observacion TEXT NULL, unidad_id INT NOT NULL, costo_referencia DECIMAL(14,4) NOT NULL DEFAULT 0,
 stock_minimo DECIMAL(14,4) NOT NULL DEFAULT 0, activo BOOLEAN NOT NULL DEFAULT TRUE,
 FOREIGN KEY(unidad_id) REFERENCES UNIDAD_MEDIDA(unidad_id), CHECK(costo_referencia>=0), CHECK(stock_minimo>=0)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS MODELO_CALZADO (
 modelo_id INT PRIMARY KEY AUTO_INCREMENT, codigo VARCHAR(40) NOT NULL UNIQUE, nombre VARCHAR(120) NOT NULL,
 linea_id INT NOT NULL, descripcion TEXT NULL, FOREIGN KEY(linea_id) REFERENCES LINEA_CALZADO(linea_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS PRODUCTO_CALZADO (
 producto_id INT PRIMARY KEY AUTO_INCREMENT, sku VARCHAR(80) NOT NULL UNIQUE, modelo_id INT NOT NULL,
 talla_id INT NOT NULL, color_id INT NOT NULL, activo BOOLEAN NOT NULL DEFAULT TRUE,
 UNIQUE(modelo_id,talla_id,color_id), FOREIGN KEY(modelo_id) REFERENCES MODELO_CALZADO(modelo_id),
 FOREIGN KEY(talla_id) REFERENCES TALLA(talla_id), FOREIGN KEY(color_id) REFERENCES COLOR(color_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS ETAPA_FABRICACION (
 etapa_id INT PRIMARY KEY AUTO_INCREMENT, nombre VARCHAR(80) NOT NULL UNIQUE, descripcion TEXT NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS FICHA_FABRICACION (
 ficha_id INT PRIMARY KEY AUTO_INCREMENT, producto_id INT NOT NULL, version INT NOT NULL,
 fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, estado VARCHAR(20) NOT NULL DEFAULT 'Vigente',
 UNIQUE(producto_id,version), FOREIGN KEY(producto_id) REFERENCES PRODUCTO_CALZADO(producto_id),
 CHECK(version>0), CHECK(estado IN ('Borrador','Vigente','Archivada'))
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS FICHA_ETAPA (
 ficha_etapa_id INT PRIMARY KEY AUTO_INCREMENT, ficha_id INT NOT NULL, etapa_id INT NOT NULL,
 secuencia INT NOT NULL, minutos_estimados_por_par DECIMAL(12,4) NOT NULL DEFAULT 0,
 costo_mano_obra_estimado_por_par DECIMAL(14,4) NOT NULL DEFAULT 0, UNIQUE(ficha_id,secuencia), UNIQUE(ficha_etapa_id,ficha_id),
 FOREIGN KEY(ficha_id) REFERENCES FICHA_FABRICACION(ficha_id), FOREIGN KEY(etapa_id) REFERENCES ETAPA_FABRICACION(etapa_id),
 CHECK(secuencia>0), CHECK(minutos_estimados_por_par>=0), CHECK(costo_mano_obra_estimado_por_par>=0)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS RECETA_MATERIAL (
 receta_id INT PRIMARY KEY AUTO_INCREMENT, ficha_etapa_id INT NOT NULL, material_id INT NOT NULL,
 cantidad_neta_por_par DECIMAL(14,4) NOT NULL, porcentaje_merma DECIMAL(7,4) NOT NULL DEFAULT 0,
 UNIQUE(ficha_etapa_id,material_id), FOREIGN KEY(ficha_etapa_id) REFERENCES FICHA_ETAPA(ficha_etapa_id),
 FOREIGN KEY(material_id) REFERENCES MATERIAL(material_id), CHECK(cantidad_neta_por_par>0), CHECK(porcentaje_merma BETWEEN 0 AND 100)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS TRABAJADOR_ZAPATERO (
 trabajador_id INT PRIMARY KEY AUTO_INCREMENT, codigo VARCHAR(40) NOT NULL UNIQUE, nombre_completo VARCHAR(120) NOT NULL,
 tipo_contratacion VARCHAR(40) NOT NULL, tarifa_hora_actual DECIMAL(14,4) NOT NULL DEFAULT 0,
 estado VARCHAR(20) NOT NULL DEFAULT 'Activo', CHECK(tarifa_hora_actual>=0), CHECK(estado IN ('Activo','Inactivo'))
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS TRABAJADOR_ETAPA (
 trabajador_id INT NOT NULL, etapa_id INT NOT NULL, PRIMARY KEY(trabajador_id,etapa_id),
 FOREIGN KEY(trabajador_id) REFERENCES TRABAJADOR_ZAPATERO(trabajador_id), FOREIGN KEY(etapa_id) REFERENCES ETAPA_FABRICACION(etapa_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS ORDEN_FABRICACION (
 orden_id INT PRIMARY KEY AUTO_INCREMENT, numero_orden VARCHAR(40) NOT NULL UNIQUE, ficha_id INT NOT NULL,
 responsable_id INT NOT NULL, cantidad_planificada INT NOT NULL, fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 inicio_programado DATETIME NOT NULL, fin_programado DATETIME NOT NULL, inicio_real DATETIME NULL, fin_real DATETIME NULL,
 estado VARCHAR(30) NOT NULL DEFAULT 'Pendiente', prioridad VARCHAR(20) NOT NULL DEFAULT 'Normal', evidencia_calidad TEXT NULL,
 UNIQUE(orden_id,ficha_id), FOREIGN KEY(ficha_id) REFERENCES FICHA_FABRICACION(ficha_id), FOREIGN KEY(responsable_id) REFERENCES TRABAJADOR_ZAPATERO(trabajador_id),
 CHECK(cantidad_planificada>0), CHECK(fin_programado>=inicio_programado), CHECK(fin_real IS NULL OR (inicio_real IS NOT NULL AND fin_real>=inicio_real)),
 CHECK(estado IN ('Pendiente','En producción','Control de calidad','Terminado','Despachado')), CHECK(prioridad IN ('Normal','Alta'))
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS DETALLE_ORDEN_ETAPA (
 detalle_etapa_id INT PRIMARY KEY AUTO_INCREMENT, orden_id INT NOT NULL, ficha_etapa_id INT NOT NULL, ficha_id INT NOT NULL,
 inicio_real DATETIME NULL, fin_real DATETIME NULL, cantidad_aceptada INT NOT NULL DEFAULT 0,
 cantidad_rechazada INT NOT NULL DEFAULT 0, estado VARCHAR(30) NOT NULL DEFAULT 'Pendiente', UNIQUE(orden_id,ficha_etapa_id),
 FOREIGN KEY(orden_id,ficha_id) REFERENCES ORDEN_FABRICACION(orden_id,ficha_id), FOREIGN KEY(ficha_etapa_id,ficha_id) REFERENCES FICHA_ETAPA(ficha_etapa_id,ficha_id),
 CHECK(cantidad_aceptada>=0), CHECK(cantidad_rechazada>=0), CHECK(estado IN ('Pendiente','En producción','Terminado')),
 CHECK(fin_real IS NULL OR (inicio_real IS NOT NULL AND fin_real>=inicio_real))
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS REQUERIMIENTO_MATERIAL (
 requerimiento_id INT PRIMARY KEY AUTO_INCREMENT, orden_id INT NOT NULL, ficha_etapa_id INT NOT NULL,
 material_id INT NOT NULL, cantidad_neta_por_par DECIMAL(14,4) NOT NULL, porcentaje_merma DECIMAL(7,4) NOT NULL DEFAULT 0,
 UNIQUE(orden_id,ficha_etapa_id,material_id), FOREIGN KEY(orden_id,ficha_etapa_id) REFERENCES DETALLE_ORDEN_ETAPA(orden_id,ficha_etapa_id),
 FOREIGN KEY(material_id) REFERENCES MATERIAL(material_id), CHECK(cantidad_neta_por_par>0), CHECK(porcentaje_merma BETWEEN 0 AND 100)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS PRESUPUESTO (
 presupuesto_id INT PRIMARY KEY AUTO_INCREMENT, orden_id INT NOT NULL, version INT NOT NULL, nombre VARCHAR(120) NOT NULL,
 fecha_emision DATE NOT NULL, vigente_desde DATE NOT NULL, vigente_hasta DATE NOT NULL, porcentaje_contingencia DECIMAL(7,4) NOT NULL DEFAULT 0,
 estado_aprobacion VARCHAR(20) NOT NULL DEFAULT 'Borrador', UNIQUE(orden_id,version), FOREIGN KEY(orden_id) REFERENCES ORDEN_FABRICACION(orden_id),
 CHECK(version>0), CHECK(vigente_hasta>=vigente_desde), CHECK(porcentaje_contingencia BETWEEN 0 AND 100),
 CHECK(estado_aprobacion IN ('Borrador','Aprobado','Rechazado'))
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS DETALLE_PRESUPUESTO (
 detalle_id INT PRIMARY KEY AUTO_INCREMENT, presupuesto_id INT NOT NULL, numero_linea INT NOT NULL, concepto VARCHAR(160) NOT NULL,
 tipo_costo VARCHAR(40) NOT NULL, unidad_id INT NOT NULL, cantidad DECIMAL(14,4) NOT NULL, costo_unitario_estimado DECIMAL(14,4) NOT NULL,
 UNIQUE(presupuesto_id,numero_linea), FOREIGN KEY(presupuesto_id) REFERENCES PRESUPUESTO(presupuesto_id), FOREIGN KEY(unidad_id) REFERENCES UNIDAD_MEDIDA(unidad_id),
 CHECK(numero_linea>0), CHECK(cantidad>0), CHECK(costo_unitario_estimado>=0)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS LOTE_MATERIAL (
 lote_id INT PRIMARY KEY AUTO_INCREMENT, material_id INT NOT NULL, codigo_lote VARCHAR(80) NOT NULL, fecha_recepcion DATE NOT NULL,
 UNIQUE(material_id,codigo_lote), FOREIGN KEY(material_id) REFERENCES MATERIAL(material_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS UBICACION (
 ubicacion_id INT PRIMARY KEY AUTO_INCREMENT, codigo VARCHAR(40) NOT NULL UNIQUE, descripcion VARCHAR(160) NOT NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS EXISTENCIA_MATERIAL (
 existencia_id INT PRIMARY KEY AUTO_INCREMENT, lote_id INT NOT NULL, ubicacion_id INT NOT NULL,
 UNIQUE(lote_id,ubicacion_id), FOREIGN KEY(lote_id) REFERENCES LOTE_MATERIAL(lote_id), FOREIGN KEY(ubicacion_id) REFERENCES UBICACION(ubicacion_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS RESERVA_MATERIAL (
 reserva_id INT PRIMARY KEY AUTO_INCREMENT, detalle_etapa_id INT NOT NULL, existencia_id INT NOT NULL,
 cantidad_pendiente DECIMAL(14,4) NOT NULL, fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, estado VARCHAR(20) NOT NULL DEFAULT 'Activa',
 UNIQUE(detalle_etapa_id,existencia_id), FOREIGN KEY(detalle_etapa_id) REFERENCES DETALLE_ORDEN_ETAPA(detalle_etapa_id),
 FOREIGN KEY(existencia_id) REFERENCES EXISTENCIA_MATERIAL(existencia_id), CHECK(cantidad_pendiente>=0), CHECK(estado IN ('Activa','Consumida','Liberada'))
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS MOVIMIENTO_MATERIAL (
 movimiento_id INT PRIMARY KEY AUTO_INCREMENT, existencia_id INT NOT NULL, detalle_etapa_id INT NULL,
 tipo_movimiento VARCHAR(20) NOT NULL, cantidad DECIMAL(14,4) NOT NULL, costo_unitario_aplicado DECIMAL(14,4) NOT NULL DEFAULT 0,
 fecha_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, motivo TEXT NULL,
 FOREIGN KEY(existencia_id) REFERENCES EXISTENCIA_MATERIAL(existencia_id), FOREIGN KEY(detalle_etapa_id) REFERENCES DETALLE_ORDEN_ETAPA(detalle_etapa_id),
 CHECK(tipo_movimiento IN ('Entrada','Salida','Consumo')), CHECK(cantidad>0), CHECK(costo_unitario_aplicado>=0)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS INCIDENCIA_PRODUCCION (
 incidencia_id INT PRIMARY KEY AUTO_INCREMENT, detalle_etapa_id INT NOT NULL, tipo VARCHAR(80) NOT NULL, descripcion TEXT NOT NULL,
 fecha_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, costo_estimado_impacto DECIMAL(14,4) NULL, estado VARCHAR(20) NOT NULL DEFAULT 'Abierta',
 fecha_cierre DATETIME NULL, resolucion TEXT NULL, severidad VARCHAR(10) NOT NULL DEFAULT 'Media', responsable_id INT NOT NULL,
 FOREIGN KEY(detalle_etapa_id) REFERENCES DETALLE_ORDEN_ETAPA(detalle_etapa_id), FOREIGN KEY(responsable_id) REFERENCES TRABAJADOR_ZAPATERO(trabajador_id),
 CHECK(costo_estimado_impacto IS NULL OR costo_estimado_impacto>=0), CHECK(estado IN ('Abierta','En atención','Resuelta')),
 CHECK(severidad IN ('Baja','Media','Alta')), CHECK(estado<>'Resuelta' OR (fecha_cierre IS NOT NULL AND CHAR_LENGTH(TRIM(resolucion))>0))
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS REGISTRO_MANO_OBRA (
 registro_id INT PRIMARY KEY AUTO_INCREMENT, detalle_etapa_id INT NOT NULL, trabajador_id INT NOT NULL, fecha DATE NOT NULL,
 horas_trabajadas DECIMAL(10,4) NOT NULL, tarifa_hora_aplicada DECIMAL(14,4) NOT NULL,
 FOREIGN KEY(detalle_etapa_id) REFERENCES DETALLE_ORDEN_ETAPA(detalle_etapa_id), FOREIGN KEY(trabajador_id) REFERENCES TRABAJADOR_ZAPATERO(trabajador_id),
 CHECK(horas_trabajadas>0 AND horas_trabajadas<=24), CHECK(tarifa_hora_aplicada>=0)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS USUARIO (
 usuario_id INT PRIMARY KEY AUTO_INCREMENT, nombre VARCHAR(80) NOT NULL UNIQUE, password_hash VARCHAR(256) NOT NULL,
 rol VARCHAR(20) NOT NULL DEFAULT 'Administrador', activo BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS SESION (
 token_hash CHAR(64) PRIMARY KEY, usuario_id INT NOT NULL, vence DATETIME NOT NULL,
 FOREIGN KEY(usuario_id) REFERENCES USUARIO(usuario_id), INDEX(vence)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS HISTORIAL_ORDEN (
 historial_id INT PRIMARY KEY AUTO_INCREMENT, orden_id INT NOT NULL, fecha_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 descripcion TEXT NOT NULL, actor VARCHAR(80) NOT NULL, FOREIGN KEY(orden_id) REFERENCES ORDEN_FABRICACION(orden_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS AUDITORIA (
 auditoria_id INT PRIMARY KEY AUTO_INCREMENT, fecha_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 accion VARCHAR(200) NOT NULL, actor VARCHAR(80) NOT NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS CRITERIO_PILOTO (
 criterio_id INT PRIMARY KEY, validado BOOLEAN NOT NULL DEFAULT FALSE, evidencia TEXT NOT NULL,
 fecha_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, CHECK(criterio_id BETWEEN 0 AND 9)
) ENGINE=InnoDB;
