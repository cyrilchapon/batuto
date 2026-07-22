import { helloContract } from "./hello.js";
import { privatePingContract } from "./private-ping.js";

export const contract = {
  hello: helloContract,
  privatePing: privatePingContract,
};

export * from "./hello.js";
export * from "./private-ping.js";
