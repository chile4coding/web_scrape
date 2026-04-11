require("dotenv").config();

const Groq = require("groq-sdk");
const { marked } = require("marked");

const client = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const personality = `You are an expert web analyst. Analyze the scraped website data provided and:
1. Provide a concise summary of what the website is about
2. Extract key information: title, main topics, purpose, target audience
3. Identify important links, forms, and interactive elements
4. Note any notable design or content patterns
5. Return structured, meaningful insights from the raw crawl data
IMPORTANT: Return your response in markdown format with headings (##), bullet points (-), bold (**text**), and proper formatting.`;

async function getSUmmary(siteData, maxChars = 200) {
  const trimmedData = JSON.stringify(siteData).slice(0, maxChars);
  const messages = [
    {
      role: "user",
      content: `Analyze this scraped website data and provide meaningful insights:\n\n${trimmedData}`,
    },
  ];

  const response = await client.chat.completions.create({
    model: "openai/gpt-oss-120b",
    messages: [{ role: "system", content: personality }, ...messages],
    temperature: 0.7,
    max_completion_tokens: 4096,
    top_p: 1,
    stream: false,
  });

  return response.choices[0].message.content;
}

module.exports = getSUmmary;
