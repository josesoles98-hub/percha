/**
 * Validación con Zod.
 *
 * El mismo esquema valida en el navegador y en el servidor: una sola
 * definición, imposible que se desincronicen.
 */

import { z } from 'zod';

export const itemStatusSchema = z.enum(['available', 'reserved', 'sold', 'hidden']);
export const itemGenderSchema = z.enum(['varon', 'dama', 'unisex']);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

/**
 * Alta rápida: solo foto, talla y precio son obligatorios.
 *
 * Todo lo demás es opcional a propósito. El objetivo de los 20 segundos se
 * consigue no pidiendo datos que el usuario puede completar después — o
 * nunca, porque el 80 % de las prendas se publican solo con eso.
 */
export const createItemSchema = z.object({
  priceCents: z
    .number({ required_error: 'Pon el precio' })
    .int('El precio debe ser un número entero de centavos')
    .min(0, 'El precio no puede ser negativo')
    .max(100_000_000, 'Ese precio parece un error'),

  sizeId: z.string().uuid('Elige una talla').nullable(),

  name: optionalText(120),
  description: optionalText(1000),
  brandId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  colorId: z.string().uuid().nullable().optional(),
  gender: itemGenderSchema.nullable().optional(),
  costCents: z.number().int().min(0).nullable().optional(),

  status: itemStatusSchema.default('available'),
});

export type CreateItemInput = z.input<typeof createItemSchema>;
export type CreateItemData = z.output<typeof createItemSchema>;

export const updateItemSchema = createItemSchema.partial();

/** Reservar: el nombre del cliente es opcional (un toque menos). */
export const reserveItemSchema = z.object({
  reservedForName: optionalText(80),
  reservedForPhone: optionalText(20),
});

export const storeSettingsSchema = z.object({
  name: z.string().trim().min(1, 'Pon el nombre de tu tienda').max(60),
  currency: z.string().length(3),
  currencySymbol: z.string().trim().min(1).max(5),
  reserveDays: z
    .number()
    .int()
    .min(1, 'Mínimo 1 día')
    .max(60, 'Máximo 60 días'),
  codePrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{1,4}$/, 'De 1 a 4 letras, sin números ni espacios'),
  shareTemplate: z.string().min(1, 'La plantilla no puede quedar vacía').max(2000),
  shareDepositCents: z.number().int().min(0),
  sellersSeeTotals: z.boolean(),
});

/** Documento de identidad peruano. Se usará en la Fase 6 (envíos Shalom). */
export const docNumberSchema = z
  .object({
    docType: z.enum(['DNI', 'RUC', 'CE']),
    docNumber: z.string().trim(),
  })
  .refine(
    ({ docType, docNumber }) => {
      if (docType === 'DNI') return /^\d{8}$/.test(docNumber);
      if (docType === 'RUC') return /^\d{11}$/.test(docNumber);
      return /^[a-zA-Z0-9]{9,12}$/.test(docNumber);
    },
    ({ docType }) => ({
      message:
        docType === 'DNI'
          ? 'El DNI tiene 8 dígitos'
          : docType === 'RUC'
            ? 'El RUC tiene 11 dígitos'
            : 'El carné de extranjería tiene entre 9 y 12 caracteres',
      path: ['docNumber'],
    }),
  );
