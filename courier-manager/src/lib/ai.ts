/**
 * AI Analysis Service for parsing unstructured task text using DeepSeek API
 * 
 * This service analyzes text from Messenger and extracts structured task data.
 * It identifies: recipient name, address, phone, delivery time, task type, etc.
 */

interface AiAnalysisResult {
  taskType: 'regular' | 'warehouse_pickup' | 'courier_call';
  recipientName: string;
  recipientPhone?: string;
  deliveryAddress: string;
  recipientAddress?: string;
  deliveryTimeFrom?: string;
  deliveryTimeTo?: string;
  packageDescription?: string;
  specialInstructions?: string;
  confidence: number; // 0-1, how confident the AI is in the extraction
}

const DEEPSEEK_API_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY || '';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

/**
 * Analyze unstructured task text using DeepSeek API
 * Extracts key information like recipient, address, phone, delivery time, etc.
 */
export async function analyzeTaskText(text: string): Promise<AiAnalysisResult> {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('DeepSeek API key not configured');
  }

  const systemPrompt = `You are a task extraction AI. Analyze the provided text and extract delivery task information.
Return a JSON object with the following structure:
{
  "taskType": "regular" | "warehouse_pickup" | "courier_call",
  "recipientName": "string",
  "recipientPhone": "string or null",
  "deliveryAddress": "string",
  "recipientAddress": "string or null (apartment/office details)",
  "deliveryTimeFrom": "HH:MM or null",
  "deliveryTimeTo": "HH:MM or null",
  "packageDescription": "string or null",
  "specialInstructions": "string or null",
  "confidence": 0.0 to 1.0
}

Rules:
- Extract recipient name, phone, and delivery address (required)
- Try to parse delivery time window (e.g., "14:00-18:00")
- Identify task type from context (regular delivery, warehouse pickup, courier call)
- Set confidence based on how clear the information is
- Return ONLY valid JSON, no other text`;

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: `Analyze this task text and extract information:\n\n${text}`,
          },
        ],
        temperature: 0.3, // Lower temperature for more consistent extraction
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No response from DeepSeek API');
    }

    // Parse JSON response
    const result = JSON.parse(content) as AiAnalysisResult;

    // Validate required fields
    if (!result.recipientName || !result.deliveryAddress) {
      throw new Error('Missing required fields in AI response');
    }

    return result;
  } catch (error) {
    console.error('Error analyzing task text:', error);
    throw error;
  }
}

/**
 * Format time string to HH:MM format
 * Handles various formats like "14:00", "2pm", "14", etc.
 */
export function formatTime(timeStr?: string): string | undefined {
  if (!timeStr) return undefined;

  // Already in HH:MM format
  if (/^\d{2}:\d{2}$/.test(timeStr)) {
    return timeStr;
  }

  // Try to parse various formats
  const match = timeStr.match(/(\d{1,2}):?(\d{2})?/);
  if (match) {
    const hours = parseInt(match[1]);
    const minutes = match[2] ? parseInt(match[2]) : 0;

    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  }

  return undefined;
}
