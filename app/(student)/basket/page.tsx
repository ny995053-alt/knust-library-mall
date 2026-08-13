import type { Metadata } from "next";
import { BasketPage } from "@/components/student/basket-page";

export const metadata: Metadata = { title: "Borrow basket" };

export default function BorrowBasketPage() {
  return <BasketPage />;
}
