import { describe, expect, it } from "vitest";
import { labelsForBoxes } from "../lib/boxLabelPrint";

describe("bulk box-label printing", () => {
  const boxes = [
    { id: "a", code: "GRP-A", name: "Bangle A", packQty: 6, price: 100000, wholesale: 50000 },
    { id: "b", code: "GRP-B", name: "Bangle B", packQty: 12, price: 200000, wholesale: 0 },
  ];

  it("combines every box with its configured print count into one print job", () => {
    const labels = labelsForBoxes(boxes, { a: "2", b: "3" }, () => 1);
    expect(labels).toHaveLength(5);
    expect(labels.filter((label) => label.sku === "GRP-A")).toHaveLength(2);
    expect(labels.filter((label) => label.sku === "GRP-B")).toHaveLength(3);
  });

  it("uses the stock-derived count when a box has no custom count", () => {
    const labels = labelsForBoxes(boxes, { a: "2" }, (box) => box.id === "b" ? 4 : 1);
    expect(labels).toHaveLength(6);
    expect(labels[0]).toMatchObject({ qrValue: "GRP-A", boxLine: "BOX OF 6", priceLine: "A75007100051" });
    expect(labels.at(-1)).toMatchObject({ qrValue: "GRP-B", boxLine: "BOX OF 12", priceLine: "A200051" });
  });
});
