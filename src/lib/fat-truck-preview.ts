export const fatTruckPreviewNotice = "FT3 Wagon catalogue. Priced parts can be ordered online. Request a quote for items without a price. Confirm the machine VIN and part references before fulfillment.";
export const fatTruckPreviewVariant = "var-ft3-wagon-99ft3w";
export const isFatTruckPreviewPartId = (id: unknown): id is string => typeof id === "string" && /^prt-[a-z0-9-]{1,120}$/i.test(id);
