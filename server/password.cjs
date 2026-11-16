const { z } = require('zod');
const weak = new Set(['password1234', 'password123456', 'admin12345678', 'administrador', 'qwerty12345678', '123456789012', '1234567890123456']);
const passwordSchema = z.string().min(12, 'Utiliza al menos 12 caracteres.').max(200)
  .refine(value => !weak.has(value.toLowerCase()) && new Set(value.toLowerCase()).size >= 5,
    'Evita contraseñas comunes, secuencias conocidas o caracteres repetidos.');
function initialPassword(value) {
  const result = passwordSchema.safeParse(value);
  if (!result.success) throw Error('Configura APP_PASSWORD en .env con una contraseña propia de al menos 12 caracteres, sin secuencias comunes. No se creó ni cambió ninguna cuenta.');
  return result.data;
}
module.exports = { passwordSchema, initialPassword };
