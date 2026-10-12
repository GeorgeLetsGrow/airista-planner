// Weekly SEO monitoring settings for airistaflow.com.
// Mirrors seo/config.json from the AiRISTA project so the in-app crawl matches seo_crawl.py.
const env = (name) => globalThis.Netlify?.env?.get?.(name) ?? globalThis.process?.env?.[name] ?? "";

export const SEO = {
  client: "AiRISTA Flow",
  site: (env("SEO_SITE").trim() || "https://www.airistaflow.com").replace(/\/$/, ""),
  skipSitemaps: ["author-sitemap.xml", "post_tag-sitemap.xml"],
  thinOkPatterns: ["/contact", "/thank-you", "/download-", "/events/"],
  thresholds: { titleMin: 30, titleMax: 60, metaMax: 160, thinWords: 300, slowMs: 2500 },
  priorityPages: [
    "https://www.airistaflow.com/healthcare/",
    "https://www.airistaflow.com/healthcare-staff-safety/",
    "https://www.airistaflow.com/software/",
    "https://www.airistaflow.com/products/",
  ],
  siteFiles: ["/robots.txt", "/llms.txt", "/sitemap_index.xml"],
  // The site is behind Cloudflare; faster settings trigger 429 rate limiting.
  delayMs: 1000,
  workers: 2,
  linkSkip: /\?|\/wp-json|\/feed\/?$|\/xmlrpc|\/wp-admin|\/wp-login|\/tag\/|\/author\//,
  timeZone: "America/New_York",
  // Automatic weekly run: Monday from 8am New York time.
  schedule: { weekday: 1, hour: 8 },
};

export const SEV_RANK = { high: 0, medium: 1, low: 2 };

// Severity of every check the crawler can raise (used to classify issues from older snapshots).
export const CHECK_SEV = {
  sitemap_url_not_200: "high", noindex_in_sitemap: "high", missing_title: "high", site_file_missing: "high", broken_internal_link: "high",
  sitemap_url_redirects: "medium", missing_meta_description: "medium", missing_h1: "medium", missing_canonical: "medium",
  canonical_points_elsewhere: "medium", duplicate_title: "medium", duplicate_meta_description: "medium",
  unverified_rate_limited: "low", title_too_long: "low", title_too_short: "low", meta_description_too_long: "low", multiple_h1: "low",
  thin_content: "low", images_missing_alt: "low", slow_response: "low", no_structured_data: "low",
};

export const CHECK_LABEL = {
  sitemap_url_not_200: "Sitemap URL does not return 200", noindex_in_sitemap: "Noindex page in sitemap", missing_title: "Missing title",
  site_file_missing: "Site file missing", broken_internal_link: "Broken internal link", sitemap_url_redirects: "Sitemap URL redirects",
  missing_meta_description: "Missing meta description", missing_h1: "Missing H1", missing_canonical: "Missing canonical",
  canonical_points_elsewhere: "Canonical points elsewhere", duplicate_title: "Duplicate title", duplicate_meta_description: "Duplicate meta description",
  unverified_rate_limited: "Not verified (rate limited)", title_too_long: "Title over 60 characters", title_too_short: "Title under 30 characters",
  meta_description_too_long: "Meta description over 160 characters", multiple_h1: "Multiple H1s", thin_content: "Thin content (under 300 words)",
  images_missing_alt: "Images missing alt text", slow_response: "Slow response (over 2.5s)", no_structured_data: "No structured data",
};

// Today's date in New York, as YYYY-MM-DD.
export function localDate(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SEO.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
export function localParts(d = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: SEO.timeZone, weekday: "short", hour: "numeric", hourCycle: "h23" })
    .formatToParts(d).map((p) => [p.type, p.value]));
  return { weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday), hour: Number(parts.hour) };
}
