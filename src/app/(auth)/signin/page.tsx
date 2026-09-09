import { SignInForm } from "./SignInForm";
import { isApiMode } from "@/data/repository";

/** The header prints the date the portal was opened, so it cannot prerender. */
export const dynamic = "force-dynamic";

export default function SignInPage() {
  const date = new Date().toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return <SignInForm date={date} apiMode={isApiMode()} />;
}
