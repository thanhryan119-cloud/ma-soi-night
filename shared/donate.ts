// Donation rules shared by the server and the donate page.

/** Quick picks on the donate page, in VND. */
export const DONATE_PRESETS_VND = [20_000, 50_000, 100_000, 200_000, 500_000] as const;
export const DONATE_MIN_VND = 10_000;
export const DONATE_MAX_VND = 10_000_000;

/** A whole number of VND between the minimum and the maximum. */
export const isDonationAmount = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= DONATE_MIN_VND && n <= DONATE_MAX_VND;

const clean = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max) : "";

/** Name for the thank-you list (empty: anonymous). */
export const cleanDonorName = (v: unknown) => clean(v, 32);
/** Private note to the team. */
export const cleanDonorMessage = (v: unknown) => clean(v, 200);

/** Bank names for the common VietQR BINs (payOS returns the BIN of the receiving account). */
export const BANK_BY_BIN: Record<string, string> = {
  "970422": "MB Bank",
  "970436": "Vietcombank",
  "970415": "VietinBank",
  "970418": "BIDV",
  "970405": "Agribank",
  "970407": "Techcombank",
  "970416": "ACB",
  "970432": "VPBank",
  "970423": "TPBank",
  "970403": "Sacombank",
  "970448": "OCB",
  "970437": "HDBank",
  "970441": "VIB",
  "970443": "SHB",
  "970426": "MSB",
  "970454": "Viet Capital Bank",
  "970429": "SCB",
  "970431": "Eximbank",
  "970449": "LPBank",
  "970412": "PVcomBank",
};
