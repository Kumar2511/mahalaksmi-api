import dns from "node:dns/promises";

try {
  const result = await dns.resolveSrv("_mongodb._tcp.cluster0.m0tisbl.mongodb.net");
  console.log(result);
} catch (err) {
  console.error(err);
}