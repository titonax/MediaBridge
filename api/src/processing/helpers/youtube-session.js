import * as cluster from "../../misc/cluster.js";

import { Agent, fetch } from "undici";
import { env } from "../../config.js";
import { Green, Yellow } from "../../misc/console-text.js";

const defaultAgent = new Agent();

const SESSION_ENDPOINTS = [
    { pathname: "/token", method: "GET" },
    { pathname: "/get_pot", method: "POST" },
];

let session;

export const validateYouTubeSession = (sessionResponse) => {
    sessionResponse.visitor_data ??= sessionResponse.contentBinding;
    sessionResponse.potoken ??= sessionResponse.poToken;
    sessionResponse.updated ??= new Date().getTime();

    if (!sessionResponse.potoken) {
        throw new Error("no poToken in session response");
    }

    if (!sessionResponse.visitor_data) {
        throw new Error("no visitor_data in session response");
    }

    if (!sessionResponse.updated) {
        throw new Error("no last update timestamp in session response");
    }

    if (sessionResponse.potoken.length < 160) {
        console.error(
            `${Yellow('[!]')} poToken is too short and might not work (${new Date().toISOString()})`
        );
    }

    return sessionResponse;
};

export const fetchYouTubeSession = async ({
    baseUrl,
    fetchImpl = fetch,
    dispatcher = defaultAgent,
}) => {
    let lastError;

    for (const endpoint of SESSION_ENDPOINTS) {
        const sessionServerUrl = new URL(baseUrl);
        sessionServerUrl.pathname = endpoint.pathname;
        sessionServerUrl.search = "";
        sessionServerUrl.hash = "";

        try {
            const response = await fetchImpl(sessionServerUrl, {
                method: endpoint.method,
                dispatcher,
                headers: {
                    accept: "application/json",
                },
            });

            if (!response.ok) {
                throw new Error(
                    `${endpoint.pathname} returned HTTP ${response.status}`
                );
            }

            const candidate = await response.json();
            return validateYouTubeSession(candidate);
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error("youtube session server did not return a token");
};

const updateSession = (newSession) => {
    session = newSession;
};

const loadSession = async () => {
    const newSession = await fetchYouTubeSession({
        baseUrl: env.ytSessionServer,
    });

    if (!session || session.updated < newSession.updated) {
        cluster.broadcast({ youtube_session: newSession });
        updateSession(newSession);
    }
};

const wrapLoad = (initial = false) => {
    loadSession()
    .then(() => {
        if (initial) {
            console.log(
                `${Green('[✓]')} poToken & visitor_data loaded successfully!`
            );
        }
    })
    .catch((error) => {
        console.error(
            `${Yellow('[!]')} Failed loading poToken & visitor_data at ${new Date().toISOString()}.`
        );
        console.error("Error:", error);
    });
};

export const getYouTubeSession = () => session;

export const setup = () => {
    if (cluster.isPrimary) {
        wrapLoad(true);

        if (env.ytSessionReloadInterval > 0) {
            setInterval(
                wrapLoad,
                env.ytSessionReloadInterval * 1000
            );
        }
    } else if (cluster.isWorker) {
        process.on("message", (message) => {
            if ("youtube_session" in message) {
                updateSession(message.youtube_session);
            }
        });
    }
};
