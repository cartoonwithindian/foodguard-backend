import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET as getCatalog } from "@/app/api/products/route";
import { scoreCatalogMatch, tokenizeCatalogQuery } from "@/lib/search/catalog-match";

describe("tokenizeCatalogQuery", () => {
  it("splits a multi-word phrase into separate terms", () => {
    expect(tokenizeCatalogQuery("low sugar products")).toEqual(["low", "sugar"]);
  });

  it("drops generic catalog nouns and filler", () => {
    expect(tokenizeCatalogQuery("best snacks for me")).toEqual(["snacks"].filter((t) => t !== "snacks"));
    expect(tokenizeCatalogQuery("show me products")).toEqual([]);
  });

  it("keeps digits and drops punctuation", () => {
    expect(tokenizeCatalogQuery("8904288611")).toEqual(["8904288611"]);
    expect(tokenizeCatalogQuery("Amul, Taaza!")).toEqual(["amul", "taaza"]);
  });
});

describe("scoreCatalogMatch", () => {
  it("matches a term anywhere in the name", () => {
    const tokens = tokenizeCatalogQuery("low sugar products");
    expect(scoreCatalogMatch(tokens, { name: "Paper Boat Delicious Low Sugar Anar" }).matched).toBe(2);
  });

  it("still matches on brand", () => {
    const tokens = tokenizeCatalogQuery("amul");
    expect(scoreCatalogMatch(tokens, { name: "Taaza", brand: "Amul" }).matched).toBe(1);
  });

  it("still matches a barcode typed as digits", () => {
    const tokens = tokenizeCatalogQuery("8901234567890");
    expect(scoreCatalogMatch(tokens, { name: "Taaza", barcode: "8901234567890" }).matched).toBe(1);
  });

  it("does not match a term hidden inside an ingredient word", () => {
    // "yellow" contains "low"; substring ingredient matching caused this.
    const tokens = tokenizeCatalogQuery("low");
    expect(
      scoreCatalogMatch(tokens, { name: "Colgate", ingredients: "yellow colour, sorbitol" }).matched,
    ).toBe(0);
    expect(
      scoreCatalogMatch(tokens, { name: "Colgate", ingredients: "sugar, low fat milk" }).matched,
    ).toBe(1);
  });

  it("requires a word boundary so a term does not match inside another word", () => {
    // "low" must not fire on "flowered"; plain substring matching did.
    const tokens = tokenizeCatalogQuery("low");
    expect(scoreCatalogMatch(tokens, { name: "Flowered Greens" }).matched).toBe(0);
    expect(scoreCatalogMatch(tokens, { name: "Low Fat Milk" }).matched).toBe(1);
  });

  it("ranks products matching every term above single-term hits", () => {
    const tokens = tokenizeCatalogQuery("low sugar products");
    const both = scoreCatalogMatch(tokens, { name: "Delicious Low Sugar Anar" });
    const one = scoreCatalogMatch(tokens, { name: "Sugar Free Candy" });
    expect(both.matched).toBeGreaterThan(one.matched);
    expect(both.score).toBeGreaterThan(one.score);
  });

  it("returns no match for an unrelated term", () => {
    expect(scoreCatalogMatch(tokenizeCatalogQuery("sugar"), { name: "Colgate Toothpaste" }).matched).toBe(0);
  });
});

describe("GET /api/products multi-word search", () => {
  it("finds results for a phrase instead of returning zero", async () => {
    // Regression: the whole query was matched as one literal substring, so
    // "low sugar products" returned 0 while "sugar" returned 129.
    const response = await getCatalog(
      new NextRequest("http://localhost/api/products?search=low%20sugar%20products&limit=10"),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.total).toBeGreaterThan(0);
    expect(body.data.products.length).toBeGreaterThan(0);
  });

  it("ranks the closest product first", async () => {
    const response = await getCatalog(
      new NextRequest("http://localhost/api/products?search=low%20sugar%20products&limit=5"),
    );
    const body = await response.json();
    const top = body.data.products[0]?.name?.toLowerCase() ?? "";
    // Every top hit should carry at least one real query term.
    expect(/low|sugar/.test(top)).toBe(true);
  });

  it("does not return substring false positives for short terms", async () => {
    const response = await getCatalog(new NextRequest("http://localhost/api/products?search=low&limit=40"));
    const body = await response.json();
    for (const product of body.data.products) {
      const name = product.name.toLowerCase();
      expect(name).toMatch(/\blow/);
    }
  });

  it("combines the phrase search with the photos-only filter", async () => {
    const response = await getCatalog(
      new NextRequest(
        "http://localhost/api/products?search=low%20sugar%20products&hasImage=true&limit=10",
      ),
    );
    const body = await response.json();
    expect(body.data.products.length).toBeGreaterThan(0);
    for (const product of body.data.products) {
      expect(product.imageUrl).toBeTruthy();
    }
  });

  it("keeps a single-term query working", async () => {
    const response = await getCatalog(new NextRequest("http://localhost/api/products?search=sugar&limit=5"));
    const body = await response.json();
    expect(body.data.total).toBeGreaterThan(0);
  });

  it("still returns an empty page for a genuinely unknown term", async () => {
    const response = await getCatalog(
      new NextRequest("http://localhost/api/products?search=zzzqqxnotaprod&limit=5"),
    );
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.products).toHaveLength(0);
  });
});