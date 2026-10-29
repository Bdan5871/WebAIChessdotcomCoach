import "dotenv/config";
import express from "express";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = 3000;

if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY in your .env file.");
}

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

app.use(express.json({ limit: "1mb" }));

app.use(express.static("public"));



app.post("/api/coach", async (req, res) => {
    const { prompt } = req.body;

    if (typeof prompt !== "string" || !prompt.trim()) {
        return res.status(400).json({
            error: "A coaching prompt is required."
        });
    }

    try {
        const result = await ai.models.generateContent({
            model: "gemini-3.5-flash-lite",
            contents: prompt
        });

        return res.json({
            analysis: result.text
        });

    } catch (error) {
        const status = Number(error.status);

        console.error("Gemini API error details:", {
            message: error.message,
            status: error.status,
            statusCode: error.statusCode,
            details: error.errorDetails
        });

        if (status === 429) {
            return res.status(429).json({
                error: "Gemini API quota exceeded. Please wait for your quota to reset or check your API plan and billing."
            });
        }

        if (status === 503 || status >= 500) {
            return res.status(503).json({
                error: "Gemini is temporarily unavailable. Please try again later."
            });
        }

        return res.status(500).json({
            error: "Gemini could not generate the coaching report."
        });
    }
});

app.listen(PORT, () => {
    console.log(`Chess coach running at http://localhost:${PORT}`);
});