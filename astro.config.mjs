// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";

import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
	site: "https://example.com",
	output: "server",
	integrations: [mdx(), sitemap(), react(), tailwind()],
	adapter: cloudflare({
		platformProxy: {
			enabled: true,
		},
	}),
});
