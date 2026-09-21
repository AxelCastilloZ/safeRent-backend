# Catálogo de servicios

El catálogo contiene servicios reutilizables como Agua, Internet y Electricidad.
`Property` y `Service` tienen una relación muchos a muchos: una propiedad puede
seleccionar varios servicios y cada servicio puede pertenecer a varias propiedades.

La entidad canónica está en `src/service/entities/service.entity.ts`. Se conservan
la tabla `service` y la tabla intermedia `property_services_service`, por lo que
no se duplican los servicios ni se pierden las asociaciones existentes al mover
la entidad. Reinicia el backend para cargar los cambios. La configuración actual
usa `synchronize: true`; si se desactiva, una migración debe cambiar a `ON DELETE
RESTRICT` la clave foránea que referencia `service` en la tabla intermedia.

## Atributos

| Campo | Tipo | Reglas |
| --- | --- | --- |
| `id` | number | Generado por la base de datos |
| `name` | string | Obligatorio, único, máximo 100 caracteres |
| `icono` | string o null | Opcional, máximo 100 caracteres; identificador como `wifi` o `droplet` |
| `description` | string o null | Opcional, máximo 255 caracteres |

Los textos se guardan sin espacios al inicio o al final. Los nombres vacíos o
compuestos solo por espacios se rechazan. La unicidad del nombre conserva el
comportamiento de la base de datos existente (sensible a mayúsculas).

## Endpoints

Base local predeterminada: `http://localhost:4000` (o el puerto de `PORT`). También se admite `/service` como alias
para mantener compatible la ruta inicial generada por Nest.

| Método | Ruta | Resultado |
| --- | --- | --- |
| POST | `/services` | Crea un servicio; 201 |
| GET | `/services` | Devuelve el catálogo ordenado por nombre, o `[]`; 200 |
| GET | `/services/:id` | Consulta un servicio; 200 o 404 |
| PATCH | `/services/:id` | Actualiza únicamente los campos enviados; 200 |
| DELETE | `/services/:id` | Borra un servicio sin asociaciones; 204 |

La validación devuelve 400, los IDs inexistentes 404 y un nombre duplicado o
intentar borrar un servicio asignado a cualquier propiedad devuelve 409.
La protección contra borrado incluye propiedades no publicadas.

Crear un servicio (`POST /services`):

```json
{
  "name": "Agua",
  "icono": "droplet",
  "description": "La propiedad cuenta con servicio de agua potable."
}
```

Crear otro servicio en una petición separada:

```json
{
  "name": "Internet",
  "icono": "wifi",
  "description": "La propiedad cuenta con conexión a internet."
}
```

## Selección desde una propiedad

1. Consultar `GET /services` para llenar los checkboxes del formulario.
2. Enviar los IDs seleccionados como `serviceIds` en `POST /properties`, junto
   con los demás atributos obligatorios, o en `PATCH /properties/:id`.
3. Publicar la propiedad con `PATCH /properties/:id/publish` si todavía es borrador.
4. `GET /properties` incluye los objetos completos en `services` de las propiedades
   publicadas. Explorar ya utiliza esos datos en las tarjetas y filtros.

Ejemplo para `PATCH /properties/1` **si el catálogo devolvió los IDs 1 y 2**:

```json
{ "serviceIds": [1, 2] }
```

Los IDs deben ser enteros positivos, únicos y existentes. La actualización
reemplaza la selección completa. Omitir `serviceIds` conserva las asociaciones;
enviar `"serviceIds": []` las elimina, sin borrar los servicios del catálogo.

## Filtrar propiedades por servicios

`GET /properties?serviceIds=1,2` devuelve solo propiedades publicadas que tengan
**todos** los servicios seleccionados. También admite parámetros repetidos:
`GET /properties?serviceIds=1&serviceIds=2`. La misma búsqueda está disponible
en `GET /properties/active?serviceIds=1,2`.

Sin `serviceIds`, devuelve todas las publicaciones activas. Sin coincidencias
(incluyendo IDs válidos que no existen) devuelve `200` con `[]`. Un filtro vacío,
IDs no enteros, no positivos, duplicados o más de 50 IDs devuelve `400`.
Para quitar el filtro, omitir el parámetro por completo.

Cada resultado conserva todos sus servicios, archivos y demás relaciones;
el filtro no recorta el arreglo `services` de la propiedad. Explorar obtiene las
opciones desde `GET /services`, por lo que los servicios sin resultados siguen
visibles para poder cambiar o limpiar la selección.

## Permisos pendientes

Esta etapa implementa únicamente el catálogo y la relación. Por decisión de
alcance, no incluye autenticación ni roles: los endpoints todavía no restringen
las escrituras a administradores. Cuando se implemente autenticación, proteger
POST, PATCH y DELETE del catálogo con el rol administrador y obtener el
propietario desde la sesión autenticada para autorizar cambios a propiedades.
