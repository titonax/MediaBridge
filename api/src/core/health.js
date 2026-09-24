const DEFAULT_SERVICE = "mediabridge-api";

export const createHealthPayload = ({
    version,
    git,
    startTimestamp,
    now = Date.now(),
}) => ({
    status: "ok",
    service: DEFAULT_SERVICE,
    version,
    uptimeSeconds: Math.max(
        0,
        Math.floor((now - startTimestamp) / 1000)
    ),
    git: {
        branch: git?.branch,
        commit: git?.commit,
    },
});

export const registerHealthRoute = (
    app,
    { version, git, startTimestamp }
) => {
    app.get("/healthz", (_, res) => {
        res.status(200).json(
            createHealthPayload({
                version,
                git,
                startTimestamp,
            })
        );
    });
};
