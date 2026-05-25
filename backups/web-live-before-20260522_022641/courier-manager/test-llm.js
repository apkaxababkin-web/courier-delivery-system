import { invokeLLM } from "./server/_core/llm.ts";

async function testLLM() {
  try {
    console.log("Testing LLM...");
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant. Return a JSON object with a test field.",
        },
        {
          role: "user",
          content: "Return this JSON: {\"test\": \"success\"}",
        },
      ],
    });
    
    console.log("LLM Response:", JSON.stringify(response, null, 2));
  } catch (error) {
    console.error("Error:", error);
  }
}

testLLM();
