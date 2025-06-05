const puppeteer = require("puppeteer");

async function seoAnalyzer(url) {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });

  const data = await page.evaluate(() => {
    const getMeta = (name) =>
      document.querySelector(`meta[name="${name}"]`)?.content ||
      document.querySelector(`meta[property="${name}"]`)?.content || null;

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
      const duplicates = {};
      for (let level in headings) {
        const values = headings[level];
        values.forEach((text) => {
          if (duplicates[text]) {
            duplicates[text].push(level);
          } else {
            duplicates[text] = [level];
          }
        });
      }
      return Object.keys(duplicates).filter((key) => duplicates[key].length > 1);
    };

    const checkHierarchy = (headings) => {
      const hierarchyErrors = [];
      const levels = ["h1", "h2", "h3", "h4", "h5", "h6"];
      let lastLevel = 0;
      levels.forEach((level) => {
        if (headings[level].length > 0) {
          const currentLevel = parseInt(level.slice(1));
          if (currentLevel < lastLevel) {
            hierarchyErrors.push(`Encabezado ${level} debe ir después de ${levels[lastLevel - 1]}`);
          }
          lastLevel = currentLevel;
        }
      });
      return hierarchyErrors;
    };

    const headings = getHeadings();
    const duplicates = checkDuplicates(headings);
    const hierarchyErrors = checkHierarchy(headings);

    return {
      title: document.title || null,
      description: getMeta("description"),
      canonical: document.querySelector('link[rel="canonical"]')?.href || null,
      hTags: headings,
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
      images: Array.from(document.querySelectorAll("img"))
        .map((img) => img.src)
        .filter(Boolean),
      links: Array.from(document.querySelectorAll("a"))
        .map((a) => a.href)
        .filter(Boolean),
      seoErrors: {
        duplicates,
        hierarchyErrors,
      },
    };
  });

  await browser.close();
  return data;
}

module.exports = seoAnalyzer;
