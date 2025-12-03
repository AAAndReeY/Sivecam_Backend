import { Brand } from '@prisma/client';

export function getBrand(brand: string | null) {
  if (!brand) return Brand.DAHUA;
  if (brand.toLowerCase() === 'dahua') return Brand.DAHUA;
  return Brand.HIKVISION;
}
