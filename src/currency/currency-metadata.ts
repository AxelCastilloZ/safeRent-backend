// Plain decimal strings avoid losing precision before the conversion starts.
export const MONEY_AMOUNT_PATTERN = /^(0|[1-9]\d{0,14})(\.\d{1,6})?$/;

const currencies = new Set(Intl.supportedValuesOf('currency'));
const nonRentalUnits = new Set([
  'XAU',
  'XAG',
  'XPD',
  'XPT',
  'XTS',
  'XXX',
  'XDR',
  'XSU',
  'XUA',
]);

export function currencyFractionDigits(code: string): number | null {
  if (!currencies.has(code) || nonRentalUnits.has(code)) return null;
  return (
    new Intl.NumberFormat('en', {
      style: 'currency',
      currency: code,
    }).resolvedOptions().maximumFractionDigits ?? 2
  );
}
