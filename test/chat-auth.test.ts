import test from "node:test";
import assert from "node:assert/strict";
import { app } from "../backend/server.ts";

function startTestServer() {
    return new Promise<{ server: any; port: number }>((resolve) => {
        const server = app.listen(0, "127.0.0.1", () => {
            const address = server.address();
            if (typeof address === "object" && address) {
                resolve({ server, port: address.port });
            }
        });
    });
}

test("chat endpoint accepts requests without an auth token", async () => {
    const { server, port } = await startTestServer();

    try {
        const response = await fetch(`http://127.0.0.1:${port}/api/conversations/1/chat`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ content: "Hello from the regression test" }),
        });

        assert.notEqual(response.status, 401, "chat endpoint should not reject requests without an auth token");
        assert.match(response.headers.get("content-type") || "", /text\/event-stream|application\/json/);
    } finally {
        server.close();
    }
});
