# Ubicación de propiedades

Configurar `GEOAPIFY_API_KEY` en el `.env` del backend y reiniciar el servidor. Crear la clave en https://myprojects.geoapify.com/ . La clave permanece en el servidor; no usar una variable VITE para ella.

El endpoint autenticado `GET /properties/locations/search?text=...` devuelve hasta cinco sugerencias en español, sin restricciones por país. Tiene un timeout de ocho segundos y no expone errores ni credenciales del proveedor. Incluir ciudad y país en la búsqueda ayuda a distinguir direcciones con nombres similares, por ejemplo `Madrid, España` o `Ciudad de Panamá, Panamá`. La cobertura y precisión dependen de los datos del proveedor; las pruebas automatizadas usan respuestas simuladas y no verifican la cobertura real.

El flujo es Datos → Ubicación → Imágenes → Publicar. Los borradores permiten omitir la ubicación. Para publicar se requiere dirección y ambas coordenadas válidas. El usuario puede seleccionar una sugerencia, hacer clic en el mapa, arrastrar el pin o usar su ubicación actual. Editar el texto invalida el punto anterior hasta volver a seleccionarlo o confirmarlo en el mapa.

La búsqueda requiere conexión y una clave válida. Sin ella, sigue disponible la selección sobre el mapa. Probar direcciones reales antes de evaluar la precisión de cobertura; la ubicación sugerida siempre debe revisarse. Se conserva Leaflet/OpenStreetMap y se muestra atribución de Geoapify para las sugerencias.
