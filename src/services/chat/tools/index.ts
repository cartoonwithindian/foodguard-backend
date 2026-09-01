import type { ToolResult } from "@/types/chat-tools";
import { searchProductTool } from "./search-product";
import { getProductDetailsTool } from "./product-details";
import { getProductAnalysisTool } from "./product-analysis";
import { getIngredientInfoTool } from "./ingredient-info";
import { getUserScanHistoryTool } from "./scan-history";
import { compareProductsTool } from "./compare-products";
import { searchRegulationsTool } from "./search-regulations";

export type ToolName =
  | "search_product"
  | "get_product_details"
  | "get_product_analysis"
  | "get_ingredient_info"
  | "get_user_scan_history"
  | "compare_products"
  | "search_regulations"
  | "get_ingredient_classification"
  | "generate_report";

export type ToolCtx = { userId: string };

const AVAILABLE_TOOLS: ToolName[] = [
  "search_product",
  "get_product_details",
  "get_product_analysis",
  "get_ingredient_info",
  "get_user_scan_history",
  "compare_products",
  "search_regulations",
];

/**
 * Controlled tool layer. The LLM never touches the store directly — every
 * data access happens here, validated and user-scoped.
 */
export async function runTool(
  name: ToolName,
  args: Record<string, unknown>,
  ctx: ToolCtx,
): Promise<ToolResult<unknown>> {
  switch (name) {
    case "search_product":
      return searchProductTool(args as Parameters<typeof searchProductTool>[0]);
    case "get_product_details":
      return getProductDetailsTool(args as Parameters<typeof getProductDetailsTool>[0]);
    case "get_product_analysis":
      return getProductAnalysisTool(args as Parameters<typeof getProductAnalysisTool>[0]);
    case "get_ingredient_info":
      return getIngredientInfoTool(args as Parameters<typeof getIngredientInfoTool>[0]);
    case "get_user_scan_history":
      return getUserScanHistoryTool(args as Parameters<typeof getUserScanHistoryTool>[0], ctx);
    case "compare_products":
      return compareProductsTool(args as Parameters<typeof compareProductsTool>[0]);
    case "search_regulations":
      return searchRegulationsTool(args as Parameters<typeof searchRegulationsTool>[0]);
    case "get_ingredient_classification":
      return { ok: false, error: "not_implemented" };
    case "generate_report":
      return { ok: false, error: "not_implemented" };
    default:
      return { ok: false, error: "unknown_tool" };
  }
}

export { AVAILABLE_TOOLS };