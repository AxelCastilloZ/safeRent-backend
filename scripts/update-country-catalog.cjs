// Reproducible local snapshot. Run only when deliberately updating the catalog.
const fs = require('node:fs');
const path = require('node:path');
const base = 'https://raw.githubusercontent.com/unicode-org/cldr-json/48.2.0/';
const snapshotDate = '2026-10-20';
(async () => {
  const read = async (file) => {
    const response = await fetch(base + file, {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('CLDR download failed');
    return response.json();
  };
  const [currencyData, territoryData] = await Promise.all([
    read('cldr-json/cldr-core/supplemental/currencyData.json'),
    read('cldr-json/cldr-core/supplemental/territoryInfo.json'),
  ]);
  const mapping = {};
  for (const code of Object.keys(
    territoryData.supplemental.territoryInfo,
  ).sort()) {
    if (!/^[A-Z]{2}$/.test(code) || code === 'ZZ') continue;
    const current = (currencyData.supplemental.currencyData.region[code] || [])
      .flatMap((entry) => Object.entries(entry))
      .filter(
        ([, info]) =>
          info._tender !== 'false' &&
          (!info._from || info._from <= snapshotDate) &&
          (!info._to || info._to >= snapshotDate),
      );
    mapping[code] = current[0]?.[0] ?? null;
  }
  const output = path.join(__dirname, '../src/currency/country-currencies.ts');
  fs.writeFileSync(
    output,
    '// Generated from Unicode CLDR JSON 48.2.0; snapshot 2026-10-20.\n' +
      '// Source/license: https://github.com/unicode-org/cldr-json/tree/48.2.0\n' +
      '// Multiple tender currencies use the first CLDR entry; users can override it.\n' +
      'export const COUNTRY_CURRENCIES: Readonly<Record<string, string | null>> = ' +
      JSON.stringify(mapping, null, 2) +
      ';\n',
  );
  const response = await fetch(base + 'LICENSE', {
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('CLDR license download failed');
  fs.writeFileSync(
    path.join(__dirname, '../docs/unicode-cldr-LICENSE.txt'),
    await response.text(),
  );
  console.log(
    'Local catalog generated: ' +
      Object.keys(mapping).length +
      ' countries/territories.',
  );
})().catch(() => {
  console.error('Country catalog generation failed.');
  process.exitCode = 1;
});
