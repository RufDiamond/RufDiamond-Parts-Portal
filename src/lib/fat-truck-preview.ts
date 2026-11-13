export const fatTruckPreviewNotice = "FT3 Wagon catalogue preview. Use these parts to request a quote. Confirm part references and pricing before fulfillment.";
export const fatTruckPreviewVariant = "var-ft3-wagon-99ft3w";
export const isFatTruckPreviewPartId = (id: unknown): id is string => typeof id === "string" && /^prt-[a-z0-9-]{1,120}$/i.test(id);
