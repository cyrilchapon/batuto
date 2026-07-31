import { boomContract } from "./boom.js";
import { helloContract } from "./hello.js";
import { privateHelloContract } from "./private-hello.js";
import { privatePingContract } from "./private-ping.js";

export const contract = {
  hello: helloContract,
  privatePing: privatePingContract,
  privateHello: privateHelloContract,
  boom: boomContract,
};

export * from "./boom.js";
export * from "./hello.js";
export * from "./private-hello.js";
export * from "./private-ping.js";
