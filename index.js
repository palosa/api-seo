const express = require("express");
const cors = require("cors");
const puppeteer = require("puppeteer");

const app = express();
app.use(cors());
app.use(express.json());

// Caché simple en memoria con tiempo de expiración
const cache = {};
const CACHE_TTL = 3600000;  // 1 hora (en milisegundos)

const jobQueue = [];  // Cola de trabajos

// Validación de URL
function isValidURL(url) {
  return /^(ftp|http|https):\/\/[^ "]+$/.test(url);
}

// Analizar SEO de la URL
async function analyzeSEO(url) {
  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });

    const data = await page.evaluate(() => {
      const getMeta = (name) =>
        document.querySelector(`meta[name="${name}"]`)?.content ||
        document.querySelector(`meta[property="${name}"]`)?.content ||
        null;

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

      // Verificar duplicados en los encabezados
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

      // Verificar la jerarquía de los encabezados
      const checkHierarchy = (headings) => {
        const hierarchyErrors = [];
        const levels = ["h1", "h2", "h3", "h4", "h5", "h6"];
        let lastLevel = 0; // El último encabezado válido
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

        // Open Graph
        og: {
          title: getMeta("og:title"),
          description: getMeta("og:description"),
          image: getMeta("og:image"),
          url: getMeta("og:url"),
        },

        // Twitter Cards
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

        // Errores
        seoErrors: {
          duplicates,
          hierarchyErrors,
        },
      };
    });

    await browser.close();
    return data;
  } catch (err) {
    throw new Error("Error al analizar el sitio: " + err.message);
  }
}

// Procesar solicitudes desde la cola
async function processQueue() {
  while (jobQueue.length > 0) {
    const job = jobQueue.shift();
    const { url, res } = job;

    try {
      const start = Date.now();
      const data = await analyzeSEO(url);

      // Medir el tiempo de carga
      const loadTime = Date.now() - start;
      data.loadTime = loadTime;

      // Guardar en caché
      cache[url] = { data, timestamp: Date.now() };

      res.json({ ok: true, data });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  }
}

// Endpoint de análisis SEO
app.get("/analyze", async (req, res) => {
  const { url } = req.query;

  // Validar URL
  if (!url || !isValidURL(url)) {
    return res.status(400).json({ ok: false, error: "URL inválida o no proporcionada" });
  }

  // Verificar si el URL está en caché y no ha expirado
  if (cache[url] && Date.now() - cache[url].timestamp < CACHE_TTL) {
    return res.json({ ok: true, data: cache[url].data }); // Devolver desde la caché
  }

  // Agregar solicitud a la cola
  jobQueue.push({ url, res });
  processQueue(); // Procesar la cola
});

// Iniciar el servidor
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 API SEO corriendo en http://localhost:${PORT}`);
});