/**
 * The daftari's entry types, on their own so pure modules (lib/digest.ts)
 * and the Node unit tests can use them without the farm store (lib/farm.ts),
 * which pulls in AsyncStorage. lib/farm.ts re-exports them.
 */
import type { CropKey } from "./agronomy";

export type ExpenseCat = "seed" | "fertilizer" | "chemicals" | "labour" | "transport" | "feed" | "vet" | "other";
export type IncomeCat = "sale" | "milk" | "eggs" | "animals" | "other";
export const EXPENSE_CATS: ExpenseCat[] = ["seed", "fertilizer", "chemicals", "labour", "transport", "feed", "vet", "other"];
export const INCOME_CATS: IncomeCat[] = ["sale", "milk", "eggs", "animals", "other"];
export type Entry = {
  id: string;
  kind: "income" | "expense";
  category: ExpenseCat | IncomeCat;
  amount: number;
  crop?: CropKey;
  /** Sales only: kilos sold, so the ledger knows the price actually received. */
  kg?: number;
  note?: string;
  date: string;
};
