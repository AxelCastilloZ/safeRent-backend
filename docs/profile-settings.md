# Perfil y seguridad desde Ajustes

La página de Ajustes compartida por cliente, propietario y administrador muestra el perfil completo. La edición se realiza en la misma tarjeta; el cambio de contraseña usa un modal de Material UI que conserva el contexto y borra sus campos al cerrarlo.

## Endpoints protegidos

Todos requieren JWT válido. El ID se toma exclusivamente de request.user.id; no se recibe un ID de usuario en la ruta ni se acepta desde el formulario.

- GET /auth/profile: id, cédula, nombre, apellidos, correo, teléfono, fecha de nacimiento, roles activos y fecha de registro. Nunca devuelve hash de contraseña ni campos internos de sesión.
- PATCH /auth/profile: nombre, primer apellido, segundo apellido opcional, correo, teléfono y fecha de nacimiento. El formulario envía todos estos campos. Cédula, roles, estado de cuenta y credenciales no son editables por este endpoint.
- POST /auth/change-password: currentPassword y password. La confirmación se valida en el frontend y no se envía.

El cambio de correo requiere currentPassword correcta, comprueba duplicados y revoca los enlaces de recuperación existentes y las solicitudes anteriores encoladas. El nuevo correo se usa para el login y las futuras recuperaciones. No implementa verificación de titularidad del nuevo correo mediante un segundo mensaje.

El cambio de contraseña verifica la contraseña actual bajo bloqueo de usuario, exige una nueva contraseña distinta y reutiliza las reglas de RegisterDto, incluidos los 72 bytes de bcrypt. La transacción actualiza el hash, incrementa sessionVersion y revoca todos los enlaces de recuperación. Las sesiones anteriores quedan inválidas. El modal muestra confirmación y lleva al login tras 2,5 segundos.

Perfil y cambios de seguridad comparten un límite de 10 operaciones cada 15 minutos por cuenta, persistido en password_recovery_limits. Los errores de validación/credenciales/duplicados se muestran con Alert de Material UI. La caché de perfil y sesión se actualiza tras editar para que el nombre del panel y el avatar reflejen los nuevos datos.

## Verificación

Compilaciones de frontend y backend correctas. ESLint de archivos nuevos y de la página modificada correcto. 67 pruebas seleccionadas pasan, incluyendo autenticación obligatoria, identidad de sesión, rechazo de inyección de ID/roles/contraseña en perfil, validación de campos y contraseñas, verificación de contraseña actual y revocación de sesiones/enlaces.

Prueba real PostgreSQL: scripts/check-profile-db.cjs crea una cuenta temporal y comprueba vista segura, edición, cambio de correo protegido y cambio de contraseña. Todos los cambios se revierten al terminar. No se modifican cuentas existentes ni se envían correos.

```powershell
npm run build
node scripts/check-profile-db.cjs
npm test -- --runInBand profile password-recovery brevo-mail register.spec jwt-auth.guard
```

Reiniciar el backend para cargar los endpoints. No se necesitan tablas o migraciones adicionales a las del flujo de recuperación ya implementado: utiliza password_recovery_limits, password_reset_tokens, sessionVersion y passwordChangedAt.
