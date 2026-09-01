import type { ProductSeed } from "./products-frontend";
import { FRONTEND_PRODUCT_SEED } from "./products-frontend";
import { FOOD_PRODUCT_SEED } from "./products-food";

export const PRODUCT_SEED: ProductSeed[] = [...FRONTEND_PRODUCT_SEED, ...FOOD_PRODUCT_SEED];

export { buildNutrition } from "./products-frontend";
export type { ProductSeed } from "./products-frontend";
