# SafeRent

**SafeRent** es una plataforma web para alquilar vivienda con información real. Reúne en un solo lugar las propiedades en un mapa, las citas de visita, la mensajería interna, las reservas, las calificaciones y la experiencia de quienes ya vivieron en cada propiedad, para que el inquilino decida con más información y el propietario encuentre inquilinos de confianza.

Proyecto Final del curso EIF-409 Aplicaciones Informáticas Globales, Universidad Nacional, Sede Regional Chorotega. Equipo Binarios, II Ciclo 2026.

## Contenido

- [Qué hace SafeRent](#qué-hace-saferent)
- [Arquitectura y tecnologías](#arquitectura-y-tecnologías)
- [Ejecutar la aplicación](#ejecutar-la-aplicación)
- [Datos de ejemplo y recorrido sugerido](#datos-de-ejemplo-y-recorrido-sugerido)
- [Servicios externos (opcionales)](#servicios-externos-opcionales)
- [Pruebas y calidad](#pruebas-y-calidad)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Roles y seguridad](#roles-y-seguridad)
- [Repositorios y equipo](#repositorios-y-equipo)

## Qué hace SafeRent

| Para quién | Qué puede hacer |
| --- | --- |
| **Inquilino** | Explorar propiedades en un mapa y filtrarlas por servicios, habitaciones, rango de precio y entorno (agua, electricidad, Internet, cercanía a universidades y zonas de co-working, área de trabajo). Ver el detalle con fotos, video del recorrido, calificaciones y experiencia de otros inquilinos. Agendar una cita eligiendo día y hora libres en un calendario. Conversar con el propietario sin exponer datos personales. Guardar propiedades, comentar y calificar la propiedad en la que tuvo una reserva, y responder una encuesta al terminar su estadía. |
| **Propietario** | Publicar propiedades con un asistente (datos, servicios, ubicación en el mapa, fotos y hasta 2 videos), definir horarios de atención, confirmar, proponer otra hora o cancelar citas, reservar la propiedad a un inquilino, quitar la reserva con un motivo, consultar el historial de alquileres y calificar a sus inquilinos. |
| **Administrador** | Revisar cada propiedad enviada (aprobar, pedir cambios o rechazar con una nota), gestionar usuarios y roles, moderar comentarios, administrar el catálogo de servicios y conversar directamente con usuarios. |

Funciones que destacan:

- **Citas de visita con calendario:** el primero que pide un horario lo retiene durante 48 horas, hay una cita activa por inquilino y propiedad, y el propietario puede activar la confirmación automática. Recordatorio 24 horas antes y vencimiento automático de solicitudes sin respuesta.
- **Reservas con historial:** reserva manual desde una cita confirmada o desde la conversación, aviso al inquilino al entrar a la plataforma y por correo, e historial de alquileres por propiedad y por inquilino.
- **Calificaciones en dos sentidos:** el inquilino califica la propiedad (1 a 5) y el propietario califica al inquilino, con un perfil que muestra el promedio.
- **Encuesta de estadía:** al terminar una reserva, el inquilino cuenta cómo fueron en la práctica el agua, la electricidad, el Internet, las distancias y el área de trabajo. Los promedios se muestran en la propiedad y alimentan los filtros del explorador, de modo que el dato viene de quien vivió ahí y no de quien publica.
- **Globalización:** interfaz en español, inglés, francés y portugués; precios convertidos a la moneda elegida con tipos de cambio diarios; fechas y horas según la región y la zona horaria de cada propiedad.
- **Avisos por correo** en el idioma del usuario: recuperación de contraseña, citas, recordatorios y reservas.

## Arquitectura y tecnologías

```text
┌──────────────────────────┐        HTTP / JSON         ┌──────────────────────────┐
│  Frontend                │ ─────────────────────────▶ │  Backend / API REST      │
│  React + Vite            │ ◀───────────────────────── │  NestJS + TypeORM        │
│  http://localhost:5173   │                            │  http://localhost:3000   │
└──────────────────────────┘                            └────────────┬─────────────┘
                                                                     │
        ┌──────────────┬───────────────┬──────────────┬──────────────┴───┐
        ▼              ▼               ▼              ▼                  ▼
   PostgreSQL      Brevo           Dropbox      currencyapi.net     Geoapify
   (datos)        (correos)   (fotos y videos) (tipos de cambio)  (direcciones)
```

El proyecto se divide en **dos repositorios**: el cliente web y la API. El cliente nunca guarda claves de servicios externos; todas viven en el backend.

- **Frontend:** React 19 y TypeScript con Vite, Tailwind CSS 4, TanStack Router y TanStack Query, i18next, y mapas con Leaflet y OpenStreetMap (sin clave).
- **Backend:** NestJS 11 y TypeScript, TypeORM con PostgreSQL, autenticación con JWT y contraseñas con bcrypt, tareas programadas con `@nestjs/schedule` y pruebas con Jest.
- **Servicios externos:** Brevo (correo), Dropbox (fotografías y videos), currencyapi.net (tipos de cambio) y Geoapify (búsqueda de direcciones). Todos son opcionales para probar la aplicación; ver [Servicios externos](#servicios-externos-opcionales).

## Ejecutar la aplicación

Se necesita una base de datos PostgreSQL vacía, el backend y el frontend. No hace falta ninguna cuenta externa para empezar.

### Requisitos

- Node.js 20.19 o superior (se recomienda la versión LTS actual)
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)
- PostgreSQL. La forma más rápida es con Docker; si prefieres una instalación local, crea una base de datos vacía llamada `saferent`.

### 1. Clonar los dos repositorios en una misma carpeta

```bash
mkdir saferent && cd saferent
git clone https://github.com/AxelCastilloZ/safeRent-backend.git
git clone https://github.com/AxelCastilloZ/safeRent-frontent.git
```

### 2. Base de datos

Con Docker:

```bash
docker run --name saferent-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=saferent -p 5432:5432 -d postgres:16
```

### 3. Backend

```bash
cd safeRent-backend
pnpm install
```

Crea un archivo `.env` en `safeRent-backend/` con este contenido (valores listos para una instalación local):

```env
# Base de datos
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=saferent

# API
PORT=3000
FRONTEND_URL=http://localhost:5173
JWT_SECRET=escribe-aqui-una-frase-larga-y-aleatoria
# Genera la clave con: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
PASSWORD_RECOVERY_ENCRYPTION_KEY=

# Correo y tipos de cambio: valores de relleno para poder arrancar sin cuentas externas
BREVO_API_KEY=clave-de-relleno
BREVO_SENDER_EMAIL=saferent@example.com
BREVO_SENDER_NAME=SafeRent
VISIT_EMAILS_ENABLED=false
CURRENCY_SYNC_ENABLED=false
```

Arranca la API:

```bash
pnpm start:dev   # API en http://localhost:3000, con recarga automática
```

La primera vez que arranca, TypeORM **crea todas las tablas** a partir de las entidades (en producción se usa `DB_SYNCHRONIZE=false` y se aplican las migraciones de `src/migrations/`). Deja la API corriendo y continúa con el paso siguiente.

### 4. Datos iniciales

Una base nueva está vacía y la aplicación necesita tres roles y los catálogos de tipos de propiedad y de servicios. Guarda este SQL en un archivo `datos-iniciales.sql`:

```sql
INSERT INTO role (name, description) VALUES
  ('ADMIN', 'Administrador'),
  ('OWNER', 'Propietario'),
  ('CLIENT', 'Inquilino');

INSERT INTO type_of_property (name, "catalogCode") VALUES
  ('Casa', 'type_house'),
  ('Apartamento', 'type_apartment'),
  ('Habitación', 'type_room'),
  ('Estudio', 'type_studio');

INSERT INTO service (name, icono, "catalogCode") VALUES
  ('WiFi', 'wifi', 'service_wifi'),
  ('Agua caliente', 'shower-head', 'service_hot_water'),
  ('Estacionamiento', 'car', 'service_parking'),
  ('Lavandería', 'washing-machine', 'service_laundry'),
  ('Aire acondicionado', 'air-vent', 'service_air_conditioning'),
  ('Cocina', 'cooking-pot', 'service_kitchen'),
  ('Seguridad', 'shield-check', 'service_security'),
  ('Piscina', 'waves', 'service_pool');
```

y ejecútalo contra la base (con el contenedor de Docker del paso 2; si usas otra instalación, pega el SQL en psql, pgAdmin o DBeaver):

```bash
docker exec -i saferent-db psql -U postgres -d saferent < datos-iniciales.sql
```

Ejecútalo **una sola vez**, después de que la API haya arrancado por primera vez.

### 5. Frontend

En otra terminal:

```bash
cd safeRent-frontent
pnpm install
pnpm dev
```

Abre <http://localhost:5173>. En desarrollo **no hace falta ningún archivo `.env`**: Vite reenvía las peticiones que empiezan con `/api` al backend en `http://localhost:3000`. Si el backend corre en otra dirección, o para producción, crea un `.env` con `VITE_API_URL=https://tu-backend.example.com`.

### Comandos útiles

| Dónde | Comando | Qué hace |
| --- | --- | --- |
| Backend | `pnpm start:dev` | API en modo desarrollo |
| Backend | `pnpm build` y `pnpm start:prod` | Compila y ejecuta la API para producción |
| Backend | `pnpm test` | Pruebas automatizadas con Jest |
| Frontend | `pnpm dev` | Servidor de desarrollo con recarga automática |
| Frontend | `pnpm build` | Revisa los textos, compila y genera `dist/` |
| Frontend | `pnpm preview` | Sirve localmente la versión compilada |
| Frontend | `pnpm lint` | Revisa el estilo del código |
| Frontend | `pnpm i18n:check` | Verifica que cada texto exista en los cuatro idiomas |

> `pnpm build` del frontend también compara los textos de los correos con los del backend, por eso los dos repositorios deben estar en carpetas hermanas, como en el paso 1.

## Datos de ejemplo y recorrido sugerido

### Crear las cuentas

1. Abre <http://localhost:5173/register> y registra tres cuentas, por ejemplo `admin@ejemplo.com`, `propietario@ejemplo.com` e `inquilino@ejemplo.com`. La contraseña debe tener al menos 8 caracteres, con mayúscula, minúscula, número y símbolo. Toda cuenta nueva nace como inquilino.
2. Guarda este SQL en `datos-ejemplo.sql` y ejecútalo igual que en el paso 4 (`docker exec -i saferent-db psql -U postgres -d saferent < datos-ejemplo.sql`). Si usaste otros correos, cámbialos en el archivo antes de ejecutarlo.

```sql
-- Rol de administrador y de propietario para dos de las cuentas
INSERT INTO user_role ("userId", "roleId")
SELECT u.id, r.id FROM "user" u, role r WHERE u.email = 'admin@ejemplo.com' AND r.name = 'ADMIN';

INSERT INTO user_role ("userId", "roleId")
SELECT u.id, r.id FROM "user" u, role r WHERE u.email = 'propietario@ejemplo.com' AND r.name = 'OWNER';

-- Tres propiedades de ejemplo, ya aprobadas, del propietario
INSERT INTO property (title, description, cost, "typeOfCoin", address, latitude, longitude, guest, rooms, status, "ownerId", "typeOfPropertyId")
SELECT v.title, v.description, v.cost, 'CRC', v.address, v.lat, v.lng, v.guest, v.rooms, 'ACTIVE', o.id, t.id
FROM (VALUES
  ('Apartamento cerca de la universidad', 'Apartamento amueblado a pocos minutos de la universidad, con cocina equipada e Internet incluido.', 180000, 'Barrio San Martín, Nicoya, Guanacaste', 10.1483, -85.4521, 3, 2, 'Apartamento'),
  ('Habitación para estudiante con baño privado', 'Habitación tranquila con escritorio y baño privado, ideal para estudiar.', 95000, 'Barrio Pueblo Nuevo, Nicoya, Guanacaste', 10.1521, -85.4563, 1, 1, 'Habitación'),
  ('Casa con patio y estacionamiento', 'Casa amplia para compartir, con patio, estacionamiento y vigilancia.', 320000, 'Barrio El Carmen, Nicoya, Guanacaste', 10.1437, -85.4468, 5, 3, 'Casa')
) AS v(title, description, cost, address, lat, lng, guest, rooms, type_name)
JOIN "user" o ON o.email = 'propietario@ejemplo.com'
JOIN type_of_property t ON t.name = v.type_name;

-- Servicios de cada propiedad
INSERT INTO property_services_service ("propertyId", "serviceId")
SELECT p.id, s.id
FROM (VALUES
  ('Apartamento cerca de la universidad', 'WiFi'), ('Apartamento cerca de la universidad', 'Agua caliente'), ('Apartamento cerca de la universidad', 'Cocina'),
  ('Habitación para estudiante con baño privado', 'WiFi'), ('Habitación para estudiante con baño privado', 'Lavandería'),
  ('Casa con patio y estacionamiento', 'WiFi'), ('Casa con patio y estacionamiento', 'Estacionamiento'), ('Casa con patio y estacionamiento', 'Seguridad'), ('Casa con patio y estacionamiento', 'Cocina')
) AS x(title, service_name)
JOIN property p ON p.title = x.title
JOIN service s ON s.name = x.service_name;

-- Una estadía ya terminada del inquilino en la primera propiedad, con su encuesta
INSERT INTO reservation ("startedAt", "endedAt", "endReason", "propertyId", "tenantId", "ownerId")
SELECT now() - interval '90 days', now() - interval '30 days', 'Fin del contrato', p.id, t.id, p."ownerId"
FROM property p, "user" t
WHERE p.title = 'Apartamento cerca de la universidad' AND t.email = 'inquilino@ejemplo.com';

INSERT INTO stay_survey ("reservationId", "propertyId", "tenantId", "waterStability", "electricityStability", "internetMbps", "universityKm", "coworkingKm", "hasWorkArea")
SELECT r.id, r."propertyId", r."tenantId", 4, 5, 80, 1.2, 3.5, true
FROM reservation r JOIN "user" t ON t.id = r."tenantId"
WHERE t.email = 'inquilino@ejemplo.com';
```

Las propiedades de ejemplo no tienen fotografías: subir fotos y videos requiere Dropbox (ver abajo).

### Recorrido sugerido

1. **Sin iniciar sesión:** abrir `/explorar`. Hay tres propiedades en un mapa. Abrir **Precio y entorno** y pedir, por ejemplo, Internet de 50 Mbps o más: queda la propiedad «Apartamento cerca de la universidad», porque su estadía de ejemplo tiene una encuesta con 80 Mbps. Con 100 Mbps o más no queda ninguna.
2. **Detalle de la propiedad:** abrir esa propiedad y ver la sección «Experiencia de inquilinos» con los promedios de la encuesta.
3. **Como inquilino:** iniciar sesión con la cuenta de inquilino, agendar una cita desde el detalle de una propiedad y revisar **Mis citas** y **Mis reservaciones**, donde está la encuesta de estadía ya respondida y editable.
4. **Como propietario:** iniciar sesión con la cuenta de propietario, ver la solicitud de cita y confirmarla, proponer otra hora o cancelarla, y definir los horarios de atención de una propiedad.
5. **Como administrador:** iniciar sesión con la cuenta de administrador y recorrer revisión de propiedades, usuarios, comentarios y servicios.

## Servicios externos (opcionales)

La aplicación arranca y se puede recorrer sin ninguna cuenta externa. Cada servicio activa una función concreta:

| Servicio | Variables del backend | Qué pasa sin él | Para activarlo |
| --- | --- | --- | --- |
| **Dropbox** | `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`, `DROPBOX_REFRESH_TOKEN`, `DROPBOX_ROOT_FOLDER`, `DROPBOX_REDIRECT_URI` | No se pueden subir fotografías ni videos de propiedades nuevas. | Seguir `docs/dropbox.md` del backend y ejecutar `pnpm dropbox:connect`. Hay un ejemplo en `.env.dropbox.example`. |
| **Geoapify** | `GEOAPIFY_API_KEY` | No hay sugerencias de dirección al publicar; la ubicación se puede marcar con un clic en el mapa. | Crear una clave gratuita en geoapify.com. |
| **Brevo** | `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` | No se envían correos (recuperación de contraseña, citas y reservas). Las acciones del usuario nunca fallan por esto. | Crear una cuenta en brevo.com, autorizar la IP del servidor y quitar `VISIT_EMAILS_ENABLED=false`. Hay un ejemplo en `.env.brevo.example`. |
| **currencyapi.net** | `CURRENCY_API_KEY`, `CURRENCY_SYNC_ENABLED` | No hay conversión de monedas: los precios se muestran en la moneda en que se publicaron. | Poner la clave y quitar `CURRENCY_SYNC_ENABLED=false`. Hay un ejemplo en `.env.currency.example`. |

Brevo solo envía desde direcciones IP autorizadas: si un correo falla con error 401, hay que autorizar la IP desde la que corre la API en el panel de Brevo. Los valores de `BREVO_*` deben existir (aunque sean de relleno) para que la API arranque.

## Pruebas y calidad

```bash
# backend
pnpm test           # pruebas automatizadas con Jest
pnpm test:cov       # con cobertura
pnpm lint

# frontend
pnpm lint
pnpm build          # incluye la verificación de textos en los cuatro idiomas
```

La carpeta `scripts/` del backend incluye verificaciones contra la base configurada en `.env`, por ejemplo `check-visits.ts`, `check-tenant-ratings.ts` y `check-stay-surveys.ts`:

```bash
npx ts-node --transpile-only scripts/check-stay-surveys.ts
```

Cada una corre dentro de una transacción que se revierte, así que no deja datos. Necesitan las tablas y los datos iniciales de los pasos anteriores.

## Estructura del proyecto

**Backend** (`src/`, cada carpeta es un módulo de NestJS):

| Módulo | Ruta base | Responsabilidad |
| --- | --- | --- |
| `auth` | `/auth` | Registro, inicio de sesión, perfil, cambio y recuperación de contraseña, idioma y moneda |
| `user`, `role` | `/users`, `/roles` | Usuarios y roles (solo administrador) |
| `property` | `/properties` | Publicación (fotos y videos), revisión, listado público con filtros, detalle y ubicación |
| `service` | `/service` | Catálogo de servicios con traducciones |
| `comment` | `/comments` | Comentarios y calificaciones de propiedades, y moderación |
| `messages` | `/conversations` | Conversaciones, mensajes y mensajes sin leer |
| `visit` | `/visits` | Citas: horarios, solicitudes, confirmación, recordatorios y vencimiento |
| `reservation` | `/reservations` | Reservas, historial de alquileres y avisos |
| `saved-property` | `/saved-properties` | Propiedades guardadas |
| `tenant-rating` | `/tenant-ratings` | Calificaciones de inquilinos por los propietarios |
| `stay-survey` | `/stay-surveys` | Encuesta de estadía y promedios por propiedad |
| `property-view` | `/property-views` | Contador de personas que abrieron una propiedad |
| `currency` | `/currency` | Tipos de cambio y conversión de precios |
| `mail`, `dropbox` | — | Correos con Brevo y almacenamiento de fotos y videos |

**Frontend** (`src/`):

```text
src/
├── Modules/          Un directorio por funcionalidad
│   ├── Auth          Registro, inicio de sesión, perfil y recuperación de contraseña
│   ├── Property      Publicación (fotos y videos) y detalle público
│   ├── Explore       Exploración, mapa y filtros de precio y entorno
│   ├── LandingPage   Página principal
│   ├── Visits        Citas de visita y calendario
│   ├── Reservations  Reservas, historial y aviso al inquilino
│   ├── Messages      Conversaciones
│   ├── Comments      Comentarios y calificaciones de propiedades
│   ├── TenantRatings Calificaciones de inquilinos
│   ├── StaySurvey    Encuesta de estadía y sus promedios
│   ├── PropertyViews Contador de vistas
│   ├── SavedProperties, Services, Users, Support, Legal, About
│   └── Dashboard     Marco, menús y pantallas de cada rol
├── i18n/locales/     Textos en es, en, fr y pt (un archivo JSON por tema)
├── api/              Cliente HTTP
└── routes/           Árbol de rutas
```

Pantallas principales:

| Ruta | Para quién | Qué muestra |
| --- | --- | --- |
| `/` | Todos | Página principal con buscador, filtros rápidos y propiedades destacadas |
| `/explorar` | Todos | Mapa, búsqueda y filtros (servicios, habitaciones, precio y entorno) |
| `/property_detail/:id` | Todos | Detalle con videos, calificaciones, experiencia de los inquilinos y agendar cita |
| `/owner_properties/:id` | Todos | Propiedades publicadas de un propietario |
| `/login`, `/register` | Visitantes | Inicio de sesión y registro |
| `/dashboard` | Inquilino | Inicio con avisos, citas, reservaciones y encuestas de estadía, mensajes, guardadas y calificaciones |
| `/dashboard/owner` | Propietario | Propiedades, citas con disponibilidad, mensajes y ajustes |
| `/dashboard/admin` | Administrador | Revisión de propiedades, usuarios, comentarios y servicios |

Los textos de la interfaz viven en `src/i18n/locales/<idioma>/<tema>.json` del frontend. Para agregar o cambiar uno, se agrega con la misma clave en los **cuatro** idiomas y se ejecuta `pnpm i18n:check`.

## Roles y seguridad

- Tres roles: `CLIENT` (inquilino), `OWNER` (propietario) y `ADMIN` (administrador). El servidor valida el rol en cada ruta protegida; la interfaz solo oculta lo que no corresponde.
- Las rutas marcadas como públicas no exigen sesión; todas las demás piden un token válido.
- Las contraseñas se guardan con bcrypt, y al restablecer una contraseña se invalidan los tokens anteriores.
- Los datos de entrada se validan antes de procesarse.
- Las claves de los servicios externos viven solo en el backend, y el archivo `.env` no se sube al repositorio.

**Tareas programadas** (backend): vencimiento de solicitudes de cita sin respuesta, recordatorios 24 horas antes de una cita confirmada, resumen periódico de solicitudes pendientes para el propietario y sincronización diaria de los tipos de cambio. Los trabajos se reclaman con bloqueo en la base de datos, así que varios servidores corriendo a la vez no repiten avisos.

## Repositorios y equipo

- Frontend: <https://github.com/AxelCastilloZ/safeRent-frontent>
- Backend: <https://github.com/AxelCastilloZ/safeRent-backend>

Equipo Binarios: Samuel Barrantes Orozco, Brenda Obando Gómez, José Daniel Román Fernández y Axel Castillo Zuñiga. Profesor del curso: Ing. José Abraham Benavides Vargas.
