const express = require("express");
const router = express.Router();
const seoAnalyzer = require("../services/seoAnalyzer");

router.get("/", async (req, res) => {
  const { url } = req.query;

  if (!url || !url.startsWith("http")) {
    return res.status(400).json({ ok: false, error: "URL inválida o no proporcionada" });
  }

  try {
    const data = await seoAnalyzer(url);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: "Error al analizar el sitio",
      details: err.message,
    });
  }
});

module.exports = router;
