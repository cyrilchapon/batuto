import Appsignal from "@appsignal/javascript";
import { plugin as breadcrumbsConsolePlugin } from "@appsignal/plugin-breadcrumbs-console";
import { plugin as breadcrumbsNetworkPlugin } from "@appsignal/plugin-breadcrumbs-network";
import { plugin as pathDecoratorPlugin } from "@appsignal/plugin-path-decorator";
import { plugin as windowEventsPlugin } from "@appsignal/plugin-window-events";
import { appEnv } from "./env.js";

export const appsignal = new Appsignal({
  key: appEnv.VITE_APPSIGNAL_PUSH_API_KEY,
});

// Uncaught exceptions and unhandled promise rejections aren't captured by
// default - this is what actually catches them.
appsignal.use(windowEventsPlugin());
appsignal.use(pathDecoratorPlugin());
appsignal.use(breadcrumbsConsolePlugin());
appsignal.use(breadcrumbsNetworkPlugin());
