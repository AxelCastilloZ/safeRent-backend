// One-time mapping reviewed against the public catalog. Runtime translation uses codes, never names.
export const catalogSeeds = {
  service: [
    ['WiFi', 'service_wifi'], ['Agua caliente', 'service_hot_water'],
    ['Estacionamiento', 'service_parking'], ['Lavandería', 'service_laundry'],
    ['Aire acondicionado', 'service_air_conditioning'], ['Cocina', 'service_kitchen'],
    ['Seguridad', 'service_security'], ['Piscina', 'service_pool'],
  ],
  type_of_property: [
    ['Casa', 'type_house'], ['Apartamento', 'type_apartment'],
    ['Habitación', 'type_room'], ['Estudio', 'type_studio'],
  ],
} as const;

export async function seedCatalogCodes(db: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) {
  for (const [table, entries] of Object.entries(catalogSeeds)) {
    for (const [name, code] of entries) {
      await db.query(`UPDATE "${table}" SET "catalogCode" = $1 WHERE "name" = $2 AND "catalogCode" IS NULL
        AND NOT EXISTS (SELECT 1 FROM "${table}" WHERE "catalogCode" = $1)`, [code, name]);
    }
  }
}
