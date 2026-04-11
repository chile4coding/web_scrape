const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const { URL } = require("url");
const getStructuredResponse = require("./ai");

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const START_URL = "https://support.excellentbridge.com/"; // <-- change this
const MAX_PAGES = 100; // max pages to crawl
const DELAY_MS = 500; // delay between requests (be polite)
const OUTPUT_FILE = "site_data.json";
const SUMMARY_FILE = "site_summary.txt";
// ──────────────────────────────────────────────────────────────────────────────

const visited = new Set();
const results = [];
const queue = [START_URL];
const baseHost = new URL(START_URL).hostname;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeUrl(href, currentUrl) {
  try {
    const url = new URL(href, currentUrl);
    url.hash = ""; // remove fragments
    return url.href;
  } catch {
    return null;
  }
}

function isSameHost(url) {
  try {
    return new URL(url).hostname === baseHost;
  } catch {
    return false;
  }
}

async function crawlPage(url) {
  try {
    const { data, status } = await axios.get(url, {
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NodeCrawler/1.0)",
        Accept: "text/html",
      },
    });

    const $ = cheerio.load(data);

    // ── Extract all content ──────────────────────────────────────────────────
    const pageData = {
      url,
      status,

      // ── Meta & Head ───────────────────────────────────────────────────────
      title: $("title").text().trim(),
      description: $('meta[name="description"]').attr("content") || "",
      keywords: $('meta[name="keywords"]').attr("content") || "",
      author: $('meta[name="author"]').attr("content") || "",
      charset: $("meta[charset]").attr("charset") || "",
      viewport: $('meta[name="viewport"]').attr("content") || "",
      canonical: $('link[rel="canonical"]').attr("href") || "",
      ogTitle: $('meta[property="og:title"]').attr("content") || "",
      ogDescription: $('meta[property="og:description"]').attr("content") || "",
      ogImage: $('meta[property="og:image"]').attr("content") || "",
      ogUrl: $('meta[property="og:url"]').attr("content") || "",
      twitterTitle: $('meta[name="twitter:title"]').attr("content") || "",
      twitterDesc: $('meta[name="twitter:description"]').attr("content") || "",
      twitterImage: $('meta[name="twitter:image"]').attr("content") || "",
      stylesheets: $('link[rel="stylesheet"]')
        .map((_, el) => $(el).attr("href"))
        .get(),
      scripts: $("script[src]")
        .map((_, el) => $(el).attr("src"))
        .get(),
      inlineScripts: $("script:not([src])")
        .map((_, el) => $(el).html()?.trim())
        .get()
        .filter(Boolean),

      // ── Headings ──────────────────────────────────────────────────────────
      h1: $("h1")
        .map((_, el) => $(el).text().trim())
        .get(),
      h2: $("h2")
        .map((_, el) => $(el).text().trim())
        .get(),
      h3: $("h3")
        .map((_, el) => $(el).text().trim())
        .get(),
      h4: $("h4")
        .map((_, el) => $(el).text().trim())
        .get(),
      h5: $("h5")
        .map((_, el) => $(el).text().trim())
        .get(),
      h6: $("h6")
        .map((_, el) => $(el).text().trim())
        .get(),

      // ── Text Content ──────────────────────────────────────────────────────
      paragraphs: $("p")
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(Boolean),
      spans: $("span")
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(Boolean),
      blockquotes: $("blockquote")
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(Boolean),
      preformatted: $("pre")
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(Boolean),
      code: $("code")
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(Boolean),
      bold: $("b, strong")
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(Boolean),
      italic: $("i, em")
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(Boolean),
      underline: $("u")
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(Boolean),
      strikethrough: $("s, strike, del")
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(Boolean),
      mark: $("mark")
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(Boolean),
      abbr: $("abbr")
        .map((_, el) => ({
          text: $(el).text().trim(),
          title: $(el).attr("title") || "",
        }))
        .get(),
      labels: $("label")
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(Boolean),

      // ── Lists ─────────────────────────────────────────────────────────────
      unorderedLists: $("ul")
        .map((_, el) => ({
          items: $(el)
            .find("li")
            .map((_, li) => $(li).text().trim())
            .get(),
        }))
        .get(),
      orderedLists: $("ol")
        .map((_, el) => ({
          items: $(el)
            .find("li")
            .map((_, li) => $(li).text().trim())
            .get(),
        }))
        .get(),
      definitionLists: $("dl")
        .map((_, el) => ({
          terms: $(el)
            .find("dt")
            .map((_, dt) => $(dt).text().trim())
            .get(),
          definitions: $(el)
            .find("dd")
            .map((_, dd) => $(dd).text().trim())
            .get(),
        }))
        .get(),

      // ── Links ─────────────────────────────────────────────────────────────
      links: [], // populated below from <a> tags
      linksFull: $("a[href]")
        .map((_, el) => ({
          text: $(el).text().trim(),
          href: $(el).attr("href"),
          title: $(el).attr("title") || "",
          target: $(el).attr("target") || "",
          rel: $(el).attr("rel") || "",
        }))
        .get(),

      // ── Media ─────────────────────────────────────────────────────────────
      images: $("img")
        .map((_, el) => ({
          src: $(el).attr("src") || "",
          alt: $(el).attr("alt") || "",
          title: $(el).attr("title") || "",
          width: $(el).attr("width") || "",
          height: $(el).attr("height") || "",
        }))
        .get(),
      videos: $("video")
        .map((_, el) => ({
          src:
            $(el).attr("src") || $(el).find("source").first().attr("src") || "",
          poster: $(el).attr("poster") || "",
          controls: $(el).attr("controls") !== undefined,
        }))
        .get(),
      audios: $("audio")
        .map((_, el) => ({
          src:
            $(el).attr("src") || $(el).find("source").first().attr("src") || "",
          controls: $(el).attr("controls") !== undefined,
        }))
        .get(),
      iframes: $("iframe")
        .map((_, el) => ({
          src: $(el).attr("src") || "",
          title: $(el).attr("title") || "",
          width: $(el).attr("width") || "",
          height: $(el).attr("height") || "",
        }))
        .get(),
      svgs: $("svg")
        .map((_, el) => $(el).toString())
        .get(),

      // ── Tables ────────────────────────────────────────────────────────────
      tables: $("table")
        .map((_, table) => ({
          headers: $(table)
            .find("th")
            .map((_, th) => $(th).text().trim())
            .get(),
          rows: $(table)
            .find("tr")
            .map((_, tr) => ({
              cells: $(tr)
                .find("td")
                .map((_, td) => $(td).text().trim())
                .get(),
            }))
            .get()
            .filter((r) => r.cells.length > 0),
        }))
        .get(),

      // ── Forms ─────────────────────────────────────────────────────────────
      forms: $("form")
        .map((_, form) => ({
          action: $(form).attr("action") || "",
          method: $(form).attr("method") || "get",
          inputs: $(form)
            .find("input")
            .map((_, inp) => ({
              type: $(inp).attr("type") || "text",
              name: $(inp).attr("name") || "",
              placeholder: $(inp).attr("placeholder") || "",
              value: $(inp).attr("value") || "",
              required: $(inp).attr("required") !== undefined,
            }))
            .get(),
          selects: $(form)
            .find("select")
            .map((_, sel) => ({
              name: $(sel).attr("name") || "",
              options: $(sel)
                .find("option")
                .map((_, opt) => ({
                  value: $(opt).attr("value") || "",
                  text: $(opt).text().trim(),
                }))
                .get(),
            }))
            .get(),
          textareas: $(form)
            .find("textarea")
            .map((_, ta) => ({
              name: $(ta).attr("name") || "",
              placeholder: $(ta).attr("placeholder") || "",
            }))
            .get(),
          buttons: $(form)
            .find("button")
            .map((_, btn) => ({
              type: $(btn).attr("type") || "submit",
              text: $(btn).text().trim(),
            }))
            .get(),
        }))
        .get(),

      // ── Semantic / Layout ─────────────────────────────────────────────────
      nav: $("nav")
        .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
        .get(),
      header: $("header")
        .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
        .get(),
      footer: $("footer")
        .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
        .get(),
      main: $("main").text().replace(/\s+/g, " ").trim(),
      sections: $("section")
        .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
        .get(),
      articles: $("article")
        .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
        .get(),
      asides: $("aside")
        .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
        .get(),
      divs: $("div[id], div[class]")
        .map((_, el) => ({
          id: $(el).attr("id") || "",
          classes: $(el).attr("class") || "",
          text: $(el).text().replace(/\s+/g, " ").trim().slice(0, 200),
        }))
        .get(),

      // ── Interactive ───────────────────────────────────────────────────────
      buttons: $("button")
        .map((_, el) => ({
          text: $(el).text().trim(),
          type: $(el).attr("type") || "button",
        }))
        .get(),
      details: $("details")
        .map((_, el) => ({
          summary: $(el).find("summary").text().trim(),
          content: $(el)
            .text()
            .replace($(el).find("summary").text(), "")
            .trim(),
        }))
        .get(),

      // ── Raw ───────────────────────────────────────────────────────────────
      rawText: $("body").text().replace(/\s+/g, " ").trim(),
      rawHtml: $.html(),
    };

    // ── Collect & enqueue links ──────────────────────────────────────────────
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      const normalized = normalizeUrl(href, url);

      if (normalized) {
        pageData.links.push(normalized);

        if (isSameHost(normalized) && !visited.has(normalized)) {
          queue.push(normalized);
        }
      }
    });

    return pageData;
  } catch (err) {
    console.error(`  ✗ Failed: ${url} — ${err.message}`);
    return { url, error: err.message };
  }
}

async function run() {
  console.log(`\n🕷  Starting crawl: ${START_URL}`);
  console.log(`   Max pages: ${MAX_PAGES} | Delay: ${DELAY_MS}ms\n`);

  while (queue.length > 0 && visited.size < MAX_PAGES) {
    const url = queue.shift();

    if (visited.has(url) || !isSameHost(url)) continue;
    visited.add(url);

    console.log(`[${visited.size}/${MAX_PAGES}] Crawling: ${url}`);

    const pageData = await crawlPage(url);
    results.push(pageData);

    await sleep(DELAY_MS);
  }

  //    you will need to make API call to AI to make a reasonable summary of the site content

  const summary = await getStructuredResponse(results);
  console.log(summary);

  // ── Save results ─────────────────────────────────────────────────────────
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2), "utf-8");
  fs.writeFileSync(SUMMARY_FILE, summary, "utf-8");

  console.log(`\n✅ Done!`);
  console.log(`   Pages crawled : ${results.length}`);
  console.log(`   Output saved  : ${OUTPUT_FILE}`);
  console.log(`   Summary saved: ${SUMMARY_FILE}`);
}

run();
