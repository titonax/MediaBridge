export const buildCustomInnertubeClient = ({
    client,
    context,
    supportedClients,
}) => {
    if (
        !client
        || !context
        || supportedClients.includes(client)
    ) {
        return;
    }

    return {
        clientName: client,
        ...context,
    };
};

export const mergeInnertubeClientContext = (
    baseContext,
    customClient
) => {
    if (!customClient) return baseContext;

    return {
        ...baseContext,
        client: {
            ...baseContext.client,
            ...customClient,
        },
    };
};

export const needsYouTubePlayer = ({
    format,
    customClient,
    client,
    noCipherClients,
}) => (
    customClient
        ? !format?.url
        : !noCipherClients.includes(client)
);
