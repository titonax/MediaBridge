import test from "node:test";
import assert from "node:assert/strict";

import {
    getRangeResponseSize,
    mergeRequestHeaders,
} from "./request-headers.js";

test("custom yt-dlp headers override generic YouTube headers case-insensitively", () => {
    const headers = mergeRequestHeaders(
        {
            "user-agent": "generic",
            referer: "https://www.youtube.com",
        },
        new Map([
            ["User-Agent", "yt-dlp"],
            ["Referer", "https://www.youtube.com/"],
            ["X-Youtube-Client", "mweb"],
            ["Host", "stale.example"],
        ]),
        {
            Range: "bytes=0-0",
        }
    );

    assert.equal(headers["user-agent"], "yt-dlp");
    assert.equal(headers.referer, "https://www.youtube.com/");
    assert.equal(headers["x-youtube-client"], "mweb");
    assert.equal(headers.range, "bytes=0-0");
    assert.equal("host" in headers, false);
});

test("reads total size from a partial content response", () => {
    assert.equal(
        getRangeResponseSize(206, {
            "Content-Range": "bytes 0-0/123456",
            "Content-Length": "1",
        }),
        123456
    );
});

test("falls back to content-length when a range request is ignored", () => {
    assert.equal(
        getRangeResponseSize(200, {
            "Content-Length": "654321",
        }),
        654321
    );
});

test("does not mistake one-byte partial content for total size", () => {
    assert.equal(
        getRangeResponseSize(206, {
            "Content-Length": "1",
        }),
        undefined
    );
});
