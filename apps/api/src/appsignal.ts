import "source-map-support/register.js";
import { Appsignal } from "@appsignal/nodejs";

new Appsignal({
  active: true,
  name: "batuto",
});
