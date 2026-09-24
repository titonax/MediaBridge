const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 8 * 1000;

const parseDimensions = (format) => {
    for (const value of [
        format?.size,
        format?.resolution,
        format?.qualityLabel,
    ]) {
        if (typeof value !== "string") continue;

        const exact = value.match(/(\d{2,5})x(\d{2,5})/i);
        if (exact) {
            return {
                width: Number(exact[1]),
                height: Number(exact[2]),
            };
        }

        const vertical = value.match(/(\d{3,4})p/i);
        if (vertical) {
            const height = Number(vertical[1]);
            return {
                width: Math.round(height * 16 / 9),
                height,
            };
        }
    }

    return {};
};

const absoluteUrl = (value, instance) => {
    if (!value) return value;

    try {
        return new URL(value, instance).toString();
    } catch {
        return value;
    }
};

const normalizeAdaptiveFormat = (format, instance) => {
    const mimeType = format.type
        || (
            format.audioQuality
                ? `audio/${format.container || "webm"}; codecs="${format.encoding || "opus"}"`
                : `video/${format.container || "mp4"}; codecs="${format.encoding || "avc1"}"`
        );

    const { width, height } = parseDimensions(format);
    const isVideo = mimeType.startsWith("video/");
    const isAudio = mimeType.startsWith("audio/");

    return {
        itag: Number.isNaN(Number(format.itag))
            ? format.itag
            : Number(format.itag),
        mime_type: mimeType,
        content_length: format.clen || format.contentLength,
        bitrate: Number(format.bitrate) || 0,
        width,
        height,
        has_video: isVideo,
        has_audio: isAudio,
        url: absoluteUrl(format.url, instance),
        audio_quality: format.audioQuality,
        audio_sample_rate: format.audioSampleRate,
        audio_channels: format.audioChannels,
        is_original: true,
    };
};

export const adaptInvidiousVideo = (video, instance) => {
    const adaptiveFormats = (video?.adaptiveFormats || [])
        .map(format => normalizeAdaptiveFormat(format, instance))
        .filter(format =>
            format.url
            && format.content_length
            && (format.has_video || format.has_audio)
        );

    return {
        playability_status: {
            status: "OK",
        },
        basic_info: {
            id: video.videoId,
            title: video.title || "",
            author: video.author || "YouTube",
            duration: Number(video.lengthSeconds) || 0,
            is_live: Boolean(video.liveNow),
            short_description: video.description || "",
            thumbnail: (video.videoThumbnails || []).map(thumbnail => ({
                ...thumbnail,
                url: absoluteUrl(thumbnail.url, instance),
            })),
        },
        streaming_data: {
            adaptive_formats: adaptiveFormats,
            hls_manifest_url: absoluteUrl(video.hlsUrl, instance),
        },
        captions: {
            caption_tracks: (video.captions || []).map(caption => ({
                kind: caption.kind,
                language_code: caption.language_code
                    || caption.languageCode
                    || caption.lang,
                base_url: absoluteUrl(caption.url, instance),
            })),
        },
    };
};

const normalizeInstance = (value) => {
    const url = new URL(value);

    if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error("unsupported protocol");
    }

    url.pathname = "/";
    url.search = "";
    url.hash = "";

    return url.toString();
};

export const createInvidiousProvider = ({
    now = () => Date.now(),
    cooldownMs = DEFAULT_COOLDOWN_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) => {
    const blockedUntil = new Map();

    return {
        name: "invidious",

        async resolve({
            videoId,
            instances,
            dispatcher,
            fetchImpl,
            log = console,
        }) {
            if (!fetchImpl || !videoId || !instances?.length) {
                return;
            }

            for (const rawInstance of instances) {
                let instance;

                try {
                    instance = normalizeInstance(rawInstance);
                } catch {
                    log.warn?.(
                        `[youtube] provider=invidious instance=${rawInstance} result=invalid_instance`
                    );
                    continue;
                }

                const host = new URL(instance).host;
                const unavailableUntil = blockedUntil.get(instance) || 0;

                if (unavailableUntil > now()) {
                    log.info?.(
                        `[youtube] provider=invidious instance=${host} result=cooldown`
                    );
                    continue;
                }

                try {
                    const endpoint = new URL(
                        `/api/v1/videos/${encodeURIComponent(videoId)}`,
                        instance
                    );

                    // Ask the instance to proxy media URLs. This avoids returning
                    // YouTube playback URLs that may be bound to the instance's
                    // own egress IP and unusable by MediaBridge.
                    endpoint.searchParams.set("local", "true");

                    const response = await fetchImpl(endpoint, {
                        dispatcher,
                        headers: {
                            accept: "application/json",
                        },
                        signal: AbortSignal.timeout(timeoutMs),
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }

                    const payload = await response.json();

                    if (
                        payload?.videoId !== videoId
                        || !Array.isArray(payload?.adaptiveFormats)
                    ) {
                        throw new Error("invalid video payload");
                    }

                    const info = adaptInvidiousVideo(payload, instance);

                    const hasVideo = info.streaming_data.adaptive_formats
                        .some(format => format.has_video);
                    const hasAudio = info.streaming_data.adaptive_formats
                        .some(format => format.has_audio);

                    if (!hasVideo || !hasAudio) {
                        throw new Error("missing adaptive media");
                    }

                    blockedUntil.delete(instance);

                    log.info?.(
                        `[youtube] provider=invidious instance=${host} result=ok formats=${info.streaming_data.adaptive_formats.length}`
                    );

                    return {
                        provider: "invidious",
                        instance,
                        info,
                    };
                } catch (error) {
                    blockedUntil.set(instance, now() + cooldownMs);

                    log.warn?.(
                        `[youtube] provider=invidious instance=${host} result=fail reason=${error?.message || error}`
                    );
                }
            }
        },
    };
};

export const invidiousProvider = createInvidiousProvider();
