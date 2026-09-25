import test from "node:test";
import assert from "node:assert/strict";

import {
    fetchYouTubeSession,
    validateYouTubeSession,
} from "./youtube-session.js";

const validSession = () => ({
    potoken: "p".repeat(180),
    visitor_data: "visitor-data",
    updated: 123,
});

test("accepts the current /token session-generator endpoint", async () => {
    const calls = [];

    const session = await fetchYouTubeSession({
        baseUrl: "https://session.example/base",
        dispatcher: undefined,
        fetchImpl: async (url, options) => {
            calls.push({
                url: url.toString(),
                method: options.method,
            });

            return {
                ok: true,
                status: 200,
                json: async () => validSession(),
            };
        },
    });

    assert.equal(session.visitor_data, "visitor-data");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://session.example/token");
    assert.equal(calls[0].method, "GET");
});

test("falls back to the legacy /get_pot endpoint", async () => {
    const calls = [];

    const session = await fetchYouTubeSession({
        baseUrl: "https://session.example/",
        dispatcher: undefined,
        fetchImpl: async (url, options) => {
            calls.push({
                url: url.toString(),
                method: options.method,
            });

            if (url.pathname === "/token") {
                return {
                    ok: false,
                    status: 404,
                };
            }

            return {
                ok: true,
                status: 200,
                json: async () => ({
                    poToken: "p".repeat(180),
                    contentBinding: "legacy-visitor",
                }),
            };
        },
    });

    assert.equal(session.visitor_data, "legacy-visitor");
    assert.equal(session.potoken.length, 180);
    assert.deepEqual(calls, [
        {
            url: "https://session.example/token",
            method: "GET",
        },
        {
            url: "https://session.example/get_pot",
            method: "POST",
        },
    ]);
});

test("normalizes legacy session field names", () => {
    const session = validateYouTubeSession({
        poToken: "p".repeat(180),
        contentBinding: "visitor",
    });

    assert.equal(session.potoken.length, 180);
    assert.equal(session.visitor_data, "visitor");
    assert.equal(typeof session.updated, "number");
});
