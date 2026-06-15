import test from "node:test";
import assert from "node:assert/strict";
import {
  getCategoryImportKey,
  parseCategoryCsv,
  parseDelimitedLine
} from "../category-import.js";

test("parseDelimitedLine preserves quoted commas", () => {
  assert.deepEqual(
    parseDelimitedLine("outcome,Food,\"Meals, takeout, cafes\"", ","),
    ["outcome", "Food", "Meals, takeout, cafes"]
  );
});

test("parseCategoryCsv accepts comma CSV rows", () => {
  const result = parseCategoryCsv(`Direction,Category Name,Description
outcome,Essentials - Food,"Meals, takeout, cafes, and eating out."
income,Work - Salary,Regular salary`);

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.categories, [
    {
      direction: "outcome",
      name: "Essentials - Food",
      description: "Meals, takeout, cafes, and eating out."
    },
    {
      direction: "income",
      name: "Work - Salary",
      description: "Regular salary"
    }
  ]);
});

test("parseCategoryCsv accepts pipe-separated rows", () => {
  const result = parseCategoryCsv(`Direction | Category Name | Description
both | Shared - Reimbursement | Money paid or received back`);

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.categories, [
    {
      direction: "both",
      name: "Shared - Reimbursement",
      description: "Money paid or received back"
    }
  ]);
});

test("parseCategoryCsv rejects invalid directions", () => {
  const result = parseCategoryCsv(`Direction,Category Name,Description
Outcome,Food,Wrong case`);

  assert.equal(result.categories.length, 0);
  assert.match(result.errors[0], /Direction must be exactly/);
});

test("parseCategoryCsv rejects missing required headers", () => {
  const result = parseCategoryCsv(`Type,Category,Description
outcome,Food,Meals`);

  assert.equal(result.categories.length, 0);
  assert.deepEqual(result.errors, ["Use this header exactly: Direction, Category Name, Description."]);
});

test("parseCategoryCsv rejects the reserved Saving category", () => {
  const result = parseCategoryCsv(`Direction,Category Name,Description
outcome,Saving,Reserved`);

  assert.equal(result.categories.length, 0);
  assert.match(result.errors[0], /Saving is managed automatically/);
});

test("parseCategoryCsv reports empty files", () => {
  assert.deepEqual(parseCategoryCsv(""), {
    categories: [],
    errors: ["The CSV file is empty."]
  });
});

test("getCategoryImportKey normalizes category names", () => {
  assert.equal(
    getCategoryImportKey({ name: "  Essentials   - Food ", direction: "outcome" }),
    "essentials - food::outcome"
  );
});
