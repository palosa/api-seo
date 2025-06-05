const express = require("express");
const cors = require("cors");
const analyzeRoute = require("./routes/analyze");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/analyze", analyzeRoute);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 API SEO corriendo en http://localhost:${PORT}`);
});
