import { browser } from "$app/environment";
import { base } from "$app/paths";

const withBase = (path: string) => `${base}${path}`;

const defaultNavPage = (page: "settings" | "about") => {
    if (browser && window.innerWidth <= 750) {
        return `/${page}`;
    }

    switch (page) {
        case "settings":
            return "/settings/appearance";
        case "about":
            return "/about/general";
    }
}

export { defaultNavPage, withBase };
