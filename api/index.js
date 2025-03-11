require("dotenv").config();
console.log("✅ GEMINI_API_KEY:", process.env.GEMINI_API_KEY ? "Loaded" : "Not Found");

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");
const Fuse = require("fuse.js");
const path = require("path");

const app = express();
app.use(express.json());
app.use(cors());

console.log("✅ Google Gemini API Key Loaded Successfully!");

// Load Knowledge Base using __dirname
const kbPath = path.join(__dirname, "../knowledge_base.json");

let knowledgeBase = { knowledge_base: [] };

try {
    if (fs.existsSync(kbPath)) {
        knowledgeBase = JSON.parse(fs.readFileSync(kbPath, "utf8"));
        console.log("✅ Knowledge Base Loaded Successfully!");
    } else {
        console.error("❌ ERROR: knowledge_base.json file is missing!");
    }
} catch (error) {
    console.error("❌ ERROR: Could not load knowledge_base.json", error);
}

// Set up Fuzzy Search (assuming each question object has "question" and "answer")
const fuseOptions = {
    keys: ["question"],
    threshold: 0.3,
};
const allQuestions = knowledgeBase.knowledge_base.flatMap(cat => cat.questions);
const fuse = new Fuse(allQuestions, fuseOptions);

// Root Route
app.get("/", (req, res) => {
    res.send("✅ OpenAI Chatbot Backend is Running!");
  });
  
// Fix for `/api/`
app.get("/api", (req, res) => {
    res.send("✅ API is working correctly!");
});

// Fix `/favicon.ico` Errors
app.get("/favicon.ico", (req, res) => {
    res.status(204).end();
});

// Chatbot API
app.post("/api/message", async (req, res) => {
    console.log("🔍 Incoming Request:", req.body);

    if (!req.body.message) {
        return res.status(400).json({ error: "Message is required" });
    }

    const userQuery = req.body.message;

    console.log("🔍 Searching Knowledge Base...");
    let kbAnswer = fuse ? fuse.search(userQuery)[0]?.item.answer : null;

    if (kbAnswer) {
        console.log("✅ Answer Found in Knowledge Base!");
        return res.json({ message: kbAnswer });
    }

    console.log("❌ No Match in Knowledge Base. Calling Gemini API...");

    try {
        const kbText = knowledgeBase.knowledge_base
            .flatMap(cat => cat.questions.map(q => `${q.question}: ${q.answer}`))
            .join("\n");

        const prompt = `
You are an AI assistant. Use the following knowledge base (KB) to answer questions. 
If the KB contains relevant information, use it. If not, generate a response based on general knowledge.

Knowledge Base:
${kbText}

User Question: ${userQuery}
        `;

        console.log("⏳ Sending Request to Gemini API...");
        const startTime = Date.now();

        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
            { 
                contents: [{ role: "user", parts: [{ text: prompt }] }], 
                generationConfig: { maxOutputTokens: 100 }
            },
            { 
                headers: { "Content-Type": "application/json" },
                timeout: 10000  // 10 seconds timeout for axios
            }
        );

        const duration = Date.now() - startTime;
        console.log(`✅ Gemini API Response Received in ${duration} ms`, JSON.stringify(response.data, null, 2));

        const aiMessage = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response from Gemini.";
        return res.json({ message: aiMessage });

    } catch (error) {
        console.error("❌ ERROR: Gemini API Request Failed!", error.response?.data || error.message);
        return res.status(500).json({ 
            error: "Failed to fetch response from Gemini AI", 
            details: error.response?.data || error.message
        });
    }
});

module.exports = app;


const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
});
