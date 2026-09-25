import test from "node:test";
import assert from "node:assert/strict";

import {
    createYouTubeVisitorDataProvider,
    extractYouTubeVisitorData,
    YOUTUBE_WEB_USER_AGENT,
} from "./youtube-visitor-data.js";

test("extracts VISITOR_DATA from YouTube page bootstrap", () => {
    assert.equal(
        extractYouTubeVisitorData(
            '<script>{"VISITOR_DATA":"visitor-one"}</script>'
        ),
        "visitor-one"
    );

    assert.equal(
        extractYouTubeVisitorData(
            '<script>{"visitorData":"visitor-two"}</script>'
        ),
        "visitor-two"
    );
});

test("requests watch page with stable anonymous web headers", async () => {
    const requests = [];
    const provider = createYouTubeVisitorDataProvider();

    const value = await provider({
        videoId: "abcdefghijk",
        dispatcher: "dispatcher",
        fetchImpl: async (url, options) => {
            requests.push({ url: url.toString(), options });

            return {
                ok: true,
                text: async () => '{"VISITOR_DATA":"visitor-data"}',
            };
        },
    });

    assert.equal(value, "visitor-data");
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /watch\?v=abcdefghijk/);
    assert.match(requests[0].url, /bpctr=9999999999/);
    assert.match(requests[0].url, /has_verified=1/);
    assert.equal(
        requests[0].options.headers["User-Agent"],
        YOUTUBE_WEB_USER_AGENT
    );
    assert.equal(
        requests[0].options.headers.Cookie,
        "PREF=hl=en&tz=UTC; SOCS=CAI"
    );
});

test("caches visitor data until refresh window expires", async () => {
    let clock = 1000;
    let calls = 0;

    const provider = createYouTubeVisitorDataProvider({
        refreshMs: 5000,
        now: () => clock,
    });

    const fetchImpl = async () => {
        calls += 1;
        return {
            ok: true,
            text: async () => `{"VISITOR_DATA":"visitor-${calls}"}`,
        };
    };

    const first = await provider({
        videoId: "abcdefghijk",
        fetchImpl,
    });

    clock += 1000;

    const second = await provider({
        videoId: "abcdefghijk",
        fetchImpl,
    });

    assert.equal(first, "visitor-1");
    assert.equal(second, "visitor-1");
    assert.equal(calls, 1);

    clock += 5000;

    const third = await provider({
        videoId: "abcdefghijk",
        fetchImpl,
    });

    assert.equal(third, "visitor-2");
    assert.equal(calls, 2);
});

test("does not poison cache when watch page has no visitor data", async () => {
    let calls = 0;
    const provider = createYouTubeVisitorDataProvider();

    const fetchImpl = async () => {
        calls += 1;
        return {
            ok: true,
            text: async () => calls === 1
                ? "<html></html>"
                : '{"VISITOR_DATA":"visitor-later"}',
        };
    };

    assert.equal(
        await provider({
            videoId: "abcdefghijk",
            fetchImpl,
        }),
        undefined
    );

    assert.equal(
        await provider({
            videoId: "abcdefghijk",
            fetchImpl,
        }),
        "visitor-later"
    );

    assert.equal(calls, 2);
});
