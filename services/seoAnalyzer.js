const puppeteer = require("puppeteer");

async function seoAnalyzer(url) {
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    const performance = {
      totalBytes: 0,
      resourceCounts: {},
      timing: {},
    };

    await page.setRequestInterception(true);
    page.on("request", (req) => req.continue());
    page.on("response", async (res) => {
      try {
        const buffer = await res.buffer();
        const size = buffer.length;
        performance.totalBytes += size;

        const type = res.request().resourceType();
        if (!performance.resourceCounts[type]) performance.resourceCounts[type] = { count: 0, size: 0 };
        performance.resourceCounts[type].count++;
        performance.resourceCounts[type].size += size;
      } catch (_) {}
    });

    const start = Date.now();
    const response = await page.goto(url, { waitUntil: "load", timeout: 30000 });
    const loadEnd = Date.now();

    performance.timing.load = loadEnd - start;

    const domContentLoaded = await page.evaluate(() => performance.timing.domContentLoaded);
    performance.timing.domContentLoaded = domContentLoaded || null;

    const status = response.status();

    const data = await page.evaluate(() => {
      const getMeta = (name) =>
        document.querySelector(`meta[name="${name}"]`)?.content ||
        document.querySelector(`meta[property="${name}"]`)?.content ||
        null;

      const getCharset = () =>
        document.characterSet || document.querySelector("meta[charset]")?.getAttribute("charset") || null;

      const getHeadings = () => {
        const result = {};
        for (let i = 1; i <= 6; i++) {
          const tag = `h${i}`;
          result[tag] = Array.from(document.querySelectorAll(tag))
            .map((el) => el.innerText.trim())
            .filter(Boolean);
        }
        return result;
      };

      const checkDuplicates = (headings) => {
        const textMap = {};
        const duplicates = [];
        for (const level in headings) {
          for (const text of headings[level]) {
            if (!textMap[text]) {
              textMap[text] = new Set();
            }
            textMap[text].add(level);
          }
        }
        for (const text in textMap) {
          if (textMap[text].size > 1) {
            duplicates.push({ text, levels: Array.from(textMap[text]) });
          }
        }
        return duplicates;
      };

      const checkHierarchy = (headings) => {
        const errors = [];
        const order = ["h1", "h2", "h3", "h4", "h5", "h6"];
        let lastIndex = -1;
        for (let i = 0; i < order.length; i++) {
          if (headings[order[i]].length > 0) {
            if (i > lastIndex + 1) {
              errors.push(`Encabezado ${order[i]} mal posicionado después de ${order[lastIndex]}`);
            }
            lastIndex = i;
          }
        }
        return errors;
      };

      const images = Array.from(document.querySelectorAll("img"));
      const imagesWithoutAlt = images.filter((img) => !img.alt || img.alt.trim() === "");

      const textLength = document.body.innerText.trim().length;

      const links = Array.from(document.querySelectorAll("a")).map((a) => ({
        href: a.href,
        text: a.innerText.trim(),
        rel: a.rel,
        isInternal: a.hostname === location.hostname,
      }));

      const schemas = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map((s) => {
        try {
          return JSON.parse(s.innerText);
        } catch {
          return null;
        }
      }).filter(Boolean);

      const headings = getHeadings();

      return {
        title: document.title,
        description: getMeta("description"),
        canonical: document.querySelector('link[rel="canonical"]')?.href || null,
        robots: getMeta("robots"),
        viewport: getMeta("viewport"),
        charset: getCharset(),
        og: {
          title: getMeta("og:title"),
          description: getMeta("og:description"),
          image: getMeta("og:image"),
          url: getMeta("og:url"),
        },
        twitter: {
          card: getMeta("twitter:card"),
          title: getMeta("twitter:title"),
          description: getMeta("twitter:description"),
          image: getMeta("twitter:image"),
        },
        hTags: headings,
        seoErrors: {
          duplicates: checkDuplicates(headings),
          hierarchyErrors: checkHierarchy(headings),
          imagesWithoutAlt: imagesWithoutAlt.length,
        },
        imagesCount: images.length,
        imagesWithoutAltList: imagesWithoutAlt.map((img) => img.src),
        linksCount: links.length,
        links,
        textLength,
        schemas,
      };
    });

    const checkBrokenLinks = async (links) => {
      const broken = [];
      const internal = [];
      const external = [];
      const uniqueLinks = [...new Set(links.map((l) => l.href))].filter((href) => href.startsWith("http"));

      await Promise.allSettled(
        uniqueLinks.map(async (href) => {
          try {
            const res = await fetch(href, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
            const entry = { url: href, status: res.status };
            if (!res.ok) broken.push(entry);
            if (new URL(href).hostname === new URL(url).hostname) {
              internal.push(entry);
            } else {
              external.push(entry);
            }
          } catch (err) {
            const entry = { url: href, status: "Request Failed" };
            broken.push(entry);
            if (new URL(href).hostname === new URL(url).hostname) {
              internal.push(entry);
            } else {
              external.push(entry);
            }
          }
        })
      );

      return { broken, internal, external };
    };

    data.linkStats = await checkBrokenLinks(data.links);

    return { url, status, ...data, performance };
  } catch (error) {
    return { url, error: error.message };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = seoAnalyzer;

// USO EJEMPLO
// (async () => {
//   const report = await seoAnalyzer("https://example.com");
//   console.log(JSON.stringify(report, null, 2));
// })();
