import pino, { type Logger } from "pino";

/**
 * Requires an `Appsignal` instance to already be active on the main thread
 * before this is called — the AppSignal pino transport runs in its own
 * worker thread and expects the extension to already be loaded/started
 * (see @appsignal/nodejs's pino_transport.js), it doesn't initialize it.
 */
export const createLogger = (group: string): Logger =>
  pino({
    level: "info",
    transport: {
      targets: [
        { target: "@appsignal/nodejs/pino", options: { group }, level: "info" },
        { target: "pino/file", options: { destination: 1 }, level: "info" },
      ],
    },
  });
