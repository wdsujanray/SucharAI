process.env.MOBILE_SERVER = "true";

void import("./server.js").then(({ startServer }) => {
  startServer();
});
