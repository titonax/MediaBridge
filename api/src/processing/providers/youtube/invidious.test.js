import test from "node:test";
import assert from "node:assert/strict";

import {
    adaptInvidiousVideo,
    createInvidiousProvider,
} from "./invidious.js";

const fixture = {
    videoId: "abcdefghijk",
    title: "Example video",
    author: "Example channel",
    description: "description",
    lengthSeconds: 123,
    liveNow: false,
    videoThumbnails: [
        {
            url: "/vi/abcdefghijk/maxres.jpg",
            width: 1280,
            height: 720,
        },
    ],
    adaptiveFormats: [
        {
            itag: "137",
            type: 'video/mp4; codecs="avc1.640028"',
            clen: "1000000",
            bitrate: "4000000",
            size: "1920x1080",
            qualityLabel: "1080p",
            url: "/videoplayback?video=1",
        },
        {
            itag: "140",
            type: 'audio/mp4; codecs="mp4a.40.2"',
            clen: "100000",
            bitrate: "128000",
            audioQuality: "AUDIO_QUALITY_MEDIUM",
            url: "/videoplayback?audio=1",
        },
    ],
    captions: [
        {
            languageCode: "en",
            url: "/api/v1/captions/abcdefghijk?lang=en",
        },
    ],
};

test("adapts Invidious video data to the existing YouTube pipeline", () => {
    const info = adaptInvidiousVideo(
        fixture,
        "https://inv.example/"
    );

    assert.equal(info.playability_status.status, "OK");
    assert.equal(info.basic_info.id, fixture.videoId);
    assert.equal(info.basic_info.title, fixture.title);
    assert.equal(info.streaming_data.adaptive_formats.length, 2);

    const video = info.streaming_data.adaptive_formats[0];
    const audio = info.streaming_data.adaptive_formats[1];

    assert.equal(video.has_video, true);
    assert.equal(video.has_audio, false);
    assert.equal(video.width, 1920);
    assert.equal(video.height, 1080);
    assert.equal(video.url, "https://inv.example/videoplayback?video=1");

    assert.equal(audio.has_audio, true);
    assert.equal(audio.has_video, false);
    assert.equal(
        info.captions.caption_tracks[0].base_url,
        "https://inv.example/api/v1/captions/abcdefghijk?lang=en"
    );
});

test("provider moves to the next instance after a failure", async () => {
    let clock = 1000;
    const calls = [];
    const provider = createInvidiousProvider({
        now: () => clock,
        cooldownMs: 5000,
    });

    const result = await provider.resolve({
        videoId: fixture.videoId,
        instances: [
            "https://one.example/",
            "https://two.example/",
        ],
        log: {},
        fetchImpl: async (url) => {
            calls.push(url.toString());

            if (url.host === "one.example") {
                return {
                    ok: false,
                    status: 503,
                };
            }

            return {
                ok: true,
                status: 200,
                json: async () => fixture,
            };
        },
    });

    assert.equal(result.instance, "https://two.example/");
    assert.equal(result.provider, "invidious");
    assert.equal(calls.length, 2);
    assert.match(calls[0], /local=true/);
});

test("failed instances enter cooldown", async () => {
    let clock = 1000;
    const calls = [];
    const provider = createInvidiousProvider({
        now: () => clock,
        cooldownMs: 5000,
    });

    const resolve = () => provider.resolve({
        videoId: fixture.videoId,
        instances: [
            "https://one.example/",
            "https://two.example/",
        ],
        log: {},
        fetchImpl: async (url) => {
            calls.push(url.host);

            if (url.host === "one.example") {
                return {
                    ok: false,
                    status: 500,
                };
            }

            return {
                ok: true,
                status: 200,
                json: async () => fixture,
            };
        },
    });

    await resolve();
    await resolve();

    assert.deepEqual(calls, [
        "one.example",
        "two.example",
        "two.example",
    ]);

    clock += 6000;
    await resolve();

    assert.equal(calls.at(-2), "one.example");
    assert.equal(calls.at(-1), "two.example");
});
