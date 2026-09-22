import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";

import { app } from "../backend/server.ts";

test("GET / serves the web app HTML instead of the health JSON", async () => {
    const server = app.listen(0);

    await new Promise<void>((resolve) => {
        server.once("listening", () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === "string") {
        server.close();
        throw new Error("Server did not bind to a port");
    }

    const port = address.port;

    try {
        const response = await fetch(`http://127.0.0.1:${port}/`);
        const body = await response.text();

        assert.equal(response.status, 200);
        assert.match(response.headers.get("content-type") || "", /text\/html/i);
        assert.match(body, /<div id="root">/i);
    } finally {
        server.close();
    }
});
