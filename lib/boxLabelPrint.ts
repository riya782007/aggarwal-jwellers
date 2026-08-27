export type BoxLabelSource = {
  id: string;
  code: string;
  name: string;
  packQty: number;
  price?: number;
  wholesale?: number;
};

export type BoxPrintLabel = {
  name: string;
  sku: string;
  qrValue: string;
  priceLine?: string;
  boxLine: string;
  showName: boolean;
  showSku: boolean;
};

const intOf = (paise?: number) => {
  if (paise == null || !Number.isFinite(paise) || paise <= 0) return "";
  return String(Math.round(paise / 100));
};

export function labelsForBox(box: BoxLabelSource, count: number): BoxPrintLabel[] {
  const n = Math.max(1, Math.floor(Number(count) || 1));
  const wholesale = intOf(box.wholesale);
  const retail = intOf(box.price);
  const priceLine = wholesale || retail ? `A${wholesale ? `7${wholesale}7` : ""}${retail}51` : undefined;
  return Array.from({ length: n }, () => ({
    name: box.name,
    sku: box.code,
    qrValue: box.code,
    priceLine,
    boxLine: `BOX OF ${box.packQty}`,
    showName: true,
    showSku: true,
  }));
}

export function labelsForBoxes<T extends BoxLabelSource>(boxes: T[], counts: Record<string, string>, defaultCount: (box: T) => number): BoxPrintLabel[] {
  return boxes.flatMap((box) => labelsForBox(box, Number(counts[box.id] ?? defaultCount(box))));
}
