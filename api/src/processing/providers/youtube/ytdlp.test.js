import test from "node:test";
import assert from "node:assert/strict";

import {
    adaptYtDlpVideo,
    createYtDlpProvider,
} from "./ytdlp.js";

const fixture = {
    id: "abcdefghijk",
    title: "Example video",
    channel: "Example channel",
    description: "description",
    duration: 123,
    live_status: "not_live",
    http_headers: {
        "User-Agent": "Example UA",
    },
    thumbnails: [
        {
            url: "https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg",
            width: 1280,
            height: 720,
        },
    ],
    formats: [
        {
            format_id: "137",
            url: "https://rr.example/video",
            ext: "mp4",
            vcodec: "avc1.640028",
            acodec: "none",
            width: 1920,
            height: 1080,
            tbr: 4000,
            filesize_approx: 1000000,
        },
        {
            format_id: "140",
            url: "https://rr.example/audio",
            ext: "m4a",
            vcodec: "none",
            acodec: "mp4a.40.2",
            abr: 128,
            filesize: 100000,
        },
        {
            format_id: "18",
            url: "https://rr.example/progressive",
            ext: "mp4",
            vcodec: "avc1.42001E",
            acodec: "mp4a.40.2",
            width: 640,
            height: 360,
        },
    ],
    subtitles: {
        en: [
            {
                ext: "vtt",
                url: "https://www.youtube.com/api/timedtext?lang=en",
            },
        ],
    },
};

test("adapts yt-dlp output to the existing YouTube pipeline", () => {
    const info = adaptYtDlpVideo(fixture, fixture.id);

    assert.equal(info.playability_status.status, "OK");
    assert.equal(info.basic_info.id, fixture.id);
    assert.equal(info.basic_info.title, fixture.title);

    const formats = info.streaming_data.adaptive_formats;
    assert.equal(formats.length, 2);

    const video = formats.find(format => format.has_video);
    const audio = formats.find(format => format.has_audio);

    assert.equal(video.has_audio, false);
    assert.equal(video.width, 1920);
    assert.equal(video.height, 1080);
    assert.match(video.mime_type, /avc1\.640028/);

    assert.equal(audio.has_video, false);
    assert.match(audio.mime_type, /mp4a\.40\.2/);
    assert.equal(
        info.captions.caption_tracks[0].base_url,
        fixture.subtitles.en[0].url
    );
});

test("provider is disabled when the yt-dlp binary is not configured", async () => {
    let called = false;
    const provider = createYtDlpProvider({
        execFileImpl: async () => {
            called = true;
            return { stdout: JSON.stringify(fixture) };
        },
    });

    const result = await provider.resolve({
        videoId: fixture.id,
        log: {},
    });

    assert.equal(result, undefined);
    assert.equal(called, false);
});

test("provider invokes yt-dlp with mweb and bgutil", async () => {
    let command;
    let args;
    const provider = createYtDlpProvider({
        execFileImpl: async (binary, suppliedArgs) => {
            command = binary;
            args = suppliedArgs;
            return {
                stdout: JSON.stringify(fixture),
                stderr: "",
            };
        },
    });

    const result = await provider.resolve({
        videoId: fixture.id,
        binary: "/opt/venv/bin/yt-dlp",
        bgutilUrl: "http://127.0.0.1:4416",
        log: {},
    });

    assert.equal(command, "/opt/venv/bin/yt-dlp");
    assert.equal(result.provider, "ytdlp");
    assert.deepEqual(result.headers, fixture.http_headers);
    assert.ok(args.includes("youtube:player_client=mweb"));
    assert.ok(
        args.includes(
            "youtubepot-bgutilhttp:base_url=http://127.0.0.1:4416"
        )
    );
});

test("provider fails closed when yt-dlp returns invalid output", async () => {
    const provider = createYtDlpProvider({
        execFileImpl: async () => ({
            stdout: "not-json",
            stderr: "",
        }),
    });

    const result = await provider.resolve({
        videoId: fixture.id,
        binary: "/opt/venv/bin/yt-dlp",
        log: {},
    });

    assert.equal(result, undefined);
});
