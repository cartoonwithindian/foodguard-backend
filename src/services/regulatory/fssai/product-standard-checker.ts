/**
 * FSSAI Product Standard Checker
 * 
 * Checks product standards as per FSSAI regulations.
 */

import type { ProductStandardCheckResult } from "./types";

export class ProductStandardChecker {
  /**
   * Check product standard for a food product
   */
  async checkProductStandard(
    productName?: string,
    category?: string
  ): Promise<ProductStandardCheckResult[]> {
    const results: ProductStandardCheckResult[] = [];

    if (!productName && !category) {
      return results;
    }

    // Check for dairy products
    if (category?.toLowerCase().includes("dairy") || productName?.toLowerCase().includes("milk")) {
      results.push({
        productName: "Dairy Products",
        sectionNumber: "2.1",
        standardDefinition: "Dairy products must comply with FSSAI (Food Product Standards and Food Additives) Regulation, 2011",
        compositionRequirements: [],
        qualityParameters: [],
        identityRequirements: ["Must be prepared from milk", "Must meet minimum fat and SNF content"],
        permittedIngredients: [],
        permittedAdditives: [],
        maximumLimits: [],
        sourceReferences: [],
      });
    }

    // Check for fruit and vegetable products
    if (category?.toLowerCase().includes("fruit") || category?.toLowerCase().includes("vegetable")) {
      results.push({
        productName: "Fruit and Vegetable Products",
        sectionNumber: "2.3",
        standardDefinition: "Fruit and vegetable products must comply with FSSAI (Food Product Standards and Food Additives) Regulation, 2011",
        compositionRequirements: [],
        qualityParameters: [],
        identityRequirements: ["Must be prepared from fruits/vegetables"],
        permittedIngredients: [],
        permittedAdditives: [],
        maximumLimits: [],
        sourceReferences: [],
      });
    }

    // Check for cereal products
    if (category?.toLowerCase().includes("cereal") || category?.toLowerCase().includes("grain")) {
      results.push({
        productName: "Cereal Products",
        sectionNumber: "2.4",
        standardDefinition: "Cereal products must comply with FSSAI (Food Product Standards and Food Additives) Regulation, 2011",
        compositionRequirements: [],
        qualityParameters: [],
        identityRequirements: ["Must be prepared from cereals"],
        permittedIngredients: [],
        permittedAdditives: [],
        maximumLimits: [],
        sourceReferences: [],
      });
    }

    return results;
  }
}