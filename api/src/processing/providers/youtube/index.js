import { invidiousProvider } from "./invidious.js";

const alternateProviders = [
    invidiousProvider,
];

export const resolveAlternateYouTubeInfo = async (options) => {
    for (const provider of alternateProviders) {
        const result = await provider.resolve(options);

        if (result?.info) {
            return result;
        }
    }
};
