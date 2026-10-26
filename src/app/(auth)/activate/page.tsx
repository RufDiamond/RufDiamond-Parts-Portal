import { isApiMode } from "@/data/repository";
import { ActivationForm } from "./ActivationForm";
export const metadata={title:"Set up your account | RUF Diamond",referrer:"no-referrer"};
export const dynamic="force-dynamic";
export default function ActivationPage(){return <ActivationForm apiMode={isApiMode()}/>;}
