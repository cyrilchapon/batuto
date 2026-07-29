import "source-map-support/register.js";
import { Appsignal } from "@appsignal/nodejs";

export const appsignal = new Appsignal({
  active: true,
  name: "batuto",
});
