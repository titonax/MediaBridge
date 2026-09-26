import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 45 * 1000;
const DEFAULT_MAX_BUFFER = 24 * 1024 * 1024;

const hasCodec = (value) => value && value !== "none";

const normalizeMimeType = (format) => {
    const hasVideo = hasCodec(format.vcodec);
    const hasAudio = hasCodec(format.acodec);
    const mediaType = hasVideo ? "video" : "audio";

    let container = String(format.ext || "").toLowerCase();
    if (container === "m4a") container = "mp4";
    if (!["mp4", "webm", "ogg"].includes(container)) {
        container = hasVideo ? "mp4" : "webm";
    }

    const codecs = [
        hasVideo ? format.vcodec : undefined,
        hasAudio ? format.acodec : undefined,
    ].filter(Boolean);

    return codecs.length
        ? `${mediaType}/${container}; codecs="${codecs.join(", ")}"`
        : `${mediaType}/${container}`;
};

const normalizeFormat = (format) => {
    const hasVideo = hasCodec(format.vcodec);
    const hasAudio = hasCodec(format.acodec);

    if (
        !format?.url
        || !format.url.startsWith("http")
        || hasVideo === hasAudio
    ) {
        return;
    }

    const estimatedSize = Number(
        format.filesize
        || format.filesize_approx
        || 1
    );

    return {
        itag: format.format_id,
        mime_type: normalizeMimeType(format),
        content_length: String(
            Number.isFinite(estimatedSize) && estimatedSize > 0
                ? Math.round(estimatedSize)
                : 1
        ),
        bitrate: Math.round(
            Number(
                format.tbr
                || format.vbr
                || format.abr
                || 0
            ) * 1000
        ),
        width: Number(format.width) || undefined,
        height: Number(format.height) || undefined,
        has_video: hasVideo,
        has_audio: hasAudio,
        url: format.url,
        language: format.language,
        audio_track: format.language,
        audio_channels: format.audio_channels,
        is_original: true,
        http_headers: format.http_headers,
    };
};

const normalizeCaptions = (payload) => {
    const sources = [
        payload?.subtitles,
        payload?.automatic_captions,
    ];

    const seen = new Set();
    const tracks = [];

    for (const source of sources) {
        if (!source || typeof source !== "object") continue;

        for (const [languageCode, formats] of Object.entries(source)) {
            if (seen.has(languageCode) || !Array.isArray(formats)) continue;

            const selected = formats.find(item => item?.ext === "vtt" && item?.url)
                || formats.find(item => item?.url);

            if (!selected?.url) continue;

            seen.add(languageCode);
            tracks.push({
                kind: source === payload.automatic_captions ? "asr" : undefined,
                language_code: languageCode,
                base_url: selected.url,
            });
        }
    }

    return tracks;
};

export const adaptYtDlpVideo = (payload, videoId) => {
    const adaptiveFormats = (payload?.formats || [])
        .map(normalizeFormat)
        .filter(Boolean);

    return {
        playability_status: {
            status: "OK",
        },
        basic_info: {
            id: payload?.id || videoId,
            title: payload?.title || "",
            author: payload?.channel
                || payload?.uploader
                || payload?.creator
                || "YouTube",
            duration: Number(payload?.duration) || 0,
            is_live: payload?.live_status === "is_live",
            short_description: payload?.description || "",
            thumbnail: (payload?.thumbnails || [])
                .filter(item => item?.url)
                .map(item => ({
                    url: item.url,
                    width: item.width,
                    height: item.height,
                })),
        },
        streaming_data: {
            adaptive_formats: adaptiveFormats,
        },
        captions: {
            caption_tracks: normalizeCaptions(payload),
        },
    };
};

const buildArgs = ({ videoId, bgutilUrl, socketTimeout }) => {
    const args = [
        "--no-playlist",
        "--skip-download",
        "--dump-single-json",
        "--no-warnings",
        "--socket-timeout",
        String(socketTimeout),
        "--js-runtimes",
        "node",
        "--impersonate",
        "chrome",
        "--extractor-args",
        "youtube:player_client=mweb",
    ];

    if (bgutilUrl) {
        args.push(
            "--extractor-args",
            `youtubepot-bgutilhttp:base_url=${bgutilUrl}`
        );
    }

    args.push(
        `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
    );

    return args;
};

export const createYtDlpProvider = ({
    execFileImpl = execFileAsync,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBuffer = DEFAULT_MAX_BUFFER,
    socketTimeout = 20,
} = {}) => ({
    name: "ytdlp",

    async resolve({
        videoId,
        binary,
        bgutilUrl,
        log = console,
    }) {
        if (!videoId || !binary) {
            return;
        }

        try {
            const { stdout } = await execFileImpl(
                binary,
                buildArgs({
                    videoId,
                    bgutilUrl,
                    socketTimeout,
                }),
                {
                    timeout: timeoutMs,
                    maxBuffer,
                    env: process.env,
                }
            );

            const payload = JSON.parse(stdout);

            if (payload?.id && payload.id !== videoId) {
                throw new Error("video id mismatch");
            }

            const info = adaptYtDlpVideo(payload, videoId);
            const formats = info.streaming_data.adaptive_formats;

            const hasVideo = formats.some(format => format.has_video);
            const hasAudio = formats.some(format => format.has_audio);

            if (!hasVideo || !hasAudio) {
                throw new Error("missing adaptive media");
            }

            const headers = payload?.http_headers
                || formats.find(format => format.http_headers)?.http_headers;

            log.info?.(
                `[youtube] provider=ytdlp result=ok formats=${formats.length}`
            );

            return {
                provider: "ytdlp",
                info,
                headers,
            };
        } catch (error) {
            log.warn?.(
                `[youtube] provider=ytdlp result=fail reason=${error?.message || error}`
            );
        }
    },
});

export const ytdlpProvider = createYtDlpProvider();
