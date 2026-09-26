import { ytdlpProvider } from "./ytdlp.js";
import { invidiousProvider } from "./invidious.js";
import { pipedProvider } from "./piped.js";

const alternateProviders = [
    ytdlpProvider,
    invidiousProvider,
    pipedProvider,
];

export const resolveAlternateYouTubeInfo = async (options) => {
    for (const provider of alternateProviders) {
        const result = await provider.resolve({
            ...options,
            instances: options.providerInstances?.[provider.name],
        });

        if (result?.info) {
            return result;
        }
    }
};
