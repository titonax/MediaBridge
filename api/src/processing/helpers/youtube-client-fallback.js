const DEFAULT_FALLBACK_CLIENTS = [
    "ANDROID",
    "YTSTUDIO_ANDROID",
    "YTMUSIC_ANDROID",
    "IOS",
];

export const isYouTubeBotChallenge = (info) => {
    const playability = info?.playability_status;

    return playability?.status === "LOGIN_REQUIRED"
        && typeof playability?.reason === "string"
        && playability.reason.endsWith("bot");
};

export const buildYouTubeClientCandidates = (preferredClient) => (
    [...new Set([preferredClient, ...DEFAULT_FALLBACK_CLIENTS].filter(Boolean))]
);

export const getBasicInfoWithClientFallback = async ({
    getBasicInfo,
    videoId,
    preferredClient,
    log = console,
}) => {
    const candidates = buildYouTubeClientCandidates(preferredClient);
    let firstBotInfo;
    let firstBotClient;

    for (const client of candidates) {
        let info;

        try {
            info = await getBasicInfo(videoId, { client });
        } catch (error) {
            if (client === preferredClient) {
                throw error;
            }

            log.warn?.(
                `[youtube] client fallback ${client} failed: ${error?.message || error}`
            );
            continue;
        }

        if (!isYouTubeBotChallenge(info)) {
            if (client !== preferredClient) {
                log.info?.(
                    `[youtube] client fallback succeeded with ${client}`
                );
            }

            return {
                info,
                client,
                tried: candidates.slice(0, candidates.indexOf(client) + 1),
            };
        }

        firstBotInfo ??= info;
        firstBotClient ??= client;

        log.warn?.(
            `[youtube] bot challenge with ${client}; trying next client`
        );
    }

    return {
        info: firstBotInfo,
        client: firstBotClient || preferredClient,
        tried: candidates,
    };
};
