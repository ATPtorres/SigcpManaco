ALTER TABLE USUARIO ADD CONSTRAINT chk_usuario_rol CHECK(rol IN ('Administrador','Operador','Consulta'));
