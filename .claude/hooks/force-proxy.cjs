// Claude Code web sessions only (see session-start.sh) - never loaded in
// real dev/CI/deploys.
//
// Some native-dependency installers (e.g. @appsignal/nodejs's install-time
// CDN download of its native extension) call Node's http/https modules
// directly and never read HTTPS_PROXY. This sandbox only allows egress
// through the proxy at HTTPS_PROXY, so those requests fail outright
// ("Could not connect to CDN") instead of erroring cleanly - which then
// breaks anything that depends on the missing native extension at runtime
// (e.g. @batuto/logs' AppSignal Pino transport crashing on every request).
//
// This patches the *default* global agents, which is what any http.request()/
// https.request() call uses unless it passes its own `agent` option - true
// for @appsignal/nodejs's Transmitter (verified: no `agent` in its request
// options). Only activates when HTTPS_PROXY is actually set, so this is a
// no-op anywhere outside this sandbox.
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy;

if (proxyUrl) {
  const http = require("node:http");
  const https = require("node:https");
  const { HttpsProxyAgent } = require("https-proxy-agent");

  const agent = new HttpsProxyAgent(proxyUrl);
  http.globalAgent = agent;
  https.globalAgent = agent;
}
