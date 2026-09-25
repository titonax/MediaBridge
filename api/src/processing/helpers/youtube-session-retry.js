import { isYouTubeBotChallenge } from "./youtube-client-fallback.js";

export const retryYouTubeWithSession = async ({
    info,
    videoId,
    sessionTokens,
    client = "MWEB",
    createClient,
    log = console,
}) => {
    if (
        !isYouTubeBotChallenge(info)
        || !sessionTokens?.potoken
        || !sessionTokens?.visitor_data
        || !createClient
    ) {
        return {
            info,
            usedSession: false,
        };
    }

    try {
        const yt = await createClient();
        const retriedInfo = await yt.getBasicInfo(videoId, { client });

        if (!retriedInfo || isYouTubeBotChallenge(retriedInfo)) {
            log.warn?.(
                `[youtube] pot session retry client=${client} result=bot_challenge`
            );

            return {
                info,
                usedSession: false,
            };
        }

        log.info?.(
            `[youtube] pot session retry client=${client} result=ok`
        );

        return {
            info: retriedInfo,
            yt,
            client,
            usedSession: true,
        };
    } catch (error) {
        log.warn?.(
            `[youtube] pot session retry client=${client} result=fail reason=${error?.message || error}`
        );

        return {
            info,
            usedSession: false,
        };
    }
};
