const express = require("express");
const router = express.Router();
const seoAnalyzer = require("../services/seoAnalyzer");
const fetch = require("undici").fetch;

const GOOGLE_API_KEY = process.env.PAGESPEED_API_KEY || "";

router.get("/", async (req, res) => {
  const { url } = req.query;

  if (!url || !url.startsWith("http")) {
    return res.status(400).json({ ok: false, error: "URL inválida o no proporcionada" });
  }

  try {
    // Ejecutar análisis SEO local
    const seoData = await seoAnalyzer(url);

    // Llamar API Google PageSpeed Insights
    let pageSpeedData = null;
    if (GOOGLE_API_KEY) {
      const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${GOOGLE_API_KEY}`;

      const response = await fetch(apiUrl);
      if (response.ok) {
        const json = await response.json();
        pageSpeedData = json.lighthouseResult.categories;
      }
    }

    // Combinar resultados y enviar
    res.json({
      ok: true,
      data: {
        seoReport: seoData,
        pageSpeed: pageSpeedData,
      },
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: "Error al analizar el sitio",
      details: err.message,
    });
  }
});

module.exports = router;
